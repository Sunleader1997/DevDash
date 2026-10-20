import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface GitLabSettings {
  baseUrl: string
  token: string
  projectPath: string
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

const DEFAULT_SETTINGS: GitLabSettings = {
  baseUrl: '',
  token: '',
  projectPath: ''
}

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
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

export class GitLabClient {
  async getSettings(): Promise<GitLabSettings> {
    return readJson(userDataFile('gitlab-settings.json'), DEFAULT_SETTINGS)
  }

  async saveSettings(settings: GitLabSettings): Promise<GitLabSettings> {
    await writeJson(userDataFile('gitlab-settings.json'), settings)
    return settings
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
    return encodeURIComponent(projectPath)
  }

  private async request<T>(settings: GitLabSettings, pathname: string, init?: RequestInit): Promise<T> {
    if (!settings.baseUrl || !settings.token) {
      throw new Error('GitLab baseUrl / token 未配置')
    }
    const url = `${settings.baseUrl.replace(/\/$/, '')}/api/v4${pathname}`
    const res = await fetch(url, {
      ...init,
      headers: {
        'PRIVATE-TOKEN': settings.token,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    })
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!res.ok) {
      const msg =
        typeof body === 'object' && body && 'message' in body
          ? JSON.stringify((body as { message: unknown }).message)
          : text || res.statusText
      throw new Error(`GitLab ${res.status}: ${msg}`)
    }
    return body as T
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
