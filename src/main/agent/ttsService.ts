import { BrowserWindow } from 'electron'
import { loadSettings, normalizeTts } from './modelConfig'
import type { TtsConfig, TtsFormat, TtsSpeakResult, TtsStatusEvent } from './types'

const TIMEOUT_MS = 15_000

let abortCtl: AbortController | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(channel, payload)
  }
}

function emitStatus(status: TtsStatusEvent): void {
  broadcast('agent:tts:status', status)
}

/**
 * Strip trailing `/` and `/v1` so `{base}/v1/audio/speech` never becomes `/v1/v1/...`.
 */
export function normalizeTtsBase(url: string): string {
  let u = url.trim()
  if (!u) return ''
  u = u.replace(/\/+$/, '')
  u = u.replace(/\/v1$/i, '')
  return u
}

/** Collapse whitespace and drop fenced code blocks (not useful for speech). */
export function prepareSpeakText(text: string, maxChars: number): string | null {
  const withoutFences = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
  const collapsed = withoutFences.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  if (collapsed.length <= maxChars) return collapsed
  return `${collapsed.slice(0, maxChars)}（内容过长已省略）`
}

export type SynthesizeOk = {
  ok: true
  audio: Uint8Array
  format: TtsFormat
}

export type SynthesizeFail = { ok: false; error: string }

export type SynthesizeResult = SynthesizeOk | SynthesizeFail

/** Link optional caller abort with a hard 15s timeout. */
function withTimeout(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ctl = new AbortController()
  const timer = setTimeout(() => {
    ctl.abort(new DOMException('TTS 请求超时', 'TimeoutError'))
  }, TIMEOUT_MS)
  const onAbort = (): void => {
    ctl.abort(signal?.reason ?? new DOMException('TTS 已取消', 'AbortError'))
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: ctl.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

export async function synthesize(
  text: string,
  cfg: TtsConfig,
  signal?: AbortSignal
): Promise<SynthesizeResult> {
  const base = normalizeTtsBase(cfg.baseUrl)
  if (!base) return { ok: false, error: '请完善语音设置：Base URL' }
  if (!cfg.apiKey?.trim()) return { ok: false, error: '请完善语音设置：API Key' }
  const input = text.trim()
  if (!input) return { ok: false, error: '没有可朗读的文本' }

  const url = `${base}/v1/audio/speech`
  const timed = withTimeout(signal)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: timed.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        voice: cfg.voice,
        input,
        speed: cfg.speed,
        response_format: cfg.format
      })
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const hint =
        res.status === 401 || res.status === 403
          ? '（请检查 API Key）'
          : res.status === 404
            ? '（请检查 Base URL / 模型）'
            : ''
      return {
        ok: false,
        error: `TTS HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ''}${hint}`
      }
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0) return { ok: false, error: 'TTS 返回空音频' }
    return { ok: true, audio: buf, format: cfg.format }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { ok: false, error: `TTS 超时（${Math.round(TIMEOUT_MS / 1000)}s）` }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'TTS 已取消' }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    timed.cleanup()
  }
}

function abortInFlight(): void {
  if (abortCtl) {
    abortCtl.abort()
    abortCtl = null
  }
}

/** Stop in-flight synth + current playback (new speech / user stop / new turn). */
export function stopSpeaking(): void {
  abortInFlight()
  broadcast('agent:tts:audio', { stop: true })
  emitStatus({ state: 'idle' })
}

/** Cancel only playback + in-flight synth; used when a new assistant stream starts. */
export function interruptSpeaking(): void {
  stopSpeaking()
}

function resolveConfig(override?: Partial<TtsConfig>): Promise<TtsConfig> {
  return loadSettings().then((s) => normalizeTts({ ...s.tts, ...override }))
}

async function speakWithConfig(
  prepared: string,
  cfg: TtsConfig,
  opts: { taskId?: string; messageId?: string }
): Promise<TtsSpeakResult> {
  // Interrupt previous playback before starting a new request (S2.4.2).
  abortInFlight()
  broadcast('agent:tts:audio', { stop: true })

  abortCtl = new AbortController()
  const signal = abortCtl.signal
  emitStatus({ state: 'speaking', ...opts })

  const result = await synthesize(prepared, cfg, signal)
  if (abortCtl?.signal === signal) abortCtl = null

  if (!result.ok) {
    emitStatus({ state: 'error', error: result.error })
    return result
  }
  broadcast('agent:tts:audio', {
    stop: false,
    taskId: opts.taskId,
    messageId: opts.messageId,
    format: result.format,
    audio: result.audio
  })
  return { ok: true, bytes: result.audio.byteLength, format: result.format }
}

/** Auto-speak an assistant message body (fire-and-forget from agentRuntime). */
export async function speakAssistantText(
  text: string,
  opts: { taskId?: string; messageId?: string } = {}
): Promise<void> {
  try {
    const cfg = await resolveConfig()
    if (!cfg.enabled) return
    const prepared = prepareSpeakText(text, cfg.maxChars)
    if (!prepared) return
    await speakWithConfig(prepared, cfg, opts)
  } catch (err) {
    console.warn('[tts] speakAssistantText failed', err)
    emitStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Preview with optional draft form values (not yet saved).
 * Matches the `testModel(draft connection)` pattern in model settings.
 */
export async function previewTts(
  text?: string,
  draft?: Partial<TtsConfig>
): Promise<TtsSpeakResult> {
  try {
    const cfg = await resolveConfig(draft)
    const sample = text?.trim() || '这是语音试听。'
    const prepared = prepareSpeakText(sample, cfg.maxChars) ?? '这是语音试听。'
    return await speakWithConfig(prepared, cfg, {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitStatus({ state: 'error', error: message })
    return { ok: false, error: message }
  }
}

export function shutdownTts(): void {
  abortInFlight()
}
