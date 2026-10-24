import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentSettings,
  ConnectivityResult,
  ModelEntry,
  ProviderConfig,
  ProviderConnection,
  ResolvedModel,
  TtsConfig,
  TtsFormat
} from './types'

const FILE = 'agent-settings.json'

export const DEFAULT_CONTEXT_INPUT = 1_000_000
export const DEFAULT_CONTEXT_OUTPUT = 131_072

export function newId(): string {
  return randomUUID()
}

function defaultModel(): ModelEntry {
  return {
    id: 'anthropic-default',
    model: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    contextInputTokens: DEFAULT_CONTEXT_INPUT,
    contextOutputTokens: DEFAULT_CONTEXT_OUTPUT
  }
}

function defaultProvider(): ProviderConfig {
  return {
    id: 'anthropic-default-provider',
    label: 'Claude（订阅）',
    provider: 'anthropic',
    protocol: 'anthropic-messages',
    authMode: 'subscription',
    models: [defaultModel()]
  }
}

export const DEFAULT_TTS: TtsConfig = {
  enabled: false,
  baseUrl: '',
  apiKey: '',
  model: 'tts-1',
  voice: 'alloy',
  speed: 1,
  format: 'mp3',
  maxChars: 2000
}

export const DEFAULT_SETTINGS: AgentSettings = {
  providers: [defaultProvider()],
  activeModelId: 'anthropic-default',
  uiDev: { enableCdp: false, cdpPort: 9222 },
  tts: { ...DEFAULT_TTS }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), FILE)
}

function normalizeModelEntry(m: Partial<ModelEntry> & { id: string }, fallbackLabel?: string): ModelEntry {
  return {
    id: m.id,
    model: m.model || 'claude-sonnet-4-5',
    label: m.label || fallbackLabel || m.model || '模型',
    contextInputTokens: m.contextInputTokens ?? DEFAULT_CONTEXT_INPUT,
    contextOutputTokens: m.contextOutputTokens ?? DEFAULT_CONTEXT_OUTPUT
  }
}

function normalizeProvider(p: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  const baseUrl = p.baseUrl ? normalizeAnthropicBase(p.baseUrl) : p.baseUrl
  const models = Array.isArray(p.models)
    ? p.models
        .filter((m): m is ModelEntry => !!(m && m.id))
        .map((m) => normalizeModelEntry(m))
    : []
  return {
    id: p.id,
    label: p.label || (p.provider === 'anthropic' ? 'Anthropic' : '自定义端点'),
    provider: p.provider ?? (baseUrl ? 'custom' : 'anthropic'),
    protocol: p.protocol ?? 'anthropic-messages',
    baseUrl,
    apiKey: p.apiKey,
    authMode: p.authMode ?? 'api-key',
    models,
    lastTest: p.lastTest
  }
}

/**
 * Legacy flat `presets[]` → hierarchical `providers[]`.
 * Each old preset becomes a provider with a single model, keeping the preset id
 * as the ModelEntry id so existing `task.modelId` values still resolve.
 */
function migrateLegacyPresets(raw: Record<string, unknown>): AgentSettings | null {
  const presets = raw.presets
  if (!Array.isArray(presets) || presets.length === 0) return null

  const providers: ProviderConfig[] = []
  const modelIds = new Set<string>()
  let firstModelId = ''

  for (const p of presets as Array<Record<string, unknown> & { id?: string }>) {
    if (!p || !p.id) continue
    const modelId = String(p.id)
    const entry = normalizeModelEntry(
      {
        id: modelId,
        model: typeof p.model === 'string' ? p.model : undefined,
        label: typeof p.label === 'string' ? p.label : undefined,
        contextInputTokens:
          typeof p.contextInputTokens === 'number' ? p.contextInputTokens : undefined,
        contextOutputTokens:
          typeof p.contextOutputTokens === 'number' ? p.contextOutputTokens : undefined
      } as Partial<ModelEntry> & { id: string },
      typeof p.label === 'string' ? p.label : undefined
    )
    providers.push({
      id: `${modelId}:provider`,
      label: typeof p.label === 'string' ? p.label : entry.model,
      provider: (p.provider as ProviderConfig['provider']) ?? (p.baseUrl ? 'custom' : 'anthropic'),
      protocol: 'anthropic-messages',
      baseUrl: typeof p.baseUrl === 'string' ? normalizeAnthropicBase(p.baseUrl) : undefined,
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : undefined,
      authMode: (p.authMode as ProviderConfig['authMode']) ?? 'api-key',
      models: [entry],
      lastTest: p.lastTest as ProviderConfig['lastTest']
    })
    modelIds.add(modelId)
    if (!firstModelId) firstModelId = modelId
  }

  if (providers.length === 0) return null

  const rawActive = typeof raw.activePresetId === 'string' ? raw.activePresetId : ''
  const activeModelId = modelIds.has(rawActive) ? rawActive : firstModelId
  return {
    providers,
    activeModelId,
    uiDev: normalizeUiDev(raw.uiDev as AgentSettings['uiDev']),
    tts: normalizeTts(raw.tts as Partial<TtsConfig>)
  }
}

