import type { RepoInfo } from './types'

export const REPO_CACHE_KEY = 'git:repos'

export type RepoDiscoveryCache = {
  scannedAt: number
  repos: RepoInfo[]
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

function normalizeRepo(raw: unknown): RepoInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.path !== 'string' || !o.path) return null
  return {
    path: o.path,
    name: typeof o.name === 'string' && o.name ? o.name : basename(o.path),
    branch: typeof o.branch === 'string' ? o.branch : null,
    dirtyCount: typeof o.dirtyCount === 'number' && Number.isFinite(o.dirtyCount) ? o.dirtyCount : 0
  }
}

/** Empty/`null`/dirty `git:repos` payloads parse as "no cache". */
export function parseRepoDiscoveryCache(state: Record<string, unknown> | null | undefined): RepoInfo[] | null {
  if (!state) return null
  const raw = state[REPO_CACHE_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const repos = (raw as Record<string, unknown>).repos
  if (!Array.isArray(repos)) return null
  const out: RepoInfo[] = []
  for (const item of repos) {
    const repo = normalizeRepo(item)
    if (!repo) return null
    out.push(repo)
  }
  return out
}

export function serializeRepoDiscoveryCache(repos: RepoInfo[]): RepoDiscoveryCache {
  return { scannedAt: Date.now(), repos }
}

/** True when path set / name / branch / dirtyCount all match. */
export function discoveryEquals(a: RepoInfo[], b: RepoInfo[]): boolean {
  if (a.length !== b.length) return false
  const map = new Map(a.map((r) => [r.path, r]))
  for (const r of b) {
    const other = map.get(r.path)
    if (!other) return false
    if (other.name !== r.name || other.branch !== r.branch || other.dirtyCount !== r.dirtyCount) {
      return false
    }
  }
  return true
}
