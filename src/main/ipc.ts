import { ipcMain, dialog, protocol, net, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginRegistry } from './plugin/registry'
import { projectStore } from './store/projectStore'
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

interface OpenPolicy {
  textWhitelist?: string[]
  maxFileSizeMb?: number
}

const DEFAULT_MAX_FILE_MB = 10
const HARD_MAX_READ_BYTES = 200 * 1024 * 1024

function matchWhitelist(abs: string, whitelist: string[]): boolean {
  const ext = path.extname(abs).replace(/^\./, '').toLowerCase()
  const base = path.basename(abs).toLowerCase()
  const baseNoDot = base.replace(/^\./, '')
  const wl = whitelist.map((s) => s.toLowerCase())
  return (
    wl.includes(ext) ||
    wl.includes(base) ||
    wl.includes(baseNoDot) ||
    base === 'dockerfile' ||
    base.startsWith('dockerfile.') ||
    baseNoDot === 'gitignore' ||
    baseNoDot === 'gitattributes'
  )
}

export function registerIpc(): void {
  ipcMain.handle('plugin:list', async () => {
    const list = await pluginRegistry.discover()
    await pluginRegistry.loadAllMains()
    return list.map((m) => ({
      id: m.id,
      title: m.title,
      icon: m.icon,
      order: m.order,
      home: m.home,
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

  ipcMain.handle('shell:open-path', async (_e, p: string) => {
    await shell.openPath(p)
  })

  ipcMain.handle('shell:open-external', async (_e, p: string) => {
    if (!/^https?:\/\//i.test(p)) {
      throw new Error('仅允许打开 http(s) 链接')
    }
    await shell.openExternal(p)
  })

  ipcMain.handle('shell:show-in-folder', async (_e, p: string) => {
    shell.showItemInFolder(p)
  })

  /** Probe a file for open policy. Whitelist / size policy is caller-supplied. */
  ipcMain.handle('fs:probe-file', async (_e, filePath: string, policy?: OpenPolicy) => {
    const abs = path.resolve(filePath)
    const maxFileSizeMb = policy?.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB
    const whitelist = policy?.textWhitelist ?? []
    const ext = path.extname(abs).replace(/^\./, '').toLowerCase()
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
        maxFileSizeMb
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
        maxFileSizeMb
      }
    }
    const maxBytes = maxFileSizeMb * 1024 * 1024
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
    return {
      path: abs,
      exists: true,
      size: stat.size,
      ext,
      whitelisted: matchWhitelist(abs, whitelist),
      tooLarge: stat.size > maxBytes,
      binary,
      maxFileSizeMb
    }
  })

  ipcMain.handle(
    'fs:read-text-file',
    async (_e, filePath: string, opts?: { force?: boolean; maxFileSizeMb?: number }) => {
      const abs = path.resolve(filePath)
      const maxMb = opts?.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB
      const maxBytes = maxMb * 1024 * 1024
      await fs.access(abs)
      const stat = await fs.stat(abs)
      if (!stat.isFile()) throw new Error('不是文件')
      if (!opts?.force && stat.size > maxBytes) {
        throw new Error(`文件过大（${formatSize(stat.size)} > ${maxMb}MB），可强制打开`)
      }
      if (stat.size > HARD_MAX_READ_BYTES) {
        throw new Error(`文件过大（${formatSize(stat.size)}），已拒绝读取`)
      }
      return fs.readFile(abs, 'utf8')
    }
  )

  ipcMain.handle('store:read', (_e, projectPath: string) => projectStore.read(projectPath))
  ipcMain.handle('store:write', (_e, projectPath: string, state: Record<string, unknown>) =>
    projectStore.write(projectPath, state)
  )
  ipcMain.handle('store:patch', (_e, projectPath: string, partial: Record<string, unknown>) =>
    projectStore.patch(projectPath, partial)
  )
}
