import { BrowserWindow, app } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { CanUseTool, PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AccessMode, AgentEvent, AgentTask, ChatMessage, ModelPreset } from './types'
import { buildEnvForPreset, loadSettings, pickPreset } from './modelConfig'
import * as sessionStore from './sessionStore'
import { classifyTool, denyAllPending, requestPermission } from './permissionBridge'
import { pluginRegistry } from '../plugin/registry'
import { buildSkillContext, listSkills } from './skills'

function repoRoot(): string {
  try {
    return app.isReady() ? app.getAppPath() : process.cwd()
  } catch {
    return process.cwd()
  }
}

const SYSTEM_APPEND = `
你是 DevDash 插件开发助手。目标：通过新建或修改 plugins/* 下的 npm 插件，交付可被宿主发现与加载的插件应用。

硬约束（来自 AGENTS.md / 项目约定）：
- 禁止创建 .worktree、禁止新建功能分支，直接在当前工作目录修改。
- 插件必须通过 package.json 的 devdash 清单被发现；不要把插件 UI 硬编码进宿主 React 树。
- 新增 IPC 通道三处同步：清单 devdash.ipc → 插件 main registerIpc → 插件 ui api.ts。
- 主进程侧 Git/路径参数一律 execFile 数组传参；用户可控 rev/range 必须校验。
- plugins/*/dist 不进 git；改完插件源码后建议 npm run build:plugins。
- 完整验证：npm run typecheck → npm run build:plugins → npx electron-vite build → node scripts/smoke.mjs。

插件开发模板要点：
- 位置 plugins/<name>/，package.json 含 devdash: { id, title, icon, ui, main, order, ipc[] }
- vite 构建 ui.js / main.js；react alias 到宿主 shim（精确正则 /^react$/）。
- UI 默认导出 { id, title, icon?, App }。
`

type ActiveSession = {
  taskId: string
  query: Query
  /** Push-based user message stream for multi-turn streaming input */
  push: (msg: SDKUserMessage) => void
  end: () => void
  abort: AbortController
  accessMode: AccessMode
  pendingAssistantId?: string
}

const active = new Map<string, ActiveSession>()

function broadcast(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:event', event)
  }
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

function extractToolUses(message: SDKMessage): Array<{ name: string; input: Record<string, unknown> }> {
  if (message.type !== 'assistant') return []
  const content = (message as { message?: { content?: unknown } }).message?.content
  if (!Array.isArray(content)) return []
  const out: Array<{ name: string; input: Record<string, unknown> }> = []
  for (const block of content) {
    if (block && typeof block === 'object' && 'type' in block) {
      const b = block as { type: string; name?: string; input?: unknown }
      if (b.type === 'tool_use' && typeof b.name === 'string') {
        out.push({ name: b.name, input: (b.input as Record<string, unknown>) ?? {} })
      }
    }
  }
  return out
}

async function emitMessage(msg: ChatMessage): Promise<void> {
  broadcast({ type: 'message', taskId: msg.taskId, message: msg })
}

function buildPluginContext(pluginRefs: string[]): string {
  if (!pluginRefs.length) return ''
  return (
    `\n\n【插件上下文】\n` +
    pluginRefs
      .map((id) => {
        const meta = pluginRegistry.byId(id)
        const title = meta?.title ?? id
        const pkg = meta?.packageName ?? `plugins/${id}`
        const root = meta?.rootDir ? path.relative(repoRoot(), meta.rootDir) || meta.rootDir : `plugins/${id}`
        return [
          `- id: ${id}`,
          `  title: ${title}`,
          `  package: ${pkg}`,
          `  路径: ${root}`,
          `  可读入口: ${root}/package.json (devdash 清单), ${root}/src/`,
          `  任务指引: 可新建或修改该插件；改完需 npm run build:plugins；IPC 三处同步（清单 devdash.ipc / main registerIpc / ui api.ts）。`
        ].join('\n')
      })
      .join('\n')
  )
}

