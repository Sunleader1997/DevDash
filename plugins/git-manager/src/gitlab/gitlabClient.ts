import { promises as fs } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { URL } from 'node:url'

import { normalizeProjectRef } from './projectRef'

let userDataDir = ''

/** Injected by plugin main activate() — keeps this module free of electron. */
export function setUserDataDir(dir: string): void {
  userDataDir = dir
}

/** Global GitLab defaults — used when a repo has not overridden the field. */
export interface GitLabDefaults {
  baseUrl: string
  token: string
  /** Fallback project path + member-list source when a repo has none. */
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
  /** Field names that came from the repo override rather than global defaults. */
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

export interface GitLabMember {
  id: number
  username: string
  name: string
}

const DEFAULTS: GitLabDefaults = {
  baseUrl: '',
  token: '',
  projectPath: '',
  assignees: [],
  reviewers: [],
  assigneeNames: [],
  reviewerNames: []
}

function userDataFile(name: string): string {
  return path.join(userDataDir, name)
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return { ...fallback, ...(JSON.parse(raw) as T) }
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function pick<T>(value: T | undefined | null, fallback: T): T {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  if (Array.isArray(value) && value.length === 0) return fallback
  return value
}

export class GitLabClient {
  private defaultsCache: GitLabDefaults | null = null

  async getDefaults(): Promise<GitLabDefaults> {
    if (this.defaultsCache) return this.defaultsCache
    // One-time migration: legacy single-file settings → global defaults.
    const defaultsFile = userDataFile('gitlab-defaults.json')
    const legacyFile = userDataFile('gitlab-settings.json')
    try {
      await fs.access(defaultsFile)
    } catch {
      try {
        const legacy = await readJson<Record<string, unknown>>(legacyFile, {})
        if (legacy && (legacy.baseUrl || legacy.token || legacy.projectPath)) {
          const migrated: GitLabDefaults = {
            baseUrl: str(legacy.baseUrl),
            token: str(legacy.token),
            projectPath: str(legacy.projectPath),
            assignees: numArray(legacy.assignees),
            reviewers: numArray(legacy.reviewers),
            assigneeNames: strArray(legacy.assigneeNames),
            reviewerNames: strArray(legacy.reviewerNames)
          }
          await writeJson(defaultsFile, migrated)
          this.defaultsCache = migrated
          return migrated
        }
      } catch {
        /* no legacy file */
      }
    }
    const parsed = await readJson<Partial<GitLabDefaults>>(defaultsFile, {})
    this.defaultsCache = {
      baseUrl: str(parsed.baseUrl),
      token: str(parsed.token),
      projectPath: str(parsed.projectPath),
      assignees: numArray(parsed.assignees),
      reviewers: numArray(parsed.reviewers),
      assigneeNames: strArray(parsed.assigneeNames),
      reviewerNames: strArray(parsed.reviewerNames)
    }
    return this.defaultsCache
  }

  async saveDefaults(next: Partial<GitLabDefaults>): Promise<GitLabDefaults> {
    const current = await this.getDefaults()
    const merged: GitLabDefaults = {
      baseUrl: str(next.baseUrl ?? current.baseUrl),
      token: str(next.token ?? current.token),
      projectPath: normalizeProjectRef(str(next.projectPath ?? current.projectPath)),
      assignees: numArray(next.assignees ?? current.assignees),
      reviewers: numArray(next.reviewers ?? current.reviewers),
      assigneeNames: strArray(next.assigneeNames ?? current.assigneeNames),
      reviewerNames: strArray(next.reviewerNames ?? current.reviewerNames)
    }
    await writeJson(userDataFile('gitlab-defaults.json'), merged)
    this.defaultsCache = merged
    return merged
  }

  private async readRepoConfigs(): Promise<Record<string, GitLabRepoConfig>> {
    return readJson<Record<string, GitLabRepoConfig>>(userDataFile('gitlab-repo-config.json'), {})
  }

  async getRepoConfig(repoPath: string): Promise<GitLabRepoConfig> {
    const all = await this.readRepoConfigs()
    return all[repoPath] ?? {}
  }

  async saveRepoConfig(repoPath: string, config: GitLabRepoConfig): Promise<GitLabRepoConfig> {
    const all = await this.readRepoConfigs()
    const cleaned: GitLabRepoConfig = {}
    const projectPath = normalizeProjectRef(str(config.projectPath))
    if (projectPath) cleaned.projectPath = projectPath
    if (config.baseUrl?.trim()) cleaned.baseUrl = config.baseUrl.trim().replace(/\/$/, '')
    if (config.token?.trim()) cleaned.token = config.token.trim()
    if (config.assignees && config.assignees.length > 0) {
      cleaned.assignees = config.assignees
      cleaned.assigneeNames = strArray(config.assigneeNames)
    }
    if (config.reviewers && config.reviewers.length > 0) {
      cleaned.reviewers = config.reviewers
      cleaned.reviewerNames = strArray(config.reviewerNames)
    }
    if (Object.keys(cleaned).length === 0) {
      delete all[repoPath]
    } else {
      all[repoPath] = cleaned
    }
    await writeJson(userDataFile('gitlab-repo-config.json'), all)
    return cleaned
  }

  /**
   * Merge repo config over global defaults.
   * Empty / missing repo fields automatically use the global defaults.
   */
  async resolveSettings(repoPath?: string): Promise<GitLabSettings> {
    const defaults = await this.getDefaults()
    const repo = repoPath ? await this.getRepoConfig(repoPath) : {}
    const overrides: GitLabSettings['overrides'] = []

    const baseUrl = pick(repo.baseUrl, defaults.baseUrl)
    const token = pick(repo.token, defaults.token)
    const projectPath = normalizeProjectRef(pick(repo.projectPath, defaults.projectPath))
    const assignees = pick(repo.assignees, defaults.assignees)
    const reviewers = pick(repo.reviewers, defaults.reviewers)
    const assigneeNames = pick(repo.assigneeNames, defaults.assigneeNames)
    const reviewerNames = pick(repo.reviewerNames, defaults.reviewerNames)

    if (repo.baseUrl?.trim()) overrides.push('baseUrl')
    if (repo.token?.trim()) overrides.push('token')
    if (repo.projectPath?.trim()) overrides.push('projectPath')
    if (repo.assignees?.length) overrides.push('assignees')
    if (repo.reviewers?.length) overrides.push('reviewers')

    return {
      baseUrl,
      token,
      projectPath,
      assignees,
      reviewers,
      assigneeNames,
      reviewerNames,
      overrides
    }
  }

  /** Back-compat: treat legacy settings channel as global defaults. */
  async getSettings(): Promise<GitLabSettings> {
    return this.resolveSettings()
  }

  async saveSettings(settings: Partial<GitLabDefaults>): Promise<GitLabSettings> {
    await this.saveDefaults(settings)
    return this.resolveSettings()
  }

  async getMrCache(repoPath: string): Promise<MrFormCache | null> {
    const all = await readJson<Record<string, MrFormCache>>(userDataFile('gitlab-mr-cache.json'), {})
    return all[repoPath] ?? null
  }

  async saveMrCache(repoPath: string, cache: MrFormCache): Promise<void> {
    const file = userDataFile('gitlab-mr-cache.json')
    const all = await readJson<Record<string, MrFormCache>>(file, {})
    all[repoPath] = { ...all[repoPath], ...cache }
    await writeJson(file, all)
  }

  private encodeProject(projectPath: string): string {
    const id = normalizeProjectRef(projectPath)
    return encodeURIComponent(id)
  }

  /** raw:true → [code, bodyText]; code 0 means network/TLS failure. Follows 30x up to 5 hops. */
  private rawRequest(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    redirectsLeft = 5
  ): Promise<{ code: number; body: string; url: string }> {
    return new Promise((resolve, reject) => {
      let u: URL
      try {
        u = new URL(url)
      } catch {
        reject(new Error(`非法 baseUrl，无法请求 ${url}`))
        return
      }
      const lib = u.protocol === 'http:' ? http : https
      const req = lib.request(
        u,
        {
          method: init.method ?? 'GET',
          headers: init.headers,
          // Internal GitLab often uses self-signed certs — accept them for API calls.
          rejectUnauthorized: false
        },
        (res) => {
          const status = res.statusCode ?? 0
          const loc = res.headers.location
          if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
            res.resume()
            const nextUrl = new URL(loc, u)
            // Never leak PRIVATE-TOKEN to a different host on redirect.
            const nextInit =
              nextUrl.host === u.host
                ? init
                : { ...init, headers: { ...init.headers, 'PRIVATE-TOKEN': '' } }
            this.rawRequest(nextUrl.toString(), nextInit, redirectsLeft - 1).then(resolve, reject)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            resolve({ code: status, body: Buffer.concat(chunks).toString('utf8'), url: u.toString() })
          })
        }
      )
      req.on('error', (err: NodeJS.ErrnoException) => {
        const cause = err.code || err.message || 'connection error'
        reject(new Error(`GitLab 连接失败: ${cause}（已忽略自签名证书，仍失败请检查 baseUrl / 网络）`))
      })
      if (init.body) req.write(init.body)
      req.end()
    })
  }

