import { ipcMain, dialog, protocol, net, BrowserWindow } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gitService } from './git/gitService'
import { gitlabClient, type GitLabSettings, type MrFormCache } from './gitlab/gitlabClient'
import { pluginRegistry } from './plugin/registry'
import { projectStore } from './store/projectStore'
import { settingsStore, DEFAULT_TEXT_WHITELIST } from './store/settingsStore'
import { promises as fs } from 'node:fs'

const PLUGIN_SCHEME = 'devdash-plugin'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function registerPluginProtocol(): void {
  protocol.handle(PLUGIN_SCHEME, async (request) => {
    try {
      // devdash-plugin://<plugin-id>/<relative-path>
      const url = new URL(request.url)
      const pluginId = decodeURIComponent(url.hostname || url.pathname.split('/')[1] || '')
      // On Windows, URL may parse as host empty and path /id/...
      let id = pluginId
      let rel = url.pathname
      if (!id) {
        const parts = url.pathname.replace(/^\//, '').split('/')
        id = parts.shift() ?? ''
        rel = '/' + parts.join('/')
      } else {
        rel = url.pathname
      }
      const meta = pluginRegistry.byId(id)
      if (!meta) return new Response('plugin not found', { status: 404 })
      const relPath = decodeURIComponent(rel).replace(/^\/+/, '')
      const rootResolved = path.resolve(meta.rootDir)
      const target = path.resolve(rootResolved, relPath)
      const relCheck = path.relative(rootResolved, target)
      if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
        return new Response('forbidden', { status: 403 })
      }
      await fs.access(target)
      return net.fetch(pathToFileURL(target).toString())
    } catch (error) {
      return new Response(`error: ${(error as Error).message}`, { status: 500 })
    }
  })
}

