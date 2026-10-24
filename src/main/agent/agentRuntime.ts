import { BrowserWindow, app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { CanUseTool, PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type {
  AccessMode,
  AgentEvent,
  AgentPhase,
  AgentTask,
  ChatMessage,
  ResolvedModel,
  ToolStatus
} from './types'
import { buildEnvForModel, loadSettings, pickModel, settingsEnvForModel } from './modelConfig'
import * as sessionStore from './sessionStore'
import { classifyTool, denyAllPending, requestPermission, setAllowToolForSession } from './permissionBridge'
import { pluginRegistry } from '../plugin/registry'
import { buildSkillContext, listSkills } from './skills'
import { repoRoot } from './repoRoot'
import { pluginSdkRoot } from './pluginSdk'

/** Prefer full Error.stack (message + frames) so the UI can show/copy the whole failure. */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || err.message || String(err)
  }
  return String(err)
}

/**
 * Native Claude Code CLI shipped with the installer (extraResources) or the
 * optional platform package in node_modules during development.
 * Electron cannot spawn a binary from inside asar, so packaged builds always
 * use the unpacked extraResources copy and pass it to the SDK explicitly.
 */
const NATIVE_CLI_SPEC: Record<string, string> = {
  'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
  'win32-arm64': '@anthropic-ai/claude-agent-sdk-win32-arm64/claude.exe',
  'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64/claude',
  'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
  'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
  'linux-arm64': '@anthropic-ai/claude-agent-sdk-linux-arm64/claude'
}

function resolveClaudeCliPath(): string | undefined {
  const binName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  if (app.isPackaged) {
    const packed = path.join(process.resourcesPath, 'claude', binName)
    if (!existsSync(packed)) {
      // Leaving this undefined makes the SDK resolve from asar (a file) → spawn ENOTDIR.
      throw new Error(
        `找不到 Claude Code CLI：${packed}\n请重新安装 DevDash（安装包应包含 Resources/claude/${binName}）。`
      )
    }
    return packed
  }
  const spec = NATIVE_CLI_SPEC[`${process.platform}-${process.arch}`]
  if (!spec) return undefined
  try {
    const require_ = createRequire(path.join(app.getAppPath(), 'package.json'))
    const resolved = require_.resolve(spec)
    return existsSync(resolved) ? resolved : undefined
  } catch {
    return undefined
  }
}

function buildSystemAppend(): string {
  const root = repoRoot()
  const sdk = pluginSdkRoot()
  const isUserWorkspace = Boolean(app.isPackaged) || root === app.getPath('userData')
  const modeBlock = isUserWorkspace
    ? `
【当前工作区：安装版 / userData】
- 不要寻找 DevDash 源码仓库。在这里直接开发「用户插件」。
- 新建：node "${sdk}/create.mjs" <id> [--title "标题"]  → 落到 <workspace>/plugins/<id>/
- 构建：cd plugins/<id> && node "${sdk}/build.mjs"  → 产出 dist/ui.js + dist/main.js
- 验收：mcp__devdash__refresh_plugins（新插件/列表）→ mcp__devdash__reload_plugin_ui → click/fill/wait_for 操作 → dom_snapshot / screenshot 断言
- 安装版内置插件（如 git-manager）在 resources/plugins，仅 dist、不能改源码；需要新能力就新建用户插件。
- 用户插件 SDK 根目录: ${sdk}
- 工作区根: ${root}
`
    : `
【当前工作区：DevDash 源码仓库】
- 位置 plugins/<name>/（npm workspace）；改完 npm run build:plugins。
- 完整验证：npm run typecheck → npm run build:plugins → npx electron-vite build → node scripts/smoke.mjs。
- 用户插件 SDK（也可用于外置开发）: ${sdk}
- 工作区根: ${root}
`
  return `
你是 DevDash 插件开发助手。目标：通过新建或修改 npm 插件，交付可被宿主发现与加载的插件应用。
${modeBlock}
硬约束：
- 禁止创建 .worktree、禁止新建功能分支，直接在当前工作目录修改。
- 插件必须通过 package.json 的 devdash 清单被发现；不要把插件 UI 硬编码进宿主 React 树。
- 新增 IPC 通道三处同步：清单 devdash.ipc → 插件 main registerIpc → 插件 ui api.ts。
- 主进程侧 Git/路径参数一律 execFile 数组传参；用户可控 rev/range 必须校验。
- 插件 dist/ 不作为源码提交。

UI 验收与交互工具（mcp__devdash__*，进程内 MCP，无需 Playwright）：
- 新建插件或改了插件集合 → mcp__devdash__refresh_plugins（动态重发现，无需重启）。
- 仅改已有插件 UI → 构建后 mcp__devdash__reload_plugin_ui 热重载。
- 定位器语义优先：testid > role+name > label > text > css；多匹配须传 index，否则报错并列候选。
- 交互：click / dblclick / hover / fill / type / press_key / clear / select_option / check / uncheck / scroll_into_view / scroll / drag。
- 断言：dom_snapshot / screenshot / screenshot_element / query / get_text / get_value / get_attr / wait_for。
- 交互前会自动 scrollIntoView + 可操作性检查（可见、未 disabled、中心点命中）。
- 拖拽用 pointer/mouse 事件实现，勿用原生 HTML5 draggable（合成输入下不可靠）。
- mcp__devdash__cdp_info：可选高级路径（外部 Playwright connectOverCDP）；主验证请用上述进程内工具。

插件开发模板要点：
- package.json 含 devdash: { id, title, icon, ui, main, order, ipc[] }；id 为 ^[a-z0-9][a-z0-9-]*$。
- UI 默认导出 { id, title, icon?, App }；react 由宿主注入（SDK shim / vite alias 到 host-react）。
- 用户插件构建用 node <sdk>/build.mjs（esbuild-wasm，无需本机安装 vite）。
`
}

