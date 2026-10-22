import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { AgentEvent, PermissionRequestPayload } from './types'

type Pending = {
  resolve: (r: PermissionResult) => void
  timer: NodeJS.Timeout
  taskId: string
  toolName: string
}

const TIMEOUT_MS = 120_000

const pending = new Map<string, Pending>()

/** Injected at runtime init to avoid a static circular import. */
let allowToolForSessionFn: ((taskId: string, toolName: string) => void) | null = null

export function setAllowToolForSession(fn: (taskId: string, toolName: string) => void): void {
  allowToolForSessionFn = fn
}

function broadcast(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:event', event)
  }
}

/** Tools that never need a UI confirm (read-only / safe). */
const AUTO_ALLOW_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'TodoWrite',
  'Task',
  'NotebookRead',
  'WebSearch',
  'WebFetch'
])

/**
 * Auto-allow a single safe command only.
 * Reject shell chaining / substitution first, then require the whole string
 * (including args) to be a known safe invocation.
 */
const SHELL_METACHAR = /[\n\r;&|<>`$]/

const SAFE_BASH =
  /^\s*(npm\s+run\s+(typecheck|build|build:plugins|ensure:electron|dev|start)|node\s+scripts\/(smoke|build-plugins|ensure-electron)\.mjs|node\s+\S*plugin-sdk[/\\](build|create)\.mjs|git\s+(status|log|diff|show|branch|ls-files)|tsc\b)(\s+\S+)*\s*$/

function isSafeBash(cmd: string): boolean {
  if (SHELL_METACHAR.test(cmd)) return false
  return SAFE_BASH.test(cmd)
}

const DANGEROUS_BASH = /\b(rm\s+-rf|git\s+push\s+--force|git\s+reset\s+--hard|git\s+clean\s+-fd|sudo\b|mkfs|dd\s+if=)/

function isPathOutsideRepo(input: Record<string, unknown>, repoRoot: string): boolean {
  const candidates = [input.file_path, input.path, input.notebook_path].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  )
  for (const p of candidates) {
    const abs = path.resolve(p)
    const rel = path.relative(repoRoot, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return true
  }
  return false
}

/**
 * Host security-sensitive paths that always require UI confirm (S2.6).
 * Always resolve + relativize first — Edit/Write tools send absolute paths.
 */
function isSensitiveHostPath(input: Record<string, unknown>, repoRoot: string): boolean {
  const candidates = [input.file_path, input.path, input.notebook_path].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  )
  // Relative segment prefixes under the repo root
  const sensitivePrefixes = [
    'src/main',
    'src/preload',
    '.github',
    '.git',
    'electron.vite.config.ts',
    'electron-builder.yml',
    'electron-builder.yaml',
    'electron-builder.json',
    'package.json'
  ]
  for (const p of candidates) {
    const abs = path.resolve(p)
    const rel = path.relative(repoRoot, abs).replace(/\\/g, '/')
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue
    const base = rel.split('/').pop() ?? rel
    for (const pref of sensitivePrefixes) {
      if (rel === pref || rel.startsWith(pref + '/') || base === pref) {
        return true
      }
    }
    // electron-builder.* any extension
    if (base.startsWith('electron-builder')) return true
  }
  return false
}

export function classifyTool(
  toolName: string,
  input: Record<string, unknown>,
  repoRoot: string
): { autoAllow: boolean; dangerous: boolean } {
  if (toolName === 'AskUserQuestion') {
    // Always surface to the UI as a structured input dialog (not a danger prompt).
    return { autoAllow: false, dangerous: false }
  }
  if (AUTO_ALLOW_TOOLS.has(toolName)) return { autoAllow: true, dangerous: false }

  // In-app UI acceptance tools (SDK MCP) — read-only capture / UI module reload.
  if (toolName.startsWith('mcp__devdash__')) {
    return { autoAllow: true, dangerous: false }
  }

  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '')
    if (DANGEROUS_BASH.test(cmd)) return { autoAllow: false, dangerous: true }
    if (isSafeBash(cmd)) return { autoAllow: true, dangerous: false }
    return { autoAllow: false, dangerous: true }
  }

  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
    if (isPathOutsideRepo(input, repoRoot)) return { autoAllow: false, dangerous: true }
    // Sensitive host paths always need a human confirm
    if (isSensitiveHostPath(input, repoRoot)) return { autoAllow: false, dangerous: true }
    // Workspace writes are allowed per product decision
    return { autoAllow: true, dangerous: false }
  }

  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
    return { autoAllow: true, dangerous: false }
  }

  // Unknown tools: ask, treat as potentially dangerous
  return { autoAllow: false, dangerous: true }
}

export function requestPermission(params: {
  taskId: string
  toolName: string
  input: Record<string, unknown>
  title?: string
  description?: string
  displayName?: string
  blockedPath?: string
  dangerous: boolean
}): Promise<PermissionResult> {
  const requestId = randomUUID()
  const inputPreview = (() => {
    try {
      return JSON.stringify(params.input, null, 2).slice(0, 2000)
    } catch {
      return String(params.input)
    }
  })()

  const payload: PermissionRequestPayload = {
    requestId,
    taskId: params.taskId,
    toolName: params.toolName,
    title: params.title ?? `${params.toolName} 请求授权`,
    description: params.description,
    displayName: params.displayName,
    inputPreview,
    blockedPath: params.blockedPath,
    dangerous: params.dangerous
  }

  broadcast({ type: 'permission', payload })

  return new Promise<PermissionResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve({
        behavior: 'deny',
        message: '权限确认超时，已拒绝该操作。'
      })
    }, TIMEOUT_MS)

    pending.set(requestId, {
      resolve,
      timer,
      taskId: params.taskId,
      toolName: params.toolName
    })
  })
}

export function respondPermission(
  requestId: string,
  allow: boolean,
  reason?: string,
  rememberSession?: boolean,
  updatedInput?: Record<string, unknown>
): boolean {
  const entry = pending.get(requestId)
  if (!entry) return false
  clearTimeout(entry.timer)
  pending.delete(requestId)
  if (allow && rememberSession) {
    // Session-scoped: same tool auto-allows until the session ends.
    allowToolForSessionFn?.(entry.taskId, entry.toolName)
  }
  entry.resolve(
    allow
      ? updatedInput
        ? { behavior: 'allow', updatedInput }
        : { behavior: 'allow' }
      : { behavior: 'deny', message: reason?.trim() || '用户拒绝了该操作。' }
  )
  return true
}

export function denyAllPending(message = '会话已取消。', onlyTaskId?: string): void {
  for (const [id, entry] of pending) {
    if (onlyTaskId && entry.taskId !== onlyTaskId) continue
    clearTimeout(entry.timer)
    entry.resolve({ behavior: 'deny', message })
    pending.delete(id)
  }
}