export function registerIpc(): void {
  ipcMain.handle('plugin:list', async () => {
    const list = await pluginRegistry.discover()
    for (const meta of list) {
      await pluginRegistry.loadMain(meta)
    }
    return list.map((m) => ({
      id: m.id,
      title: m.title,
      icon: m.icon,
      order: m.order,
      packageName: m.packageName,
      // renderer loads ESM through custom protocol
      uiUrl: `${PLUGIN_SCHEME}://${m.id}/${path.relative(m.rootDir, m.uiEntry).replace(/\\/g, '/')}`
    }))
  })

  ipcMain.handle('fs:pick-directory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('settings:get', async () => {
    const s = await settingsStore.get()
    return { ...s, defaultWhitelist: DEFAULT_TEXT_WHITELIST }
  })
  ipcMain.handle('settings:save', (_e, partial: { textWhitelist?: string[]; maxFileSizeMb?: number }) =>
    settingsStore.save(partial ?? {})
  )
  ipcMain.handle('settings:add-whitelist-ext', (_e, ext: string) => settingsStore.addWhitelistExt(ext))

  /** Probe a file for open policy (whitelist / size / binary). */
  ipcMain.handle('fs:probe-file', async (_e, filePath: string) => {
    const abs = path.resolve(filePath)
    const settings = await settingsStore.get()
    const ext = path.extname(abs).replace(/^\./, '').toLowerCase()
    const base = path.basename(abs).toLowerCase()
    let stat: import('node:fs').Stats
    try {
      stat = await fs.stat(abs)
    } catch {
      return {
        path: abs,
        exists: false,
        size: 0,
        ext,
        whitelisted: false,
        tooLarge: false,
        binary: false,
        maxFileSizeMb: settings.maxFileSizeMb
      }
    }
    if (!stat.isFile()) {
      return {
        path: abs,
        exists: false,
        size: 0,
        ext,
        whitelisted: false,
        tooLarge: false,
        binary: true,
        maxFileSizeMb: settings.maxFileSizeMb
      }
    }
    const maxBytes = settings.maxFileSizeMb * 1024 * 1024
    // Detect binary via NUL in first 8KB
    let binary = false
    try {
      const fd = await fs.open(abs, 'r')
      try {
        const buf = Buffer.alloc(8192)
        const { bytesRead } = await fd.read(buf, 0, 8192, 0)
        binary = buf.subarray(0, bytesRead).includes(0)
      } finally {
        await fd.close()
      }
    } catch {
      binary = false
    }
    const whitelisted =
      settings.textWhitelist.includes(ext) ||
      settings.textWhitelist.includes(base) ||
      (base === 'dockerfile' || base.startsWith('dockerfile.'))
    return {
      path: abs,
      exists: true,
      size: stat.size,
      ext,
      whitelisted,
      tooLarge: stat.size > maxBytes,
      binary,
      maxFileSizeMb: settings.maxFileSizeMb
    }
  })

  ipcMain.handle(
    'fs:read-text-file',
    async (
      _e,
      filePath: string,
      opts?: { force?: boolean; maxFileSizeMb?: number }
    ) => {
      const abs = path.resolve(filePath)
      const settings = await settingsStore.get()
      const maxMb = opts?.maxFileSizeMb ?? settings.maxFileSizeMb
      const maxBytes = maxMb * 1024 * 1024
      await fs.access(abs)
      const stat = await fs.stat(abs)
      if (!stat.isFile()) throw new Error('不是文件')
      if (!opts?.force && stat.size > maxBytes) {
        throw new Error(`文件过大（${formatSize(stat.size)} > ${maxMb}MB），可强制打开`)
      }
      if (stat.size > 200 * 1024 * 1024) {
        throw new Error(`文件过大（${formatSize(stat.size)}），已拒绝读取`)
      }
      return fs.readFile(abs, 'utf8')
    }
  )

  ipcMain.handle('git:find-repos', (_e, root: string, maxDepth?: number) => gitService.findRepos(root, maxDepth ?? 3))
  ipcMain.handle('git:repo-info', (_e, repoPath: string) => gitService.getRepoInfo(repoPath))
  ipcMain.handle('git:status', (_e, repoPath: string) => gitService.status(repoPath))
  ipcMain.handle('git:list-files', (_e, repoPath: string) => gitService.listFiles(repoPath))
  ipcMain.handle('git:branches', (_e, repoPath: string) => gitService.listBranches(repoPath))
  ipcMain.handle('git:checkout', (_e, repoPath: string, branch: string) => gitService.checkout(repoPath, branch))
  ipcMain.handle('git:log', (_e, repoPath: string, limit?: number, skip?: number) =>
    gitService.log(repoPath, limit ?? 50, skip ?? 0)
  )
  ipcMain.handle('git:diff-files', (_e, repoPath: string, range?: string) => gitService.diffFiles(repoPath, range))
  ipcMain.handle('git:working-diff-files', (_e, repoPath: string) => gitService.workingDiffFiles(repoPath))
  ipcMain.handle('git:diff-file-patch', (_e, repoPath: string, filePath: string, range?: string) =>
    gitService.diffFilePatch(repoPath, filePath, range)
  )
  ipcMain.handle('git:commit-files', (_e, repoPath: string, commitHash: string) =>
    gitService.commitFiles(repoPath, commitHash)
  )
  ipcMain.handle('git:file-at-ref', (_e, repoPath: string, ref: string, filePath: string) =>
    gitService.fileAtRef(repoPath, ref, filePath)
  )

  ipcMain.handle('gitlab:settings:get', () => gitlabClient.getSettings())
  ipcMain.handle('gitlab:settings:save', (_e, settings: GitLabSettings) => gitlabClient.saveSettings(settings))
  ipcMain.handle('gitlab:members', async (_e, settings: GitLabSettings) => gitlabClient.listMembers(settings))
  ipcMain.handle(
    'gitlab:create-mr',
    (
      _e,
      settings: GitLabSettings,
      payload: {
        source_branch: string
        target_branch: string
        title: string
        description?: string
        assignee_ids?: number[]
        reviewer_ids?: number[]
      }
    ) => gitlabClient.createMergeRequest(settings, payload)
  )

  ipcMain.handle('mr-config:get', (_e, repoPath: string) => gitlabClient.getMrCache(repoPath))
  ipcMain.handle('mr-config:save', (_e, repoPath: string, cache: MrFormCache) => gitlabClient.saveMrCache(repoPath, cache))

  ipcMain.handle('store:read', (_e, projectPath: string) => projectStore.read(projectPath))
  ipcMain.handle('store:write', (_e, projectPath: string, state: Record<string, unknown>) =>
    projectStore.write(projectPath, state)
  )
  ipcMain.handle('store:patch', (_e, projectPath: string, partial: Record<string, unknown>) =>
    projectStore.patch(projectPath, partial)
  )
}
