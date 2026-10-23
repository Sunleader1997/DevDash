import type {
  GitLabDefaults,
  GitLabRepoConfig,
  GitLabSettings,
  MrFormCache
} from './gitlab/gitlabClient'
import { gitService } from './git/gitService'
import { normalizeProjectRef } from './gitlab/projectRef'
import {
  gitlabClient,
  setUserDataDir as setGitlabUserDataDir
} from './gitlab/gitlabClient'
import {
  settingsStore,
  DEFAULT_TEXT_WHITELIST,
  setUserDataDir as setSettingsUserDataDir
} from './store/settingsStore'
import { repoWatcherRegistry } from './git/repoWatcher'

export interface PluginMainContext {
  appPath: string
  userDataPath: string
  registerIpc: (suffix: string, handler: (...args: unknown[]) => Promise<unknown>) => void
}

export default {
  id: 'git-manager',
  async activate(ctx: PluginMainContext): Promise<void> {
    setGitlabUserDataDir(ctx.userDataPath)
    setSettingsUserDataDir(ctx.userDataPath)

    const r = ctx.registerIpc.bind(ctx)

    r('git:find-repos', async (root, maxDepth) =>
      gitService.findRepos(root as string, (maxDepth as number | undefined) ?? 3)
    )
    r('git:repo-info', async (repoPath) => gitService.getRepoInfo(repoPath as string))
    r('git:status', async (repoPath) => gitService.status(repoPath as string))
    r('git:list-files', async (repoPath) => gitService.listFiles(repoPath as string))
    r('git:add', async (repoPath, paths) => gitService.addPaths(repoPath as string, paths as string[]))
    r('git:ignore', async (repoPath, paths) => gitService.ignorePaths(repoPath as string, paths as string[]))
    r('git:revert', async (repoPath, paths) => gitService.revertPaths(repoPath as string, paths as string[]))
    r('git:remote-url', async (repoPath, remote) =>
      gitService.remoteUrl(repoPath as string, (remote as string | undefined) ?? 'origin')
    )
    r('git:commit', async (repoPath, message, paths) =>
      gitService.commit(repoPath as string, message as string, paths as string[] | undefined)
    )
    r('git:push', async (repoPath, remote, ref) =>
      gitService.push(repoPath as string, (remote as string | undefined) ?? 'origin', ref as string | undefined)
    )
    r('git:pull', async (repoPath, remote, branch) =>
      gitService.pull(repoPath as string, (remote as string | undefined) ?? 'origin', branch as string | undefined)
    )
    r('git:unpushed', async (repoPath) => gitService.unpushedCommits(repoPath as string))
    r('git:branches', async (repoPath) => gitService.listBranches(repoPath as string))
    r('git:checkout', async (repoPath, branch) => gitService.checkout(repoPath as string, branch as string))
    r('git:log', async (repoPath, limit, skip) =>
      gitService.log(repoPath as string, (limit as number | undefined) ?? 50, (skip as number | undefined) ?? 0)
    )
    r('git:diff-files', async (repoPath, range) =>
      gitService.diffFiles(repoPath as string, range as string | undefined)
    )
    r('git:working-diff-files', async (repoPath) => gitService.workingDiffFiles(repoPath as string))
    r('git:diff-file-patch', async (repoPath, filePath, range) =>
      gitService.diffFilePatch(repoPath as string, filePath as string, range as string | undefined)
    )
    r('git:commit-files', async (repoPath, commitHash) =>
      gitService.commitFiles(repoPath as string, commitHash as string)
    )
    r('git:file-at-ref', async (repoPath, ref, filePath) =>
      gitService.fileAtRef(repoPath as string, ref as string, filePath as string)
    )

    r('gitlab:defaults:get', async () => gitlabClient.getDefaults())
    r('gitlab:normalize-project', async (input) => normalizeProjectRef(String(input ?? '')))
    r('gitlab:defaults:save', async (settings) =>
      gitlabClient.saveDefaults((settings as Partial<GitLabDefaults>) ?? {})
    )
    r('gitlab:repo-config:get', async (repoPath) => gitlabClient.getRepoConfig(repoPath as string))
    r('gitlab:repo-config:save', async (repoPath, config) =>
      gitlabClient.saveRepoConfig(repoPath as string, (config as GitLabRepoConfig) ?? {})
    )
    r('gitlab:settings:get', async (repoPath) =>
      gitlabClient.resolveSettings(repoPath as string | undefined)
    )
    r('gitlab:settings:save', async (settings) =>
      gitlabClient.saveSettings((settings as Partial<GitLabDefaults>) ?? {})
    )
    r('gitlab:members', async (settings) => gitlabClient.listMembers(settings as GitLabSettings))
    r('gitlab:create-mr', async (settings, payload) =>
      gitlabClient.createMergeRequest(
        settings as GitLabSettings,
        payload as {
          source_branch: string
          target_branch: string
          title: string
          description?: string
          assignee_ids?: number[]
          reviewer_ids?: number[]
        }
      )
    )

    r('mr-config:get', async (repoPath) => gitlabClient.getMrCache(repoPath as string))
    r('mr-config:save', async (repoPath, cache) =>
      gitlabClient.saveMrCache(repoPath as string, cache as MrFormCache)
    )

    r('settings:get', async () => {
      const s = await settingsStore.get()
      return { ...s, defaultWhitelist: DEFAULT_TEXT_WHITELIST }
    })
    r('settings:save', async (partial) =>
      settingsStore.save((partial as { textWhitelist?: string[]; maxFileSizeMb?: number }) ?? {})
    )
    r('settings:add-whitelist-ext', async (ext) => settingsStore.addWhitelistExt(ext as string))

    r('git:watch:wait', async (repoPath, timeoutMs) =>
      repoWatcherRegistry.wait(
        repoPath as string,
        typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? timeoutMs : undefined
      )
    )
    r('git:watch:stop', async (repoPath) => {
      repoWatcherRegistry.stop(repoPath as string)
    })
  },
  async deactivate(): Promise<void> {
    repoWatcherRegistry.stopAll()
    /* handlers remain registered for process lifetime */
  }
}