type ActiveSession = {
  taskId: string
  query: Query
  /** Push-based user message stream for multi-turn streaming input */
  push: (msg: SDKUserMessage) => void
  end: () => void
  abort: AbortController
  accessMode: AccessMode
  pendingAssistantId?: string
  /** Streaming text buffer for the current assistant message */
  streamBuffer: string
  /** tool_use_id → chat message id */
  toolIndex: Map<string, string>
  /** Message ids of tool cards still running (for id-less result matching) */
  runningToolMsgIds: string[]
  /** Session-scoped tool allowlist from "允许并记住本会话" */
  sessionAllowedTools: Set<string>
  /** Context window size from preset */
  maxContextTokens: number
  /** Model string last applied to this live query */
  model?: string
}

const active = new Map<string, ActiveSession>()

/** Caps discovered from the latest SDK system/init frame (skills, commands, mcp…). */
export type SessionCaps = {
  skills: string[]
  slashCommands: string[]
  agents: string[]
  mcpServers: Array<{ name: string; status: string }>
  plugins: Array<{ name: string; path: string }>
}

let lastCaps: SessionCaps | null = null

export function getSessionCaps(): SessionCaps | null {
  return lastCaps
}

function broadcast(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:event', event)
  }
}

function setPhase(taskId: string, phase: AgentPhase, extra?: Partial<AgentEvent>): void {
  const base = { type: 'status' as const, taskId, status: 'running' as const, phase }
  broadcast({ ...base, ...extra } as AgentEvent)
}

function makeUserMessage(text: string, uuid?: string): SDKUserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    },
    parent_tool_use_id: null,
    // uuid optional in type; pass when available
    ...(uuid ? { uuid } : {})
  } as SDKUserMessage
}

function extractText(message: SDKMessage): string {
  if (message.type === 'assistant') {
    const content = (message as { message?: { content?: unknown } }).message?.content
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block && typeof block === 'object' && 'type' in block) {
            const b = block as { type: string; text?: string }
            if (b.type === 'text' && typeof b.text === 'string') return b.text
            // tool_use is rendered as its own chat row — skip here
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    return ''
  }
  if (message.type === 'user') {
    const content = (message as { message?: { content?: unknown } }).message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((b) => {
          if (b && typeof b === 'object' && 'type' in b && (b as { type: string }).type === 'text') {
            return (b as { text?: string }).text ?? ''
          }
          return ''
        })
        .join('')
    }
  }
  if (message.type === 'result') {
    const r = message as { result?: string; subtype?: string; error?: string }
    return r.result ?? r.error ?? ''
  }
  return ''
}

