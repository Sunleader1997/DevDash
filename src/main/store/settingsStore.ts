import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface GitManagerSettings {
  /** Extensions allowed to open as text without prompt (lowercase, no dot). */
  textWhitelist: string[]
  /** Max file size in MB before force-open is required. */
  maxFileSizeMb: number
}

export const DEFAULT_TEXT_WHITELIST = [
  'txt', 'text', 'md', 'markdown',
  'json', 'jsonc', 'json5',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'css', 'scss', 'sass', 'less',
  'html', 'htm', 'xml', 'svg', 'vue', 'svelte',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'py', 'rb', 'java', 'kt', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sql', 'graphql', 'proto',
  'log', 'gitignore', 'gitattributes', 'dockerfile', 'makefile', 'editorconfig',
  'lock', 'map', 'csv'
]

export const DEFAULT_SETTINGS: GitManagerSettings = {
  textWhitelist: [...DEFAULT_TEXT_WHITELIST],
  maxFileSizeMb: 10
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'git-manager-settings.json')
}

export class SettingsStore {
  private cache: GitManagerSettings | null = null

  async get(): Promise<GitManagerSettings> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(settingsFile(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<GitManagerSettings>
      this.cache = {
        textWhitelist: Array.isArray(parsed.textWhitelist)
          ? parsed.textWhitelist
          : [...DEFAULT_TEXT_WHITELIST],
        maxFileSizeMb:
          typeof parsed.maxFileSizeMb === 'number' && parsed.maxFileSizeMb > 0
            ? parsed.maxFileSizeMb
            : DEFAULT_SETTINGS.maxFileSizeMb
      }
    } catch {
      this.cache = { ...DEFAULT_SETTINGS, textWhitelist: [...DEFAULT_TEXT_WHITELIST] }
    }
    return this.cache!
  }

  async save(next: Partial<GitManagerSettings>): Promise<GitManagerSettings> {
    const current = await this.get()
    const merged: GitManagerSettings = {
      textWhitelist: next.textWhitelist ?? current.textWhitelist,
      maxFileSizeMb: next.maxFileSizeMb ?? current.maxFileSizeMb
    }
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
    await fs.writeFile(settingsFile(), JSON.stringify(merged, null, 2), 'utf8')
    this.cache = merged
    return merged
  }

  async addWhitelistExt(ext: string): Promise<GitManagerSettings> {
    const cur = await this.get()
    const e = ext.replace(/^\./, '').toLowerCase()
    if (!e || cur.textWhitelist.includes(e)) return cur
    return this.save({ textWhitelist: [...cur.textWhitelist, e] })
  }
}

export const settingsStore = new SettingsStore()
