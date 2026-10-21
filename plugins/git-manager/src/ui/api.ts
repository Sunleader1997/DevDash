import type {
  BranchInfo,
  CommitInfo,
  DiffFileInfo,
  GitLabDefaults,
  GitLabMember,
  GitLabRepoConfig,
  GitLabSettings,
  MrFormCache,
  RepoInfo,
  StatusEntry
} from './types'

const host = (globalThis as unknown as {
  DevDashHost: { ipc: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }
}).DevDashHost

/** Domain channels are namespaced under the plugin id (see package.json `devdash.ipc`). */
const P = 'plugin:git-manager:'

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return host.ipc.invoke(channel, ...args) as Promise<T>
}

/** Invoke a plugin-domain channel by manifest suffix (e.g. `git:status`). */
export function invokeDomain<T>(suffix: string, ...args: unknown[]): Promise<T> {
  return invoke<T>(P + suffix, ...args)
}

export const api = {
  pickDirectory: () => invoke<string | null>('fs:pick-directory'),
  openPath: (p: string) => invoke<void>('shell:open-path', p),
  openExternal: (p: string) => invoke<void>('shell:open-external', p),
  showInFolder: (p: string) => invoke<void>('shell:show-in-folder', p),
  findRepos: (root: string, maxDepth?: number) => invokeDomain<string[]>('git:find-repos', root, maxDepth),
  repoInfo: (repoPath: string) => invokeDomain<RepoInfo>('git:repo-info', repoPath),
  status: (repoPath: string) => invokeDomain<StatusEntry[]>('git:status', repoPath),
  listFiles: (repoPath: string) => invokeDomain<string[]>('git:list-files', repoPath),
  addPaths: (repoPath: string, paths: string[]) => invokeDomain<void>('git:add', repoPath, paths),
  ignorePaths: (repoPath: string, paths: string[]) => invokeDomain<void>('git:ignore', repoPath, paths),
  revertPaths: (repoPath: string, paths: string[]) => invokeDomain<void>('git:revert', repoPath, paths),
  remoteUrl: (repoPath: string, remote?: string) =>
    invokeDomain<string | null>('git:remote-url', repoPath, remote),
  normalizeProject: (input: string) => invokeDomain<string>('gitlab:normalize-project', input),
  commit: (repoPath: string, message: string, paths?: string[]) =>
    invokeDomain<string>('git:commit', repoPath, message, paths),
  push: (repoPath: string, remote?: string, ref?: string) =>
    invokeDomain<string>('git:push', repoPath, remote, ref),
  pull: (repoPath: string, remote?: string, branch?: string) =>
    invokeDomain<string>('git:pull', repoPath, remote, branch),
  unpushed: (repoPath: string) => invokeDomain<CommitInfo[]>('git:unpushed', repoPath),
  branches: (repoPath: string) => invokeDomain<BranchInfo[]>('git:branches', repoPath),
  checkout: (repoPath: string, branch: string) => invokeDomain<void>('git:checkout', repoPath, branch),
  log: (repoPath: string, limit?: number, skip?: number) =>
    invokeDomain<CommitInfo[]>('git:log', repoPath, limit, skip),
  diffFiles: (repoPath: string, range?: string) => invokeDomain<DiffFileInfo[]>('git:diff-files', repoPath, range),
  workingDiffFiles: (repoPath: string) => invokeDomain<DiffFileInfo[]>('git:working-diff-files', repoPath),
  diffFilePatch: (repoPath: string, filePath: string, range?: string) =>
    invokeDomain<string>('git:diff-file-patch', repoPath, filePath, range),
  commitFiles: (repoPath: string, commitHash: string) =>
    invokeDomain<DiffFileInfo[]>('git:commit-files', repoPath, commitHash),
  fileAtRef: (repoPath: string, ref: string, filePath: string) =>
    invokeDomain<string | null>('git:file-at-ref', repoPath, ref, filePath),
  gitlabDefaults: () => invokeDomain<GitLabDefaults>('gitlab:defaults:get'),
  saveGitlabDefaults: (s: Partial<GitLabDefaults>) =>
    invokeDomain<GitLabDefaults>('gitlab:defaults:save', s),
  gitlabRepoConfig: (repoPath: string) => invokeDomain<GitLabRepoConfig>('gitlab:repo-config:get', repoPath),
  saveGitlabRepoConfig: (repoPath: string, s: GitLabRepoConfig) =>
    invokeDomain<GitLabRepoConfig>('gitlab:repo-config:save', repoPath, s),
  gitlabSettings: (repoPath?: string) => invokeDomain<GitLabSettings>('gitlab:settings:get', repoPath),
  saveGitlabSettings: (s: Partial<GitLabDefaults>) => invokeDomain<GitLabSettings>('gitlab:settings:save', s),
  gitlabMembers: (s: GitLabSettings) => invokeDomain<GitLabMember[]>('gitlab:members', s),
  createMr: (
    s: GitLabSettings,
    payload: {
      source_branch: string
      target_branch: string
      title: string
      description?: string
      assignee_ids?: number[]
      reviewer_ids?: number[]
    }
  ) =>
    invokeDomain<{ id: number; web_url: string; iid: number; title: string }>(
      'gitlab:create-mr',
      s,
      payload
    ),
  getMrCache: (repoPath: string) => invokeDomain<MrFormCache | null>('mr-config:get', repoPath),
  saveMrCache: (repoPath: string, cache: MrFormCache) => invokeDomain<void>('mr-config:save', repoPath, cache),
  storeRead: (projectPath: string) => invoke<Record<string, unknown>>('store:read', projectPath),
  storePatch: (projectPath: string, partial: Record<string, unknown>) =>
    invoke<Record<string, unknown>>('store:patch', projectPath, partial),
  readFile: async (filePath: string, opts?: { force?: boolean; maxFileSizeMb?: number }) => {
    let maxFileSizeMb = opts?.maxFileSizeMb
    if (maxFileSizeMb === undefined) {
      const s = await invokeDomain<{ maxFileSizeMb: number }>('settings:get')
      maxFileSizeMb = s.maxFileSizeMb
    }
    return invoke<string>('fs:read-text-file', filePath, { ...opts, maxFileSizeMb })
  },
  probeFile: async (
    filePath: string,
    policy?: { textWhitelist?: string[]; maxFileSizeMb?: number }
  ) => {
    let p = policy
    if (!p) {
      const s = await invokeDomain<{ textWhitelist: string[]; maxFileSizeMb: number }>('settings:get')
      p = { textWhitelist: s.textWhitelist, maxFileSizeMb: s.maxFileSizeMb }
    }
    return invoke<{
      path: string
      exists: boolean
      size: number
      ext: string
      whitelisted: boolean
      tooLarge: boolean
      binary: boolean
      maxFileSizeMb: number
    }>('fs:probe-file', filePath, p)
  },
  settingsGet: () =>
    invokeDomain<{
      textWhitelist: string[]
      maxFileSizeMb: number
      defaultWhitelist: string[]
    }>('settings:get'),
  settingsSave: (partial: { textWhitelist?: string[]; maxFileSizeMb?: number }) =>
    invokeDomain<unknown>('settings:save', partial),
  settingsAddExt: (ext: string) => invokeDomain<unknown>('settings:add-whitelist-ext', ext),
  tasks: <T>(id: string, label: string, fn: () => Promise<T>): Promise<T> => {
    const host = (globalThis as unknown as {
      DevDashHost: {
        tasks: { run: <R>(id: string, label: string, fn: () => Promise<R>) => Promise<R> }
      }
    }).DevDashHost
    return host.tasks.run(id, label, fn)
  }
}