function extractToolUses(
  message: SDKMessage
): Array<{ name: string; input: Record<string, unknown>; toolUseId?: string }> {
  if (message.type !== 'assistant') return []
  const content = (message as { message?: { content?: unknown } }).message?.content
  if (!Array.isArray(content)) return []
  const out: Array<{ name: string; input: Record<string, unknown>; toolUseId?: string }> = []
  for (const block of content) {
    if (block && typeof block === 'object' && 'type' in block) {
      const b = block as { type: string; name?: string; input?: unknown; id?: string; tool_use_id?: string }
      if (b.type === 'tool_use' && typeof b.name === 'string') {
        out.push({
          name: b.name,
          input: (b.input as Record<string, unknown>) ?? {},
          toolUseId:
            typeof b.id === 'string' ? b.id : typeof b.tool_use_id === 'string' ? b.tool_use_id : undefined
        })
      }
    }
  }
  return out
}

function extractToolResults(
  message: SDKMessage
): Array<{ toolUseId: string; text: string; isError?: boolean }> {
  const any = message as {
    type?: string
    message?: { content?: unknown }
    tool_use_result?: unknown
    toolUseResult?: unknown
  }
  const out: Array<{ toolUseId: string; text: string; isError?: boolean }> = []

  const pushResult = (
    toolUseId: string,
    raw: unknown,
    isError?: boolean
  ): void => {
    let text = ''
    if (typeof raw === 'string') text = raw
    else if (raw != null) {
      try {
        text = JSON.stringify(raw, null, 2)
      } catch {
        text = String(raw)
      }
    }
    if (!text) text = '（无输出）'
    out.push({ toolUseId, text: text.slice(0, 8000), isError })
  }

  // 1) content blocks with type tool_result
  const content = any.message?.content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object' || !('type' in block)) continue
      const b = block as {
        type: string
        tool_use_id?: string
        toolUseId?: string
        content?: unknown
        is_error?: boolean
      }
      if (b.type === 'tool_result') {
        let text = ''
        if (typeof b.content === 'string') text = b.content
        else if (Array.isArray(b.content)) {
          text = b.content
            .map((c) => {
              if (c && typeof c === 'object' && 'type' in c) {
                const t = c as { type: string; text?: string; content?: string }
                if (t.type === 'text') return t.text ?? ''
                if (typeof t.content === 'string') return t.content
              }
              return ''
            })
            .filter(Boolean)
            .join('\n')
        } else if (b.content != null) {
          try {
            text = JSON.stringify(b.content, null, 2)
          } catch {
            text = String(b.content)
          }
        }
        pushResult(b.tool_use_id ?? b.toolUseId ?? '', text, b.is_error === true)
      }
    }
  }

  // 2) SDK structured tool_use_result sibling (when content blocks missing/empty)
  if (out.length === 0) {
    const structured = any.tool_use_result ?? any.toolUseResult
    if (structured !== undefined && structured !== null) {
      // No tool_use_id on this field — leave id empty; caller matches by running tools.
      pushResult('', structured, false)
    }
  }

  return out
}

function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  // Prefer human-facing description (Claude Code tool bridge puts it on the input).
  const desc = input.description
  if (typeof desc === 'string' && desc.trim()) {
    return desc.trim().slice(0, 160)
  }
  const prefer = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'notebook_path', 'prompt']
  for (const k of prefer) {
    const v = input[k]
    if (typeof v === 'string' && v) return v.length > 120 ? v.slice(0, 120) + '…' : v
  }
  try {
    const s = JSON.stringify(input)
    return s.length > 120 ? s.slice(0, 120) + '…' : s
  } catch {
    return name
  }
}

