import type { AgentPhase, AgentTaskStatus } from './types'

/**
 * Live per-task status/phase from agent events.
 * Sidebar must use this (same source as the composer status chip) instead of
 * a later listTasks snapshot — the IPC list is read before a slow listSessions
 * call and can return a stale `running` after the task already finished.
 */
export type LiveStatus = {
  status: AgentTaskStatus
  phase: AgentPhase
}

const map = new Map<string, LiveStatus>()
const listeners = new Set<() => void>()
/** Bumped on every change so useSyncExternalStore can re-render. */
let version = 0

function notify(): void {
  version++
  for (const l of listeners) l()
}

export function liveStatusVersion(): number {
  return version
}

export function setLiveStatus(taskId: string, patch: Partial<LiveStatus>): void {
  const cur = map.get(taskId) ?? { status: 'idle', phase: 'idle' as AgentPhase }
  const next: LiveStatus = { ...cur, ...patch }
  if (cur.status === next.status && cur.phase === next.phase) return
  map.set(taskId, next)
  notify()
}

export function getLiveStatus(taskId: string): LiveStatus | undefined {
  return map.get(taskId)
}

/** Prefer live event status; fall back to the listTasks snapshot. */
export function resolveStatus(taskId: string, fallback: AgentTaskStatus): AgentTaskStatus {
  return map.get(taskId)?.status ?? fallback
}

export function subscribeLiveStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
