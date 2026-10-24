import { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  SCRIPT_CENTER,
  SCRIPT_CHECK,
  SCRIPT_ELEMENT_SCROLL,
  SCRIPT_FILL,
  SCRIPT_FOCUS,
  SCRIPT_GET_ATTR,
  SCRIPT_GET_TEXT,
  SCRIPT_GET_VALUE,
  SCRIPT_QUERY,
  SCRIPT_SCROLL_BY,
  SCRIPT_SCROLL_INTO_VIEW,
  SCRIPT_SELECT_OPTION,
  SCRIPT_WAIT_STATE,
  withData
} from './browserScripts'

export type Locator = {
  testid?: string
  role?: string
  name?: string
  label?: string
  text?: string
  exact?: boolean
  css?: string
  index?: number
}

export type Rect = { x: number; y: number; w: number; h: number }

export type NodeSummary = {
  tag: string
  testid: string
  role: string
  text: string
  value: string
  disabled: boolean
  visible: boolean
  rect: Rect
}

export type ResolveResult =
  | { ok: true; count: number; summary: NodeSummary }
  | {
      ok: false
      reason: string
      count?: number
      candidates?: Array<{ i: number } & NodeSummary>
      error?: string
    }

export type WaitState = 'visible' | 'hidden' | 'enabled' | 'disabled' | 'attached' | 'text' | 'value'

const DEFAULT_TIMEOUT = 5000
const MAX_TIMEOUT = 30000
const ACTIONABILITY_POLL = 40

function getMainWindow(): BrowserWindow {
  const windows = BrowserWindow.getAllWindows()
  const win = windows.find((w) => !w.isDestroyed())
  if (!win) throw new Error('没有可用的主窗口')
  return win
}