function extractUsage(message: SDKMessage): { used: number; max?: number } | null {
  const any = message as {
    usage?: {
      input_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    message?: {
      usage?: {
        input_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    }
    context_usage?: { total_tokens?: number; raw_max_tokens?: number }
  }
  const u = any.usage ?? any.message?.usage
  if (u && typeof u.input_tokens === 'number') {
    const used =
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0)
    return { used, max: any.context_usage?.raw_max_tokens }
  }
  if (any.context_usage?.total_tokens != null) {
    return {
      used: any.context_usage.total_tokens,
      max: any.context_usage.raw_max_tokens
    }
  }
  return null
}

function emitMessage(msg: ChatMessage): Promise<void> {
  broadcast({ type: 'message', taskId: msg.taskId, message: msg })
  return Promise.resolve()
}

function buildPluginContext(pluginRefs: string[]): string {
  if (!pluginRefs.length) return ''
  const root = repoRoot()
  const sdk = pluginSdkRoot()
  const userPlugins = path.join(app.getPath('userData'), 'plugins')
  const bundledPlugins = app.isPackaged ? path.join(process.resourcesPath, 'plugins') : ''
  return (
    `\n\n【插件上下文】\n` +
    pluginRefs
      .map((id) => {
        const meta = pluginRegistry.byId(id)
        const title = meta?.title ?? id
        const pkg = meta?.packageName ?? id
        const lines = [`- id: ${id}`, `  title: ${title}`, `  package: ${pkg}`]
        const rootDir = meta?.rootDir
        if (!rootDir) {
          lines.push(`  路径: 未知`)
          lines.push(`  任务指引: 可用 node "${sdk}/create.mjs" 新建用户插件到 ${root}/plugins/<id>。`)
          return lines.join('\n')
        }
        const relWorkspace = path.relative(root, rootDir)
        const relUser = path.relative(userPlugins, rootDir)
        const relBundled = bundledPlugins ? path.relative(bundledPlugins, rootDir) : ''
        const under = (rel: string): boolean => Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
        if (under(relWorkspace)) {
          lines.push(`  路径: ${relWorkspace}`)
          lines.push(`  可读入口: ${relWorkspace}/package.json (devdash 清单), ${relWorkspace}/src/`)
          lines.push(
            `  任务指引: 可修改该插件源码；构建后 refresh_plugins / reload_plugin_ui；IPC 三处同步（清单 devdash.ipc / main registerIpc / ui api.ts）。`
          )
        } else if (under(relUser)) {
          const abs = rootDir.replace(/\\/g, '/')
          lines.push(`  路径: ${abs}（用户插件，可写）`)
          lines.push(`  可读入口: ${abs}/package.json, ${abs}/src/`)
          lines.push(
            `  任务指引: 可修改该用户插件；构建 node "${sdk}/build.mjs"；再 mcp__devdash__refresh_plugins。`
          )
        } else if (under(relBundled)) {
          const abs = rootDir.replace(/\\/g, '/')
          lines.push(`  路径: ${abs}（安装包内置插件，仅 dist）`)
          lines.push(`  可读入口: ${abs}/package.json (devdash 清单), ${abs}/dist/`)
          lines.push(
            `  任务指引: 不要试图修改内置插件。需要新能力请用 node "${sdk}/create.mjs" 新建用户插件到 ${root}/plugins/<id>。`
          )
        } else {
          lines.push(`  路径: 安装包内，本机无源码`)
          lines.push(
            `  任务指引: 不要试图修改内置插件源码。需要新能力请用 node "${sdk}/create.mjs" 新建用户插件到 ${root}/plugins/<id>。`
          )
        }
        return lines.join('\n')
      })
      .join('\n')
  )
}

async function consumeStream(
  taskId: string,
  q: Query,
  session: ActiveSession
): Promise<void> {
  const maxTokens = session.maxContextTokens || 1_000_000
  try {
    for await (const raw of q) {
      const message = raw as SDKMessage

      const usage = extractUsage(message)
      if (usage) {
        broadcast({
          type: 'usage',
          taskId,
          usedTokens: usage.used,
          maxTokens: usage.max ?? maxTokens
        })
      }

      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        const sid = (message as { session_id?: string }).session_id
        const init = message as {
          session_id?: string
          skills?: string[]
          slash_commands?: string[]
          agents?: string[]
          mcp_servers?: Array<{ name: string; status: string }>
          plugins?: Array<{ name: string; path: string }>
        }
        lastCaps = {
          skills: init.skills ?? [],
          slashCommands: init.slash_commands ?? [],
          agents: init.agents ?? [],
          mcpServers: init.mcp_servers ?? [],
          plugins: init.plugins ?? []
        }
        if (sid) {
          await sessionStore.updateTask(taskId, { sessionId: sid })
          broadcast({
            type: 'status',
            taskId,
            status: 'running',
            sessionId: sid,
            phase: 'thinking'
          })
        }
        continue
      }

      // Token-level streaming (includePartialMessages)
      if ((message as { type?: string }).type === 'stream_event') {
        const event = (message as { event?: Record<string, unknown> }).event
        if (event && event.type === 'content_block_delta') {
          const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
            session.streamBuffer += delta.text
            if (!session.pendingAssistantId) {
              const msg: ChatMessage = {
                id: randomUUID(),
                taskId,
                role: 'assistant',
                text: session.streamBuffer,
                createdAt: Date.now(),
                streaming: true
              }
              session.pendingAssistantId = msg.id
              await sessionStore.appendMessage(taskId, msg)
              await emitMessage(msg)
            } else {
              await sessionStore.replaceMessage(taskId, session.pendingAssistantId, {
                text: session.streamBuffer,
                streaming: true
              })
              broadcast({
                type: 'message-update',
                taskId,
                messageId: session.pendingAssistantId,
                text: session.streamBuffer,
                streaming: true
              })
            }
            setPhase(taskId, 'streaming')
          }
        }
        continue
      }

      if (message.type === 'assistant') {
        const text = extractText(message)
        const tools = extractToolUses(message)

        // Finalize streaming buffer first. Prefer the streamed buffer (what the
        // user already saw) over extractText join differences.
        if (session.pendingAssistantId) {
          const finalText = session.streamBuffer || text
          await sessionStore.replaceMessage(taskId, session.pendingAssistantId, {
            text: finalText,
            streaming: false
          })
          broadcast({
            type: 'message-update',
            taskId,
            messageId: session.pendingAssistantId,
            text: finalText,
            streaming: false
          })
          session.pendingAssistantId = undefined
          session.streamBuffer = ''
        } else if (text) {
          const msg: ChatMessage = {
            id: randomUUID(),
            taskId,
            role: 'assistant',
            text,
            createdAt: Date.now(),
            streaming: false
          }
          await sessionStore.appendMessage(taskId, msg)
          await emitMessage(msg)
        }

        for (const t of tools) {
          const summary = summarizeToolInput(t.name, t.input)
          let fullInput = summary
          try {
            fullInput = JSON.stringify(t.input, null, 2).slice(0, 4000)
          } catch {
            /* keep summary */
          }
          const toolMsg: ChatMessage = {
            id: randomUUID(),
            taskId,
            role: 'tool',
            text: summary,
            toolName: t.name,
            toolInput: fullInput,
            toolStatus: 'running',
            toolUseId: t.toolUseId,
            createdAt: Date.now()
          }
          if (t.toolUseId) session.toolIndex.set(t.toolUseId, toolMsg.id)
          session.runningToolMsgIds.push(toolMsg.id)
          await sessionStore.appendMessage(taskId, toolMsg)
          await emitMessage(toolMsg)
          setPhase(taskId, 'tool')
        }
        continue
      }

      // tool_result arrives as a user-role message (or tool_use_result sibling)
      const results = extractToolResults(message)
      if (results.length) {
        for (const r of results) {
          const status: ToolStatus = r.isError ? 'error' : 'done'
          let msgId = r.toolUseId ? session.toolIndex.get(r.toolUseId) : undefined
          if (msgId && r.toolUseId) session.toolIndex.delete(r.toolUseId)
          if (!msgId && session.runningToolMsgIds.length > 0) {
            msgId = session.runningToolMsgIds.shift()
          }
          if (msgId) {
            session.runningToolMsgIds = session.runningToolMsgIds.filter((x) => x !== msgId)
            await sessionStore.replaceMessage(taskId, msgId, {
              toolResult: r.text,
              toolStatus: status
            })
            broadcast({
              type: 'message-update',
              taskId,
              messageId: msgId,
              toolResult: r.text,
              toolStatus: status
            })
          } else {
            // Orphan tool_result — still surface it as its own row.
            const orphan: ChatMessage = {
              id: randomUUID(),
              taskId,
              role: 'tool',
              text: r.text.slice(0, 200),
              toolName: 'tool_result',
              toolResult: r.text,
              toolStatus: status,
              toolUseId: r.toolUseId || undefined,
              createdAt: Date.now()
            }
            await sessionStore.appendMessage(taskId, orphan)
            await emitMessage(orphan)
          }
        }
        setPhase(taskId, 'thinking')
        continue
      }

      if (message.type === 'result') {
        const text = extractText(message)
        const failed = (message as { is_error?: boolean; subtype?: string }).is_error === true
        // Never overwrite assistant body with result.result (spec: result 不得覆盖正文).
        if (session.pendingAssistantId) {
          await sessionStore.replaceMessage(taskId, session.pendingAssistantId, {
            streaming: false
          })
          broadcast({
            type: 'message-update',
            taskId,
            messageId: session.pendingAssistantId,
            streaming: false
          })
          session.pendingAssistantId = undefined
          session.streamBuffer = ''
        } else if (failed && text) {
          const msg: ChatMessage = {
            id: randomUUID(),
            taskId,
            role: 'system',
            text,
            createdAt: Date.now(),
            error: true
          }
          await sessionStore.appendMessage(taskId, msg)
          await emitMessage(msg)
        }
        await sessionStore.updateTask(taskId, {
          status: failed ? 'error' : 'idle',
          lastError: failed ? text || '执行失败' : undefined
        })
        broadcast({
          type: 'status',
          taskId,
          status: failed ? 'error' : 'idle',
          error: failed ? text || '执行失败' : undefined,
          phase: failed ? 'error' : 'idle'
        })
      }
    }
  } catch (err) {
    const message = formatError(err)
    await sessionStore.updateTask(taskId, { status: 'error', lastError: message })
    broadcast({ type: 'error', taskId, message })
    broadcast({ type: 'status', taskId, status: 'error', error: message, phase: 'error' })
  } finally {
    // Stream ended without an explicit result (cancel, crash, EOF) — make sure
    // the task is not left stuck in `running` so the sidebar spinner stops.
    const task = await sessionStore.getTask(taskId)
    if (task?.status === 'running') {
      await sessionStore.updateTask(taskId, { status: 'idle' })
      broadcast({ type: 'status', taskId, status: 'idle', phase: 'idle' })
    }
    active.delete(taskId)
  }
}

