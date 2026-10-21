export type ReactNode = unknown
export type CSSProperties = Record<string, string | number | undefined>
export type MouseEvent = { stopPropagation: () => void; preventDefault: () => void }
export type ChangeEvent = { target: { value: string } }
export type ComponentType = (props: Record<string, never>) => unknown

export interface ProjectRecord {
  id: string
  name: string
  path: string
}

export interface RepoInfo {
  path: string
  name: string
  branch: string | null
  dirtyCount: number
}

export interface StatusEntry {
  path: string
  index: string
  worktree: string
  status:
    | 'not-added'
    | 'added'
    | 'added-dirty'
    | 'deleted'
    | 'renamed'
    | 'untracked'
    | 'ignored'
    | 'conflict'
    | 'clean'
}

export interface BranchInfo {
  name: string
  current: boolean
}

export interface CommitInfo {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  authorEmail: string
  date: string
}

export interface DiffFileInfo {
  path: string
  status: string
  additions: number
  deletions: number
  patch: string
  binary: boolean
}

export interface GitLabMember {
  id: number
  username: string
  name: string
}

/** Global GitLab defaults — used when a repo has not overridden the field. */
export interface GitLabDefaults {
  baseUrl: string
  token: string
  projectPath: string
  assignees: number[]
  reviewers: number[]
  assigneeNames: string[]
  reviewerNames: string[]
}

/** Per-repo GitLab overrides. Empty / missing fields fall back to global defaults. */
export interface GitLabRepoConfig {
  projectPath?: string
  baseUrl?: string
  token?: string
  assignees?: number[]
  reviewers?: number[]
  assigneeNames?: string[]
  reviewerNames?: string[]
}

/** Effective settings after merging repo config over global defaults. */
export interface GitLabSettings {
  baseUrl: string
  token: string
  projectPath: string
  assignees: number[]
  reviewers: number[]
  assigneeNames: string[]
  reviewerNames: string[]
  overrides: Array<'baseUrl' | 'token' | 'projectPath' | 'assignees' | 'reviewers'>
}

export interface MrFormCache {
  title?: string
  newBranch?: string
  description?: string
  toBranch?: string
  assignees?: number[]
  reviewers?: number[]
  assigneeNames?: string[]
  reviewerNames?: string[]
}

export interface PluginListItem {
  id: string
  title: string
  icon?: string
}