  private async request<T>(settings: GitLabSettings, pathname: string, init?: RequestInit): Promise<T> {
    if (!settings.baseUrl || !settings.token) {
      throw new Error('GitLab baseUrl / token 未配置')
    }
    const url = `${settings.baseUrl.replace(/\/$/, '')}/api/v4${pathname}`
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': settings.token,
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string> | undefined) ?? {})
    }
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : undefined
    let res: { code: number; body: string; url: string }
    try {
      res = await this.rawRequest(url, { method, headers, body })
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e))
    }
    let parsed: unknown = null
    try {
      parsed = res.body ? JSON.parse(res.body) : null
    } catch {
      parsed = res.body
    }
    if (res.code < 200 || res.code >= 300) {
      const msg =
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? JSON.stringify((parsed as { message: unknown }).message)
          : res.body || `HTTP ${res.code}`
      // Sanitize: pathname only, never headers / token.
      const safePath = (() => {
        try {
          return new URL(res.url).pathname
        } catch {
          return pathname
        }
      })()
      throw new Error(`GitLab ${res.code}: ${msg}（请求 ${safePath}）`)
    }
    return parsed as T
  }

  async listMembers(settings: GitLabSettings): Promise<GitLabMember[]> {
    if (!settings.projectPath) throw new Error('GitLab projectPath 未配置')
    const project = this.encodeProject(settings.projectPath)
    const members = await this.request<GitLabMember[]>(settings, `/projects/${project}/members/all?per_page=100`)
    return members.map((m) => ({ id: m.id, username: m.username, name: m.name }))
  }

  async createMergeRequest(
    settings: GitLabSettings,
    payload: {
      source_branch: string
      target_branch: string
      title: string
      description?: string
      assignee_ids?: number[]
      reviewer_ids?: number[]
    }
  ): Promise<{ id: number; web_url: string; iid: number; title: string }> {
    if (!settings.projectPath) throw new Error('GitLab projectPath 未配置')
    const project = this.encodeProject(settings.projectPath)
    return this.request(settings, `/projects/${project}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}

export const gitlabClient = new GitLabClient()