async function startSession(
  taskId: string,
  modelId?: string,
  accessMode: AccessMode = 'approve'
): Promise<ActiveSession> {
  const settings = await loadSettings()
  const preset: ResolvedModel | undefined = pickModel(settings, modelId)
  if (!preset) {
    throw new Error('未配置可用模型，请在设置中添加供应商与模型。')
  }

  const task = await sessionStore.getTask(taskId)
  const abort = new AbortController()

  // Queue lives OUTSIDE the generator so push() works before the first pull.
  // The SDK only starts pulling after the Claude Code subprocess initializes;
  // a pushFn assigned inside the generator body would miss the first message.
  const queue: SDKUserMessage[] = []
  let resolveNext: (() => void) | null = null
  let streamDone = false

  const push = (m: SDKUserMessage): void => {
    queue.push(m)
    resolveNext?.()
    resolveNext = null
  }
  const end = (): void => {
    streamDone = true
    resolveNext?.()
    resolveNext = null
  }

  const stream = (async function* (): AsyncGenerator<SDKUserMessage> {
    while (!streamDone || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolveNext = r
        })
        continue
      }
      yield queue.shift()!
    }
  })()

  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const { createDevDashMcpServer } = await import('./devTools')

  const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
    const sess = active.get(taskId)
    // Full access: never prompt (S2.2). Still allow session-scoped remembers.
    if (sess?.accessMode === 'full') {
      return { behavior: 'allow' }
    }
    if (sess?.sessionAllowedTools.has(toolName)) {
      return { behavior: 'allow' }
    }
    const { autoAllow, dangerous } = classifyTool(toolName, input, repoRoot())
    if (autoAllow && !dangerous) {
      return { behavior: 'allow' }
    }
    return requestPermission({
      taskId,
      toolName,
      input,
      title: options.title,
      description: options.description,
      displayName: options.displayName,
      blockedPath: options.blockedPath,
      dangerous
    })
  }

  const access: AccessMode = accessMode
  const fullAccess = access === 'full'

  const env = {
    ...process.env,
    ...buildEnvForModel(preset)
  }

  // 1M context beta is Anthropic-only — custom gateways reject unknown beta headers
  const isAnthropicOfficial = preset.provider === 'anthropic' && !preset.baseUrl
  const betas: Array<'context-1m-2025-08-07'> = []
  if (isAnthropicOfficial && (preset.contextInputTokens ?? 0) >= 1_000_000) {
    betas.push('context-1m-2025-08-07')
  }

  // MiniMax-M3.1-Flash ALWAYS thinks and rejects thinking.type="disabled" with 400.
  // Prefer adaptive (or omit) for non-Claude models; never force-disable.
  const isMinimax = /minimax/i.test(preset.model ?? '')
  const thinking = isAnthropicOfficial
    ? undefined
    : isMinimax
      ? { type: 'adaptive' as const }
      : undefined

  const claudeCli = resolveClaudeCliPath()

  const q = query({
    prompt: stream,
    options: {
      cwd: repoRoot(),
      // Packaged: binary lives in extraResources (cannot spawn from asar).
      // Dev: optional platform package under node_modules.
      ...(claudeCli ? { pathToClaudeCodeExecutable: claudeCli } : {}),
      // Force our preset model/env even when user/project settings pin another model.
      model: preset.model,
      env,
      // Override ~/.claude/settings.json `env` (base URL / model / token) — user
      // settings would otherwise win over options.env and hit the wrong gateway.
      settings: {
        env: settingsEnvForModel(preset)
      },
      // Inherit Claude Code ecosystem: skills / agents / hooks / mcp / plugins / commands.
      settingSources: ['user', 'project'],
      skills: 'all',
      includePartialMessages: true,
      abortController: abort,
      // In-app UI acceptance tools (screenshot / snapshot / reload / cdp_info).
      mcpServers: {
        devdash: createDevDashMcpServer()
      },
      allowedTools: ['mcp__devdash__*'],
      // Always attach canUseTool so mid-session setPermissionMode('default') keeps prompts.
      canUseTool,
      permissionMode: fullAccess ? 'bypassPermissions' : 'default',
      // Must be true even in approve mode — SDK refuses setPermissionMode('bypassPermissions')
      // later unless the query was created with allowDangerouslySkipPermissions.
      allowDangerouslySkipPermissions: true,
      permissionPrompts: 'host',
      title: task?.title || 'DevDash 任务',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: buildSystemAppend()
      },
      ...(thinking ? { thinking } : {}),
      ...(betas.length ? { betas } : {}),
      // Resume previous session if any
      ...(task?.sessionId ? { resume: task.sessionId } : {})
    }
  })

  const session: ActiveSession = {
    taskId,
    query: q,
    push,
    end,
    abort,
    accessMode: access,
    streamBuffer: '',
    toolIndex: new Map(),
    runningToolMsgIds: [],
    sessionAllowedTools: new Set(),
    maxContextTokens: preset.contextInputTokens ?? 1_000_000,
    model: preset.model
  }
  active.set(taskId, session)
  void consumeStream(taskId, q, session)
  return session
}