export async function loadSettings(): Promise<AgentSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_SETTINGS, providers: [defaultProvider()], tts: normalizeTts(undefined) }
    }

    // New hierarchical format
    if (Array.isArray(parsed.providers)) {
      const providers = (parsed.providers as ProviderConfig[])
        .filter((p) => p && p.id)
        .map((p) => normalizeProvider(p))
        .filter((p) => p.models.length > 0)
      if (providers.length === 0) {
        return { ...DEFAULT_SETTINGS, providers: [defaultProvider()], tts: normalizeTts(undefined) }
      }
      const allModels = providers.flatMap((p) => p.models)
      const rawActive = typeof parsed.activeModelId === 'string' ? parsed.activeModelId : ''
      const activeModelId =
        allModels.find((m) => m.id === rawActive)?.id ?? allModels[0].id
      return {
        providers,
        activeModelId,
        uiDev: normalizeUiDev(parsed.uiDev as AgentSettings['uiDev']),
        tts: normalizeTts(parsed.tts as Partial<TtsConfig>)
      }
    }

    // Legacy presets format → migrate
    const migrated = migrateLegacyPresets(parsed)
    if (migrated) {
      // Persist the migration so subsequent loads hit the new path.
      await saveSettings(migrated).catch(() => undefined)
      return migrated
    }

    return { ...DEFAULT_SETTINGS, providers: [defaultProvider()], tts: normalizeTts(undefined) }
  } catch {
    return { ...DEFAULT_SETTINGS, providers: [defaultProvider()], tts: normalizeTts(undefined) }
  }
}

function normalizeUiDev(raw: Partial<AgentSettings['uiDev']>): AgentSettings['uiDev'] {
  const enableCdp = raw?.enableCdp === true
  const portNum = Number(raw?.cdpPort)
  const cdpPort = Number.isInteger(portNum) && portNum >= 1024 && portNum <= 65535 ? portNum : 9222
  return { enableCdp, cdpPort }
}

export function normalizeTts(raw?: Partial<TtsConfig>): TtsConfig {
  const speedNum = Number(raw?.speed)
  const maxNum = Number(raw?.maxChars)
  const format = (raw?.format ?? DEFAULT_TTS.format) as TtsFormat
  return {
    enabled: raw?.enabled === true,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl.trim() : '',
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : '',
    model: typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_TTS.model,
    voice: typeof raw?.voice === 'string' && raw.voice.trim() ? raw.voice.trim() : DEFAULT_TTS.voice,
    speed:
      Number.isFinite(speedNum) && speedNum >= 0.25 && speedNum <= 4
        ? speedNum
        : DEFAULT_TTS.speed,
    format: format === 'mp3' || format === 'wav' || format === 'opus' ? format : 'mp3',
    maxChars: Number.isInteger(maxNum) && maxNum > 0 ? Math.min(maxNum, 20_000) : DEFAULT_TTS.maxChars
  }
}

export async function saveSettings(settings: AgentSettings): Promise<void> {
  const file = settingsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const normalized: AgentSettings = {
    providers: settings.providers.map((p) =>
      p.baseUrl
        ? {
            ...p,
            baseUrl: normalizeAnthropicBase(p.baseUrl),
            models: p.models.map((m) => normalizeModelEntry(m))
          }
        : { ...p, models: p.models.map((m) => normalizeModelEntry(m)) }
    ),
    activeModelId: settings.activeModelId,
    uiDev: normalizeUiDev(settings.uiDev),
    tts: normalizeTts(settings.tts)
  }
  await fs.writeFile(file, JSON.stringify(normalized, null, 2), 'utf8')
}

