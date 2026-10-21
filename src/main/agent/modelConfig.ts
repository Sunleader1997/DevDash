import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentSettings,
  ConnectivityResult,
  ModelPreset
} from './types'

const FILE = 'agent-settings.json'

export const DEFAULT_CONTEXT_INPUT = 1_000_000
export const DEFAULT_CONTEXT_OUTPUT = 64_000

function defaultPreset(): ModelPreset {
  return {
    id: 'anthropic-default',
    label: 'Claude（订阅）',
    provider: 'anthropic',
    protocol: 'anthropic-messages',
    model: 'claude-sonnet-4-5',
    authMode: 'subscription',
    contextInputTokens: DEFAULT_CONTEXT_INPUT,
    contextOutputTokens: DEFAULT_CONTEXT_OUTPUT
  }
}

export const DEFAULT_SETTINGS: AgentSettings = {
  presets: [defaultPreset()],
  activePresetId: 'anthropic-default'
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), FILE)
}

function normalizePreset(p: Partial<ModelPreset> & { id: string }): ModelPreset {
  const baseUrl = p.baseUrl ? normalizeAnthropicBase(p.baseUrl) : p.baseUrl
  return {
    ...p,
    baseUrl,
    label: p.label || p.model || '模型',
    provider: p.provider ?? (baseUrl ? 'custom' : 'anthropic'),
    protocol: p.protocol ?? 'anthropic-messages',
    model: p.model || 'claude-sonnet-4-5',
    contextInputTokens: p.contextInputTokens ?? DEFAULT_CONTEXT_INPUT,
    contextOutputTokens: p.contextOutputTokens ?? DEFAULT_CONTEXT_OUTPUT
  }
}

export async function loadSettings(): Promise<AgentSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AgentSettings>
    if (!parsed || !Array.isArray(parsed.presets) || parsed.presets.length === 0) {
      return { ...DEFAULT_SETTINGS, presets: [defaultPreset()] }
    }
    const presets = parsed.presets.filter((p) => p && p.id).map((p) => normalizePreset(p))
    if (presets.length === 0) return { ...DEFAULT_SETTINGS, presets: [defaultPreset()] }
    const activePresetId =
      parsed.activePresetId && presets.some((p) => p.id === parsed.activePresetId)
        ? parsed.activePresetId
        : presets[0].id
    return { presets, activePresetId }
  } catch {
    return { ...DEFAULT_SETTINGS, presets: [defaultPreset()] }
  }
}

export async function saveSettings(settings: AgentSettings): Promise<void> {
  const file = settingsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  // Normalize MiniMax-style base URLs on save so the next session hits /anthropic
  const normalized: AgentSettings = {
    ...settings,
    presets: settings.presets.map((p) =>
      p.baseUrl
        ? { ...p, baseUrl: normalizeAnthropicBase(p.baseUrl) }
        : p
    )
  }
  await fs.writeFile(file, JSON.stringify(normalized, null, 2), 'utf8')
}

export function newPresetId(): string {
  return randomUUID()
}

/**
 * Map a model preset to Claude Agent SDK env vars.
 * `options.env` replaces process.env, so callers must spread process.env first.
 *
 * Custom/non-Claude endpoints (e.g. MiniMax-M3) must pin ALL model aliases —
 * Claude Code otherwise falls back to haiku/sonnet for internal calls and the
 * gateway returns `400 Unsupported model`.
 */
export function buildEnvForPreset(preset: ModelPreset): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    CLAUDE_AGENT_SDK_CLIENT_APP: 'DevDash/0.1.0'
  }

  const baseUrl = preset.baseUrl?.trim()
  const apiKey = preset.apiKey?.trim()
  const model = preset.model?.trim()

  if (preset.provider === 'custom' || baseUrl) {
    if (baseUrl) env.ANTHROPIC_BASE_URL = normalizeAnthropicBase(baseUrl)
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey
      env.ANTHROPIC_AUTH_TOKEN = apiKey
    }
    // Pin every alias to the configured model so internal haiku/sonnet calls work
    if (model) {
      env.ANTHROPIC_MODEL = model
      env.ANTHROPIC_SMALL_FAST_MODEL = model
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = model
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = model
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model
    }
    return env
  }

  // Anthropic official
  if (preset.authMode === 'api-key' && apiKey) {
    env.ANTHROPIC_API_KEY = apiKey
    env.ANTHROPIC_AUTH_TOKEN = apiKey
  }
  if (model) env.ANTHROPIC_MODEL = model
  return env
}

export function pickPreset(settings: AgentSettings, presetId?: string): ModelPreset | undefined {
  if (presetId) return settings.presets.find((p) => p.id === presetId)
  return settings.presets.find((p) => p.id === settings.activePresetId) ?? settings.presets[0]
}