export async function sendMessage(params: {
  taskId: string
  text: string
  pluginRefs?: string[]
  skillRefs?: string[]
  modelId?: string
  accessMode?: AccessMode
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { taskId, text } = params
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '消息不能为空' }

  const settings = await loadSettings()
  const presetId = params.modelId ?? settings.activeModelId
  const preset = pickModel(settings, presetId)
  if (!preset) return { ok: false, error: '未配置可用模型，请打开设置。' }

  const skills = await listSkills().catch(() => [])
  const body =
    trimmed +
    buildPluginContext(params.pluginRefs ?? []) +
    buildSkillContext(params.skillRefs ?? [], skills)

  const userMsg: ChatMessage = {
    id: randomUUID(),
    taskId,
    role: 'user',
    text: trimmed,
    createdAt: Date.now(),
    pluginRefs: params.pluginRefs,
    skillRefs: params.skillRefs
  }
  await sessionStore.appendMessage(taskId, userMsg)
  await emitMessage(userMsg)
  const current = await sessionStore.getTask(taskId)
  const patch: Partial<AgentTask> = {
    status: 'running',
    modelId: preset.id
  }
  if (params.accessMode) patch.accessMode = params.accessMode
  if (current?.title === '新任务' && trimmed) {
    patch.title = trimmed.slice(0, 40)
  }
  await sessionStore.updateTask(taskId, patch)
  broadcast({ type: 'status', taskId, status: 'running', phase: 'thinking' })

  try {
    // Access mode switches apply via setPermissionMode at the next tool action —
    // never cancel/restart the live loop (S2.2).
    const desiredMode = params.accessMode ?? current?.accessMode ?? 'approve'
    let session = active.get(taskId)
    if (!session) {
      session = await startSession(taskId, preset.id, desiredMode)
    } else {
      if (session.model !== preset.model) {
        try {
          await session.query.setModel(preset.model)
          session.model = preset.model
        } catch (err) {
          // Wrong gateway/model combo — surface it but still push the message so
          // the user sees the failure in-context rather than a silent drop.
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[agent] setModel failed:', msg)
        }
      }
      session.accessMode = desiredMode
      try {
        await session.query.setPermissionMode(
          desiredMode === 'full' ? 'bypassPermissions' : 'default'
        )
      } catch (err) {
        // Full access is still enforced in canUseTool; don't block the send.
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[agent] setPermissionMode failed (canUseTool fallback active):', msg)
      }
    }
    session.push(makeUserMessage(body, randomUUID()))
    return { ok: true }
  } catch (err) {
    const message = formatError(err)
    await sessionStore.updateTask(taskId, { status: 'error', lastError: message })
    broadcast({ type: 'error', taskId, message })
    return { ok: false, error: message }
  }
}