async function evalJs<T>(script: string): Promise<T> {
  const win = getMainWindow()
  return (await win.webContents.executeJavaScript(script, true)) as T
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function clampTimeout(ms?: number): number {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT
  return Math.min(Math.floor(n), MAX_TIMEOUT)
}

function locatorError(res: { ok: false; reason: string; count?: number; candidates?: unknown; error?: string }): Error {
  const parts = [`定位失败: ${res.reason}`]
  if (typeof res.count === 'number') parts.push(`匹配 ${res.count} 个`)
  if (res.candidates) parts.push(`候选: ${JSON.stringify(res.candidates)}`)
  if (res.error) parts.push(res.error)
  return new Error(parts.join(' | '))
}

export async function resolveLocator(locator: Locator): Promise<ResolveResult> {
  try {
    return await evalJs<ResolveResult>(withData(SCRIPT_QUERY, { LOCATOR: locator }))
  } catch (err) {
    return { ok: false, reason: 'script-error', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function queryNode(locator: Locator): Promise<ResolveResult> {
  return resolveLocator(locator)
}

/** Resolve and throw on not-found/multiple so MCP tools surface isError. */
export async function requireNode(locator: Locator): Promise<NodeSummary> {
  const res = await resolveLocator(locator)
  if (!res.ok) throw locatorError(res)
  return res.summary
}

export async function getText(locator: Locator): Promise<string> {
  const res = await evalJs<{ ok: boolean; text?: string } & { reason?: string }>(
    withData(SCRIPT_GET_TEXT, { LOCATOR: locator })
  )
  if (!res.ok) throw locatorError(res as { ok: false; reason: string })
  return res.text ?? ''
}

export async function getValue(locator: Locator): Promise<string> {
  const res = await evalJs<{ ok: boolean; value?: string } & { reason?: string }>(
    withData(SCRIPT_GET_VALUE, { LOCATOR: locator })
  )
  if (!res.ok) throw locatorError(res as { ok: false; reason: string })
  return res.value ?? ''
}

export async function getAttr(locator: Locator, name: string): Promise<string | null> {
  const res = await evalJs<{ ok: boolean; value?: string | null } & { reason?: string }>(
    withData(SCRIPT_GET_ATTR, { LOCATOR: locator, ATTR: name })
  )
  if (!res.ok) throw locatorError(res as { ok: false; reason: string })
  return res.value ?? null
}

export async function waitFor(
  locator: Locator,
  state: WaitState,
  opts?: { text?: string; timeoutMs?: number }
): Promise<{ ok: true; waitedMs: number; count?: number; text?: string; value?: string }> {
  const timeout = clampTimeout(opts?.timeoutMs)
  const start = Date.now()
  let last: Record<string, unknown> = {}
  while (Date.now() - start < timeout) {
    last = await evalJs<Record<string, unknown>>(
      withData(SCRIPT_WAIT_STATE, {
        LOCATOR: locator,
        STATE: state,
        TEXT: opts?.text ?? null
      })
    )
    if (last.ok === true) {
      return {
        ok: true,
        waitedMs: Date.now() - start,
        count: typeof last.count === 'number' ? last.count : undefined,
        text: typeof last.text === 'string' ? last.text : undefined,
        value: typeof last.value === 'string' ? last.value : undefined
      }
    }
    await sleep(ACTIONABILITY_POLL)
  }
  throw new Error(
    `wait_for 超时 ${timeout}ms（state=${state}）: ${JSON.stringify(last).slice(0, 400)}`
  )
}

export async function scrollIntoView(locator: Locator): Promise<NodeSummary> {
  const res = await evalJs<{ ok: boolean; summary?: NodeSummary; reason?: string }>(
    withData(SCRIPT_SCROLL_INTO_VIEW, { LOCATOR: locator })
  )
  if (!res.ok || !res.summary) throw locatorError(res as { ok: false; reason: string })
  return res.summary
}

type CenterResult = {
  ok: boolean
  x?: number
  y?: number
  rect?: Rect
  action?: { ok: boolean; reason: string; hit?: string }
  reason?: string
  candidates?: unknown
  count?: number
}

/**
 * Playwright-style actionability gate: scroll into view, then poll until the
 * element is visible, enabled, and its center is hit-testable (not obscured).
 */
async function readyForAction(locator: Locator, timeoutMs?: number): Promise<{ x: number; y: number; rect: Rect }> {
  const timeout = clampTimeout(timeoutMs)
  const start = Date.now()
  let lastReason = ''
  while (Date.now() - start < timeout) {
    const center = await evalJs<CenterResult>(withData(SCRIPT_CENTER, { LOCATOR: locator }))
    if (!center.ok) throw locatorError(center as { ok: false; reason: string })
    const act = center.action
    if (act?.ok && typeof center.x === 'number' && typeof center.y === 'number' && center.rect) {
      return { x: center.x, y: center.y, rect: center.rect }
    }
    lastReason = act?.reason ?? 'not-ready'
    // try scroll if obscured / zero-size
    if (lastReason === 'obscured' || lastReason === 'zero-size' || lastReason === 'not-visible') {
      await evalJs(withData(SCRIPT_SCROLL_INTO_VIEW, { LOCATOR: locator }))
    }
    await sleep(ACTIONABILITY_POLL)
  }
  throw new Error(`actionability 超时 ${timeout}ms: ${lastReason}`)
}

function modifiersOf(list?: string[]): Array<'shift' | 'control' | 'ctrl' | 'alt' | 'meta' | 'command' | 'isKeypad'> {
  const out: Array<'shift' | 'control' | 'ctrl' | 'alt' | 'meta' | 'command' | 'isKeypad'> = []
  for (const raw of list ?? []) {
    const m = raw.toLowerCase()
    if (m === 'shift') out.push('shift')
    else if (m === 'ctrl' || m === 'control') out.push('control')
    else if (m === 'alt') out.push('alt')
    else if (m === 'meta' || m === 'cmd' || m === 'command') out.push('meta')
  }
  return out
}

export type ClickOptions = {
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  modifiers?: string[]
  timeoutMs?: number
}

export async function click(locator: Locator, opts?: ClickOptions): Promise<{ ok: true; x: number; y: number }> {
  const { x, y } = await readyForAction(locator, opts?.timeoutMs)
  const win = getMainWindow()
  const wc = win.webContents
  const button = opts?.button ?? 'left'
  const clickCount = opts?.clickCount === 2 ? 2 : 1
  const modifiers = modifiersOf(opts?.modifiers)
  wc.focus()
  wc.sendInputEvent({ type: 'mouseMove', x, y, modifiers })
  wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount, modifiers })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount, modifiers })
  return { ok: true, x, y }
}

