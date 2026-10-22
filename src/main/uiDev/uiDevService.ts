import { app, BrowserWindow } from 'electron'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import { refreshPlugins } from './refreshPlugins'

export type CdpInfo = {
  enabled: boolean
  active: boolean
  port?: number
  url?: string
  wsUrl?: string
  note?: string
}

export type ScreenshotResult = {
  path: string
  base64: string
  mimeType: 'image/png'
  width: number
  height: number
}

const CDP_FILE = 'cdp.json'
const SHOT_DIR = 'ui-acceptance'

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.find((w) => !w.isDestroyed()) ?? null
}

async function ensureVisible(win: BrowserWindow): Promise<void> {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'agent-settings.json')
}

function cdpFilePath(): string {
  return path.join(app.getPath('userData'), CDP_FILE)
}

/**
 * Must run before app ready. Reads agent-settings.json synchronously and
 * enables --remote-debugging-port when the user toggle is on.
 */
export function applyCdpSwitchEarly(): CdpInfo {
  let enabled = false
  let port = 9222
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as { uiDev?: { enableCdp?: boolean; cdpPort?: number } }
    const parsedEnable = parsed.uiDev?.enableCdp === true
    if (parsedEnable) {
      enabled = true
      const p = Number(parsed.uiDev?.cdpPort)
      if (Number.isInteger(p) && p >= 1024 && p <= 65535) port = p
    }
  } catch {
    /* no settings yet */
  }
  if (enabled) {
    app.commandLine.appendSwitch('remote-debugging-port', String(port))
  }
  return {
    enabled,
    active: false,
    port: enabled ? port : undefined,
    url: enabled ? `http://127.0.0.1:${port}` : undefined,
    note: enabled
      ? 'CDP 已在启动时开启'
      : 'CDP 未开启。可在「设置 → 开发调试」打开后重启应用'
  }
}

/** Persist cdp.json after ready so tools/agents can discover the port. */
export async function writeCdpInfo(info: CdpInfo): Promise<void> {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(cdpFilePath(), JSON.stringify(info, null, 2), 'utf8')
  } catch {
    /* non-fatal */
  }
}

async function probeCdp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800)
    })
    return res.ok
  } catch {
    return false
  }
}

export async function activateCdpInfo(bootstrap: CdpInfo): Promise<void> {
  if (!bootstrap.enabled || !bootstrap.port) {
    await writeCdpInfo(bootstrap)
    return
  }
  const active = await probeCdp(bootstrap.port)
  await writeCdpInfo({
    ...bootstrap,
    active,
    note: active
      ? 'CDP 已开启（本机）。可用 Playwright connectOverCDP 连接。'
      : '已设置 remote-debugging-port，但端口探测失败；请确认已重启应用且未被占用。'
  })
}

export function readCdpInfo(): CdpInfo {
  try {
    const raw = readFileSync(cdpFilePath(), 'utf8')
    return JSON.parse(raw) as CdpInfo
  } catch {
    return {
      enabled: false,
      active: false,
      note: 'CDP 未开启。可在「设置 → 开发调试」打开后重启应用'
    }
  }
}

export async function captureScreenshot(opts?: { pluginId?: string }): Promise<ScreenshotResult> {
  const win = getMainWindow()
  if (!win) throw new Error('没有可用的主窗口')
  await ensureVisible(win)
  // Let the paint settle after restore/focus
  await new Promise((r) => setTimeout(r, 50))
  const image = await win.webContents.capturePage()
  const png = image.toPNG()
  const size = image.getSize()
  const dir = path.join(app.getPath('userData'), SHOT_DIR)
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = opts?.pluginId ? `-${opts.pluginId}` : ''
  const file = path.join(dir, `shot${suffix}-${stamp}.png`)
  await fs.writeFile(file, png)
  return {
    path: file,
    base64: png.toString('base64'),
    mimeType: 'image/png',
    width: size.width,
    height: size.height
  }
}

const SNAPSHOT_SCRIPT = `(() => {
  const maxNodes = 400
  const lines = []
  const walk = (el, depth) => {
    if (lines.length >= maxNodes || depth > 12) return
    const tag = el.tagName ? el.tagName.toLowerCase() : ''
    if (!tag || tag === 'script' || tag === 'style' || tag === 'noscript') return
    const role = el.getAttribute && el.getAttribute('role')
    const aria = el.getAttribute && el.getAttribute('aria-label')
    const testid = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test-id'))
    const text = (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
    const visible = el.offsetParent !== null || el === document.body || depth === 0
    if (!visible && depth > 2) return
    const bits = []
    bits.push(tag)
    if (role) bits.push('role=' + role)
    if (testid) bits.push('testid=' + testid)
    if (aria) bits.push('label=' + aria.slice(0, 40))
    if (text && el.children && el.children.length === 0) bits.push('"' + text + '"')
    else if (text && depth <= 3) bits.push('"' + text.slice(0, 40) + '"')
    lines.push('  '.repeat(depth) + bits.join(' '))
    const kids = el.children || []
    for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1)
  }
  walk(document.body, 0)
  const title = document.title || ''
  const url = location.href || ''
  return { title, url, lines: lines.join('\\n'), nodeCount: lines.length }
})()`

export async function captureDomSnapshot(maxChars = 12000): Promise<string> {
  const win = getMainWindow()
  if (!win) throw new Error('没有可用的主窗口')
  const raw = (await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT, true)) as {
    title: string
    url: string
    lines: string
    nodeCount: number
  }
  const header = `# DOM Snapshot\nurl: ${raw.url}\ntitle: ${raw.title}\nnodes: ${raw.nodeCount}\n\n`
  const body = raw.lines
  const text = header + body
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n\n… truncated at ${maxChars} chars`
}

/**
 * Ask the renderer to drop cached plugin UI modules and re-import with a
 * cache-busting query. Does not reload plugin main / IPC.
 */
export async function reloadPluginUi(pluginId?: string): Promise<{
  ok: true
  pluginId: string | null
  method: string
  note: string
}> {
  const win = getMainWindow()
  if (!win) throw new Error('没有可用的主窗口')
  const payload = JSON.stringify({ pluginId: pluginId ?? null, t: Date.now() })
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('devdash:reload-plugin-ui', { detail: ${payload} })); true`,
    true
  )
  return {
    ok: true,
    pluginId: pluginId ?? null,
    method: 'ui-module-reload',
    note: '已通知渲染进程重载插件 UI。改过源码请先构建（仓库 npm run build:plugins，或 node <plugin-sdk>/build.mjs）。新建插件请再调用 refresh_plugins。'
  }
}

/**
 * Re-discover plugins (including new user plugins) and notify the renderer.
 * New plugin IPC works without a window reload (preload matches plugin:<id>:<suffix>).
 */
export async function refreshPluginsUi(): Promise<Record<string, unknown>> {
  const result = await refreshPlugins()
  const win = getMainWindow()
  if (win) {
    await win.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('devdash:plugins-changed', { detail: { t: Date.now(), count: ${result.count} } })); true`,
      true
    )
  }
  return { ...result, notified: Boolean(win) }
}

export function getCdpInfo(): CdpInfo {
  return readCdpInfo()
}