export async function switchAccessMode(
  taskId: string,
  accessMode: AccessMode
): Promise<{ ok: boolean; error?: string }> {
  await sessionStore.updateTask(taskId, { accessMode })
  const session = active.get(taskId)
  if (session) {
    // Always flip the local gate first — canUseTool short-circuits on accessMode === 'full'.
    // This works even if the SDK rejects the mode change below.
    session.accessMode = accessMode
    try {
      // Takes effect on the next tool request; does not interrupt the current loop.
      await session.query.setPermissionMode(accessMode === 'full' ? 'bypassPermissions' : 'default')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // bypassPermissions can still be refused by CLI policy / sandbox; the
      // canUseTool path already grants full access, so surface a soft warning.
      if (accessMode === 'full') {
        console.warn('[agent] setPermissionMode(bypass) failed, using canUseTool allow:', msg)
      } else {
        return { ok: false, error: msg }
      }
    }
  }
  // Do not claim the task is running — echo the real status with the mode change.
  const current = await sessionStore.getTask(taskId)
  broadcast({
    type: 'status',
    taskId,
    status: current?.status ?? 'idle',
    accessMode
  })
  return { ok: true }
}

/** Remember a tool for the rest of this session ("允许并记住本会话"). */
export function allowToolForSession(taskId: string, toolName: string): void {
  active.get(taskId)?.sessionAllowedTools.add(toolName)
}

// Wire permissionBridge → session allowlist without a dynamic import cycle.
setAllowToolForSession(allowToolForSession)

export async function switchModel(taskId: string, modelId: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await loadSettings()
  const preset = pickModel(settings, modelId)
  if (!preset) return { ok: false, error: '模型不存在' }

  await sessionStore.updateTask(taskId, { modelId: preset.id })
  const session = active.get(taskId)
  if (session && session.model !== preset.model) {
    try {
      await session.query.setModel(preset.model)
      session.model = preset.model
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
  return { ok: true }
}

export async function cancelTask(taskId: string): Promise<void> {
  const session = active.get(taskId)
  if (session) {
    try {
      await session.query.interrupt()
    } catch {
      /* ignore */
    }
    session.end()
    session.query.close()
    active.delete(taskId)
  }
  denyAllPending('任务已取消。', taskId)
  await sessionStore.updateTask(taskId, { status: 'idle' })
  broadcast({ type: 'status', taskId, status: 'idle' })
}

export async function shutdown(): Promise<void> {
  for (const [id, session] of active) {
    try {
      session.end()
      session.query.close()
    } catch {
      /* ignore */
    }
    active.delete(id)
  }
  denyAllPending('应用退出。')
}