function resolveBaseUrl(preset: ModelPreset): string {
  const raw = preset.baseUrl?.trim()
  if (!raw) return 'https://api.anthropic.com'
  return normalizeAnthropicBase(raw)
}

/**
 * Claude Code / Agent SDK always POST `{BASE}/v1/messages`.
 * MiniMax's Anthropic-compatible gateway lives at `{host}/anthropic/v1/messages`,
 * so a bare `https://api.minimax.io` must become `https://api.minimax.io/anthropic`.
 * A naive `/v1/models` probe still succeeds on the bare host → false "connected".
 */
export function normalizeAnthropicBase(url: string): string {
  let u = url.trim().replace(/\/$/, '')
  if (!u) return u
  try {
    const parsed = new URL(u.includes('://') ? u : `https://${u}`)
    const host = parsed.hostname.toLowerCase()
    const isMinimax =
      host === 'api.minimax.io' ||
      host === 'api.minimaxi.com' ||
      host.endsWith('.minimax.io') ||
      host.endsWith('.minimaxi.com')
    const path = parsed.pathname.replace(/\/$/, '')
    const already = path.endsWith('/anthropic') || path.endsWith('/anthropic/v1')
    if (isMinimax && !already) {
      // strip a trailing /v1 if the user pasted .../v1
      const base = path.replace(/\/v1$/, '')
      parsed.pathname = `${base}/anthropic`
      return parsed.toString().replace(/\/$/, '')
    }
    // strip trailing /v1 so SDK's /v1/messages doesn't become /v1/v1/messages
    if (path.endsWith('/v1')) {
      parsed.pathname = path.replace(/\/v1$/, '')
      return parsed.toString().replace(/\/$/, '')
    }
    return u
  } catch {
    return u
  }
}

function authHeaders(preset: ModelPreset): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01'
  }
  const key = preset.apiKey?.trim()
  if (key) {
    headers['x-api-key'] = key
    headers['authorization'] = `Bearer ${key}`
  }
  return headers
}

/**
 * GET /v1/models — works for Anthropic official and most Anthropic-compatible gateways.
 * Note: MiniMax also exposes OpenAI-style `/v1/models` on the bare host, which does NOT
 * prove the Anthropic path works. Prefer `probeMessages` for a real chat check.
 */
export async function fetchModelList(preset: ModelPreset): Promise<ConnectivityResult> {
  // Prefer the messages-adjacent models route when we know the anthropic prefix
  const base = resolveBaseUrl(preset)
  const started = Date.now()
  const candidates = [`${base}/v1/models`, `${base.replace(/\/anthropic$/, '')}/v1/models`]
  let lastErr = ''
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders(preset),
        signal: AbortSignal.timeout(15_000)
      })
      const latencyMs = Date.now() - started
      if (!res.ok) {
        lastErr = `GET ${url} → HTTP ${res.status}`
        continue
      }
      const json = (await res.json()) as {
        data?: Array<{ id?: string; display_name?: string; name?: string }>
        models?: Array<{ id?: string; display_name?: string; name?: string }>
      }
      const rows = json.data ?? json.models ?? []
      const models = rows
        .filter((m) => m && (m.id || m.name))
        .map((m) => ({
          id: String(m.id ?? m.name),
          label: String(m.display_name ?? m.name ?? m.id)
        }))
      return {
        ok: true,
        latencyMs,
        message: `连通成功，发现 ${models.length} 个模型（${latencyMs}ms）`,
        models
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    ok: false,
    message: lastErr || '拉取模型列表失败',
    latencyMs: Date.now() - started
  }
}

/**
 * Real chat probe: POST `{base}/v1/messages` with the selected model.
 * Catches path bugs (missing /anthropic) that GET /v1/models cannot.
 */
export async function testConnectivity(preset: ModelPreset): Promise<ConnectivityResult> {
  const base = resolveBaseUrl(preset)
  const started = Date.now()
  const model = preset.model?.trim() || 'MiniMax-M3'
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: authHeaders(preset),
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }]
      }),
      signal: AbortSignal.timeout(20_000)
    })
    const latencyMs = Date.now() - started
    const text = await res.text().catch(() => '')
    if (res.ok) {
      return {
        ok: true,
        latencyMs,
        message: `连通成功（${latencyMs}ms）· 模型 ${model}`
      }
    }
    // Helpful hint for the classic MiniMax path mistake
    let hint = ''
    if (
      res.status === 400 &&
      /unsupported model|model does not exist|not_found/i.test(text) &&
      !base.includes('/anthropic')
    ) {
      hint = '（接口地址可能缺少 /anthropic 路径，已自动规范化，请保存后重试）'
    }
    return {
      ok: false,
      latencyMs,
      message: `HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}${hint}`
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started
    }
  }
}