async function consumeStream(
  taskId: string,
  q: Query,
  session: ActiveSession
): Promise<void> {
  try {
    for await (const raw of q) {
      const message = raw as SDKMessage

      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        const sid = (message as { session_id?: string }).session_id
        if (sid) {
          await sessionStore.updateTask(taskId, { sessionId: sid })
          broadcast({ type: 'status', taskId, status: 'running', sessionId: sid })
        }
        continue
      }

      if (message.type === 'assistant') {
        const text = extractText(message)
        const tools = extractToolUses(message)

        // Each complete assistant message is its own chat row (a turn can
        // produce several: text → tool → text). Never replace earlier text.
        if (text) {
          const msg: ChatMessage = {
            id: randomUUID(),
            taskId,
            role: 'assistant',
            text,
            createdAt: Date.now(),
            streaming: true
          }
          session.pendingAssistantId = msg.id
          await sessionStore.appendMessage(taskId, msg)
          await emitMessage(msg)
          // Finalize immediately — this message is complete.
          await sessionStore.replaceMessage(taskId, msg.id, { streaming: false })
          broadcast({
            type: 'message-update',
            taskId,
            messageId: msg.id,
            text,
            streaming: false
          })
          session.pendingAssistantId = undefined
        }

        for (const t of tools) {
          const toolMsg: ChatMessage = {
            id: randomUUID(),
            taskId,
            role: 'tool',
            text: JSON.stringify(t.input).slice(0, 500),
            toolName: t.name,
            createdAt: Date.now()
          }
          await sessionStore.appendMessage(taskId, toolMsg)
          await emitMessage(toolMsg)
        }
        continue
      }

      if (message.type === 'result') {
        const text = extractText(message)
        const failed = (message as { is_error?: boolean; subtype?: string }).is_error === true
        // Do NOT overwrite assistant text with result.result — it is often a
        // short summary or empty, and wiping prior assistant rows loses work.
        if (session.pendingAssistantId) {
          await sessionStore.replaceMessage(taskId, session.pendingAssistantId, { streaming: false })
          session.pendingAssistantId = undefined
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
          error: failed ? text || '执行失败' : undefined
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sessionStore.updateTask(taskId, { status: 'error', lastError: message })
    broadcast({ type: 'error', taskId, message })
    broadcast({ type: 'status', taskId, status: 'error', error: message })
  } finally {
    active.delete(taskId)
  }
}

async function startSession(
  taskId: string,
  modelId?: string,
  accessMode: AccessMode = 'approve'
): Promise<ActiveSession> {
  const settings = await loadSettings()
  const preset: ModelPreset | undefined = pickPreset(settings, modelId)
  if (!preset) {
    throw new Error('未配置可用模型，请在设置中添加模型预设。')
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

  const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
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
    ...buildEnvForPreset(preset)
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

  const q = query({
    prompt: stream,
    options: {
      cwd: repoRoot(),
      model: preset.model,
      env,
      // Critical: ignore ~/.claude/settings.json / project .claude — they often pin
      // a different provider (e.g. mimo-v2.5-pro) and override our preset, causing
      // "API Error: 400 Unsupported model" before any network call.
      settingSources: [],
      abortController: abort,
      canUseTool: fullAccess ? undefined : canUseTool,
      permissionMode: fullAccess ? 'bypassPermissions' : 'default',
      allowDangerouslySkipPermissions: fullAccess,
      permissionPrompts: fullAccess ? 'none' : 'host',
      title: task?.title || 'DevDash 任务',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: SYSTEM_APPEND
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
    accessMode: access
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
  const presetId = params.modelId ?? settings.activePresetId
  const preset = pickPreset(settings, presetId)
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
  broadcast({ type: 'status', taskId, status: 'running' })

  try {
    // Access mode changes require a fresh process (permission mode is startup-bound
    // for bypass). If mode differs from the live session, restart it.
    const desiredMode = params.accessMode ?? current?.accessMode ?? 'approve'
    let session = active.get(taskId)
    if (session && session.accessMode !== desiredMode) {
      await cancelTask(taskId)
      session = undefined
    }
    if (!session) {
      session = await startSession(taskId, preset.id, desiredMode)
    } else {
      await session.query.setModel(preset.model)
    }
    session.push(makeUserMessage(body, randomUUID()))
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sessionStore.updateTask(taskId, { status: 'error', lastError: message })
    broadcast({ type: 'error', taskId, message })
    return { ok: false, error: message }
  }
}

export async function switchModel(taskId: string, modelId: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await loadSettings()
  const preset = pickPreset(settings, modelId)
  if (!preset) return { ok: false, error: '模型预设不存在' }

  await sessionStore.updateTask(taskId, { modelId: preset.id })
  const session = active.get(taskId)
  if (session) {
    try {
      await session.query.setModel(preset.model)
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