export async function dblclick(locator: Locator, opts?: ClickOptions): Promise<{ ok: true; x: number; y: number }> {
  return click(locator, { ...opts, clickCount: 2 })
}

export async function hover(locator: Locator, opts?: { timeoutMs?: number }): Promise<{ ok: true; x: number; y: number }> {
  const { x, y } = await readyForAction(locator, opts?.timeoutMs)
  const win = getMainWindow()
  win.webContents.focus()
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  return { ok: true, x, y }
}

export async function fill(
  locator: Locator,
  value: string,
  opts?: { timeoutMs?: number }
): Promise<{ ok: true; value: string }> {
  await readyForAction(locator, opts?.timeoutMs)
  const res = await evalJs<{ ok: boolean; value?: string; reason?: string }>(
    withData(SCRIPT_FILL, { LOCATOR: locator, VALUE: value })
  )
  if (!res.ok) throw new Error(`fill 失败: ${res.reason ?? 'unknown'}`)
  return { ok: true, value: res.value ?? value }
}

export async function clear(locator: Locator, opts?: { timeoutMs?: number }): Promise<{ ok: true; value: string }> {
  return fill(locator, '', opts)
}

const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  space: 'Space',
  ' ': 'Space',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

function normalizeKey(key: string): string {
  const k = key.trim()
  if (k.length === 1) return k
  return KEY_ALIASES[k.toLowerCase()] ?? k
}

export async function pressKey(
  key: string,
  opts?: { locator?: Locator; modifiers?: string[]; timeoutMs?: number }
): Promise<{ ok: true; key: string }> {
  const win = getMainWindow()
  const wc = win.webContents
  if (opts?.locator) {
    await readyForAction(opts.locator, opts.timeoutMs)
    await evalJs(withData(SCRIPT_FOCUS, { LOCATOR: opts.locator }))
  }
  wc.focus()
  const keyCode = normalizeKey(key)
  const modifiers = modifiersOf(opts?.modifiers)
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return { ok: true, key: keyCode }
}

export async function typeText(
  locator: Locator,
  text: string,
  opts?: { delayMs?: number; timeoutMs?: number }
): Promise<{ ok: true; length: number }> {
  await readyForAction(locator, opts?.timeoutMs)
  await evalJs(withData(SCRIPT_FOCUS, { LOCATOR: locator }))
  const win = getMainWindow()
  const wc = win.webContents
  wc.focus()
  const delay = Math.max(0, Math.min(Number(opts?.delayMs) || 0, 200))
  for (const ch of text) {
    // Real key path: keyDown → char → keyUp (matches text input + shortcut handling).
    if (ch === '\n') {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    } else {
      wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
      wc.sendInputEvent({ type: 'char', keyCode: ch })
      wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    }
    if (delay) await sleep(delay)
  }
  return { ok: true, length: text.length }
}

export async function selectOption(
  locator: Locator,
  opts: { value?: string; label?: string; timeoutMs?: number }
): Promise<{ ok: true; value: string }> {
  await readyForAction(locator, opts.timeoutMs)
  const res = await evalJs<{ ok: boolean; value?: string; reason?: string; options?: unknown }>(
    withData(SCRIPT_SELECT_OPTION, {
      LOCATOR: locator,
      VALUE: opts.value ?? null,
      LABEL: opts.label ?? null
    })
  )
  if (!res.ok) throw new Error(`select_option 失败: ${res.reason ?? 'unknown'} ${JSON.stringify(res.options ?? '')}`)
  return { ok: true, value: res.value ?? '' }
}

