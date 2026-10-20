import type {
  BranchInfo,
  CommitInfo,
  DiffFileInfo,
  GitLabMember,
  GitLabSettings,
  MrFormCache,
  RepoInfo,
  StatusEntry
} from './types'

const host = (globalThis as unknown as {
  DevDashHost: { ipc: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }
}).DevDashHost

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return host.ipc.invoke(channel, ...args) as Promise<T>
}

export const api = {
  pickDirectory: () => invoke<string | null>('fs:pick-directory'),
  findRepos: (root: string, maxDepth?: number) => invoke<string[]>('git:find-repos', root, maxDepth),
  repoInfo: (repoPath: string) => invoke<RepoInfo>('git:repo-info', repoPath),
  status: (repoPath: string) => invoke<StatusEntry[]>('git:status', repoPath),
  listFiles: (repoPath: string) => invoke<string[]>('git:list-files', repoPath),
  addPaths: (repoPath: string, paths: string[]) => invoke<void>('git:add', repoPath, paths),
  commit: (repoPath: string, message: string, paths?: string[]) =>
    invoke<string>('git:commit', repoPath, message, paths),
  push: (repoPath: string, remote?: string, ref?: string) =>
    invoke<string>('git:push', repoPath, remote, ref),
  pull: (repoPath: string, remote?: string, branch?: string) =>
    invoke<string>('git:pull', repoPath, remote, branch),
  unpushed: (repoPath: string) => invoke<CommitInfo[]>('git:unpushed', repoPath),
  branches: (repoPath: string) => invoke<BranchInfo[]>('git:branches', repoPath),
  checkout: (repoPath: string, branch: string) => invoke<void>('git:checkout', repoPath, branch),
  log: (repoPath: string, limit?: number, skip?: number) => invoke<CommitInfo[]>('git:log', repoPath, limit, skip),
  diffFiles: (repoPath: string, range?: string) => invoke<DiffFileInfo[]>('git:diff-files', repoPath, range),
  workingDiffFiles: (repoPath: string) => invoke<DiffFileInfo[]>('git:working-diff-files', repoPath),
  diffFilePatch: (repoPath: string, filePath: string, range?: string) =>
    invoke<string>('git:diff-file-patch', repoPath, filePath, range),
  commitFiles: (repoPath: string, commitHash: string) => invoke<DiffFileInfo[]>('git:commit-files', repoPath, commitHash),
  fileAtRef: (repoPath: string, ref: string, filePath: string) =>
    invoke<string | null>('git:file-at-ref', repoPath, ref, filePath),
  gitlabSettings: () => invoke<GitLabSettings>('gitlab:settings:get'),
  saveGitlabSettings: (s: GitLabSettings) => invoke<GitLabSettings>('gitlab:settings:save', s),
  gitlabMembers: (s: GitLabSettings) => invoke<GitLabMember[]>('gitlab:members', s),
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
  ) => invoke<{ id: number; web_url: string; iid: number; title: string }>('gitlab:create-mr', s, payload),
  getMrCache: (repoPath: string) => invoke<MrFormCache | null>('mr-config:get', repoPath),
  saveMrCache: (repoPath: string, cache: MrFormCache) => invoke<void>('mr-config:save', repoPath, cache),
  storeRead: (projectPath: string) => invoke<Record<string, unknown>>('store:read', projectPath),
  storePatch: (projectPath: string, partial: Record<string, unknown>) =>
    invoke<Record<string, unknown>>('store:patch', projectPath, partial),
  readFile: (filePath: string, opts?: { force?: boolean; maxFileSizeMb?: number }) =>
    invoke<string>('fs:read-text-file', filePath, opts),
  probeFile: (filePath: string) =>
    invoke<{
      path: string
      exists: boolean
      size: number
      ext: string
      whitelisted: boolean
      tooLarge: boolean
      binary: boolean
      maxFileSizeMb: number
    }>('fs:probe-file', filePath),
  settingsGet: () =>
    invoke<{
      textWhitelist: string[]
      maxFileSizeMb: number
      defaultWhitelist: string[]
    }>('settings:get'),
  settingsSave: (partial: { textWhitelist?: string[]; maxFileSizeMb?: number }) =>
    invoke<unknown>('settings:save', partial),
  settingsAddExt: (ext: string) => invoke<unknown>('settings:add-whitelist-ext', ext),
  tasks: <T>(id: string, label: string, fn: () => Promise<T>): Promise<T> => {
    const host = (globalThis as unknown as {
      DevDashHost: {
        tasks: { run: <R>(id: string, label: string, fn: () => Promise<R>) => Promise<R> }
      }
    }).DevDashHost
    return host.tasks.run(id, label, fn)
  }
}