/** Flat list of every selectable model (for dropdowns). */
export function listAllModels(settings: AgentSettings): ResolvedModel[] {
  const out: ResolvedModel[] = []
  for (const p of settings.providers) {
    for (const m of p.models) {
      out.push(resolveFrom(p, m))
    }
  }
  return out
}

function resolveFrom(p: ProviderConfig, m: ModelEntry): ResolvedModel {
  return {
    id: m.id,
    label: m.label,
    model: m.model,
    contextInputTokens: m.contextInputTokens ?? DEFAULT_CONTEXT_INPUT,
    contextOutputTokens: m.contextOutputTokens ?? DEFAULT_CONTEXT_OUTPUT,
    provider: p.provider,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    authMode: p.authMode,
    providerId: p.id
  }
}

/**
 * Resolve a ModelEntry id (or legacy preset id) to a flat runtime model.
 * Falls back to the active model, then the first configured model.
 */
export function pickModel(settings: AgentSettings, modelId?: string): ResolvedModel | undefined {
  const all = listAllModels(settings)
  if (modelId) {
    const hit = all.find((m) => m.id === modelId)
    if (hit) return hit
  }
  return all.find((m) => m.id === settings.activeModelId) ?? all[0]
}

/**
 * Map a resolved model to Claude Agent SDK env vars.
 * `options.env` replaces process.env, so callers must spread process.env first.
 *
 * Custom/non-Claude endpoints (e.g. MiniMax-M3) must pin ALL model aliases —
 * Claude Code otherwise falls back to haiku/sonnet for internal calls and the
 * gateway returns `400 Unsupported model`.
 */
export function buildEnvForModel(model: ResolvedModel): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    CLAUDE_AGENT_SDK_CLIENT_APP: 'DevDash/0.1.0'
  }

  const baseUrl = model.baseUrl?.trim()
  const apiKey = model.apiKey?.trim()
  const modelId = model.model?.trim()

  if (model.provider === 'custom' || baseUrl) {
    if (baseUrl) env.ANTHROPIC_BASE_URL = normalizeAnthropicBase(baseUrl)
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey
      env.ANTHROPIC_AUTH_TOKEN = apiKey
    }
    // Pin every alias to the configured model so internal haiku/sonnet calls work
    if (modelId) {
      env.ANTHROPIC_MODEL = modelId
      env.ANTHROPIC_SMALL_FAST_MODEL = modelId
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelId
      env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME = modelId
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelId
      env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME = modelId
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelId
    }
    return env
  }

  // Anthropic official
  if (model.authMode === 'api-key' && apiKey) {
    env.ANTHROPIC_API_KEY = apiKey
    env.ANTHROPIC_AUTH_TOKEN = apiKey
  }
  if (modelId) {
    env.ANTHROPIC_MODEL = modelId
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelId
    env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME = modelId
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelId
    env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME = modelId
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelId
    env.ANTHROPIC_SMALL_FAST_MODEL = modelId
  }
  return env
}

/**
 * Overlay for `options.settings.env`.
 *
 * `settingSources: ['user','project']` loads `~/.claude/settings.json`, whose `env`
 * block (base URL / model / token) would otherwise override `options.env`.
 * `--settings` / SDK `settings` sits above user settings in Claude Code's merge
 * order, so pinning the same keys here makes the DevDash model win.
 */
export function settingsEnvForModel(model: ResolvedModel): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(buildEnvForModel(model))) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

function resolveBaseUrl(conn: ProviderConnection): string {
  const raw = conn.baseUrl?.trim()
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

function authHeaders(conn: ProviderConnection): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01'
  }
  const key = conn.apiKey?.trim()
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
export async function fetchModelList(conn: ProviderConnection): Promise<ConnectivityResult> {
  const base = resolveBaseUrl(conn)
  const started = Date.now()
  const candidates = [`${base}/v1/models`, `${base.replace(/\/anthropic$/, '')}/v1/models`]
  let lastErr = ''
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders(conn),
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
export async function testConnectivity(conn: ProviderConnection): Promise<ConnectivityResult> {
  const base = resolveBaseUrl(conn)
  const started = Date.now()
  const model = conn.model?.trim() || 'MiniMax-M3'
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: authHeaders(conn),
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
