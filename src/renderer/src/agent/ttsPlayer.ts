import type { TtsStatusEvent } from './types'

let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null
let unsubAudio: (() => void) | null = null
let unsubStatus: (() => void) | null = null

type TtsAudioPayload = {
  stop?: boolean
  taskId?: string
  messageId?: string
  format?: string
  audio?: Uint8Array | ArrayBuffer
}

function revokeUrl(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

export function stopTtsPlayback(): void {
  if (audio) {
    audio.pause()
    audio.src = ''
    audio = null
  }
  revokeUrl()
}

function playBytes(bytes: Uint8Array | ArrayBuffer, format: string): void {
  stopTtsPlayback()
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // Copy into a fresh ArrayBuffer so BlobPart typing is clean across TS versions.
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)
  const mime =
    format === 'wav' ? 'audio/wav' : format === 'opus' ? 'audio/ogg' : 'audio/mpeg'
  const blob = new Blob([copy.buffer], { type: mime })
  objectUrl = URL.createObjectURL(blob)
  audio = new Audio(objectUrl)
  audio.addEventListener('ended', () => {
    revokeUrl()
    audio = null
  })
  audio.addEventListener('error', () => {
    stopTtsPlayback()
  })
  void audio.play().catch((err) => {
    console.warn('[tts] play failed', err)
    stopTtsPlayback()
  })
}

/** Wire main→renderer TTS audio/status events to an <audio> element. Idempotent. */
export function ensureTtsPlayer(): void {
  if (unsubAudio) return
  unsubAudio = window.devdash.on('agent:tts:audio', (payload) => {
    const p = payload as TtsAudioPayload
    if (!p || p.stop) {
      stopTtsPlayback()
      return
    }
    if (!p.audio) return
    playBytes(p.audio, p.format || 'mp3')
  })
  unsubStatus = window.devdash.on('agent:tts:status', (payload) => {
    const s = payload as TtsStatusEvent
    if (s?.state === 'idle' || s?.state === 'error') {
      // Keep bytes playing until ended; only clear on explicit stop via audio event.
      if (s.state === 'idle') stopTtsPlayback()
    }
  })
}

export function disposeTtsPlayer(): void {
  stopTtsPlayback()
  unsubAudio?.()
  unsubStatus?.()
  unsubAudio = null
  unsubStatus = null
}