export async function setChecked(
  locator: Locator,
  want: boolean,
  opts?: { timeoutMs?: number }
): Promise<{ ok: true; checked: boolean }> {
  await readyForAction(locator, opts?.timeoutMs)
  const res = await evalJs<{ ok: boolean; checked?: boolean; reason?: string }>(
    withData(SCRIPT_CHECK, { LOCATOR: locator, WANT: want })
  )
  if (!res.ok) throw new Error(`check 失败: ${res.reason ?? 'unknown'}`)
  return { ok: true, checked: Boolean(res.checked) }
}

export async function scrollBy(
  deltaX: number,
  deltaY: number,
  opts?: { x?: number; y?: number; locator?: Locator }
): Promise<{ ok: true }> {
  if (opts?.locator) {
    await evalJs(
      withData(SCRIPT_ELEMENT_SCROLL, {
        LOCATOR: opts.locator,
        X: deltaX,
        Y: deltaY,
        ABS_X: opts.x ?? null,
        ABS_Y: opts.y ?? null
      })
    )
    return { ok: true }
  }
  await evalJs(
    withData(SCRIPT_SCROLL_BY, {
      X: deltaX,
      Y: deltaY,
      ABS_X: opts?.x ?? null,
      ABS_Y: opts?.y ?? null
    })
  )
  return { ok: true }
}

export type DragResult = { ok: true; from: { x: number; y: number }; to: { x: number; y: number } }

/**
 * mouseDown → ≥3 interpolated mouseMove → mouseUp.
 * HTML5 native DnD (draggable=true) is not reliable with synthetic input;
 * plugins should implement drag with pointer/mouse events instead.
 */
export async function drag(
  from: Locator,
  to: Locator,
  opts?: { timeoutMs?: number; steps?: number }
): Promise<DragResult> {
  const a = await readyForAction(from, opts?.timeoutMs)
  const b = await readyForAction(to, opts?.timeoutMs)
  const steps = Math.max(3, Math.min(Number(opts?.steps) || 8, 24))
  const win = getMainWindow()
  const wc = win.webContents
  wc.focus()
  wc.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y })
  wc.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 })
  await sleep(16)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    wc.sendInputEvent({ type: 'mouseMove', x, y })
    await sleep(16)
  }
  wc.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 })
  return { ok: true, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } }
}

export async function screenshotElement(
  locator: Locator,
  opts?: { timeoutMs?: number }
): Promise<{ path: string; base64: string; width: number; height: number }> {
  await readyForAction(locator, opts?.timeoutMs)
  const win = getMainWindow()
  await new Promise((r) => setTimeout(r, 50))
  const full = await win.webContents.capturePage()
  // capturePage / NativeImage.crop both use DIP; getBoundingClientRect is CSS px = DIP at zoom 100%.
  const center = await evalJs<CenterResult>(withData(SCRIPT_CENTER, { LOCATOR: locator }))
  if (!center.ok || !center.rect) throw locatorError(center as { ok: false; reason: string })
  const r = center.rect
  const size = full.getSize()
  const x = Math.max(0, Math.floor(r.x))
  const y = Math.max(0, Math.floor(r.y))
  const w = Math.max(1, Math.min(Math.ceil(r.w), size.width - x))
  const h = Math.max(1, Math.min(Math.ceil(r.h), size.height - y))
  const cropped = full.crop({ x, y, width: w, height: h })
  const png = cropped.toPNG()
  const dir = path.join(app.getPath('userData'), 'ui-acceptance')
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `el-${stamp}.png`)
  await fs.writeFile(file, png)
  return {
    path: file,
    base64: png.toString('base64'),
    width: cropped.getSize().width,
    height: cropped.getSize().height
  }
}
