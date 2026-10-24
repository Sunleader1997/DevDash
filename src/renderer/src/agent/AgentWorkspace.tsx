import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccessMode,
  AgentEvent,
  AgentPhase,
  AgentSettings,
  AgentTask,
  AgentTaskStatus,
  ChatMessage,
  PermissionRequestPayload,
  SkillInfo
} from './types'
import {
  cancelSession,
  getSessionCaps,
  listSkills,
  listTasks,
  loadHistory,
  onAgentEvent,
  respondPermission,
  sendMessage,
  switchAccessMode,
  switchModel
} from './agentApi'
import { Markdown } from './Markdown'
import { ContextRing } from './ContextRing'
import { setLiveStatus } from './liveStatus'

type PluginLite = { id: string; title: string; packageName: string }
type PickKind = 'plugin' | 'skill' | null
type StatusNote = { kind: 'info' | 'error'; text: string }

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: '就绪',
  thinking: '思考中',
  tool: '使用工具',
  waiting: '等待你确认',
  streaming: '生成中',
  error: '出错'
}

function PhaseIcon({ phase }: { phase: AgentPhase }): JSX.Element {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const }
  switch (phase) {
    case 'thinking':
      return (
        <span className="phase-icon pulse" title="思考中">
          <svg viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.2" {...common} />
            <circle cx="6" cy="6" r="1.3" fill="currentColor" stroke="none" />
          </svg>
        </span>
      )
    case 'tool':
      return (
        <span className="phase-icon spin" title="使用工具">
          <svg viewBox="0 0 12 12">
            <path d="M2 8.5 L5 5.5 M7 4 L10 1.5" {...common} />
            <rect x="1.2" y="8.2" width="3.2" height="2.4" rx="0.6" {...common} />
            <circle cx="8.6" cy="7.2" r="2.2" {...common} />
          </svg>
        </span>
      )
    case 'waiting':
      return (
        <span className="phase-icon pulse" title="等待确认">
          <svg viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.2" {...common} />
            <path d="M6 3.6 V6.2 L7.8 7.4" {...common} />
          </svg>
        </span>
      )
    case 'streaming':
      return (
        <span className="phase-icon blink" title="生成中">
          <svg viewBox="0 0 12 12">
            <path d="M2 8 C3.2 5.5 4 4 6 4 S8.8 5.5 10 8" {...common} />
            <path d="M2 10 H10" {...common} />
          </svg>
        </span>
      )
    case 'error':
      return (
        <span className="phase-icon" title="出错">
          <svg viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.2" {...common} />
            <path d="M6 3.8 V6.4" {...common} />
            <circle cx="6" cy="8.3" r="0.55" fill="currentColor" stroke="none" />
          </svg>
        </span>
      )
    default:
      return (
        <span className="phase-icon" title="就绪">
          <svg viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.2" {...common} />
            <path d="M4 6.1 L5.4 7.5 L8.2 4.6" {...common} />
          </svg>
        </span>
      )
  }
}

function StatusLabel({ phase }: { phase: AgentPhase }): JSX.Element {
  return (
    <span className={`agent-status-chip phase-${phase}`}>
      <PhaseIcon phase={phase} />
      {PHASE_LABEL[phase]}
    </span>
  )
}

function ErrorBanner({
  text,
  onDismiss
}: {
  text: string
  onDismiss: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard unavailable — text is still selectable */
      })
  }
  return (
    <div className="composer-error" role="alert">
      <div className="composer-error-bar">
        <span className="composer-error-label">出错了</span>
        <span className="composer-error-spacer" />
        <button type="button" className="composer-error-btn" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </button>
        <button type="button" className="composer-error-btn" onClick={onDismiss} aria-label="关闭">
          ×
        </button>
      </div>
      <pre className="composer-error-body">{text}</pre>
    </div>
  )
}

export function AgentWorkspace({
  taskId,
  settings,
  onSettingsChange,
  onOpenSettings,
  onTasksChanged
}: {
  taskId: string
  settings: AgentSettings | null
  onSettingsChange: (s: AgentSettings) => void
  onOpenSettings: () => void
  onTasksChanged: () => void
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [task, setTask] = useState<AgentTask | null>(null)
  const [plugins, setPlugins] = useState<PluginLite[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [sdkSkills, setSdkSkills] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [pluginRefs, setPluginRefs] = useState<string[]>([])
  const [skillRefs, setSkillRefs] = useState<string[]>([])
  const [pickKind, setPickKind] = useState<PickKind>(null)
  const [pickFilter, setPickFilter] = useState('')
  const [pickIndex, setPickIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [permission, setPermission] = useState<PermissionRequestPayload | null>(null)
  const [phase, setPhase] = useState<AgentPhase>('idle')
  const [statusNote, setStatusNote] = useState<StatusNote | null>(null)
  const [accessMode, setAccessMode] = useState<AccessMode>('approve')
  const [plusOpen, setPlusOpen] = useState(false)
  const [ctxUsed, setCtxUsed] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const plusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.devdash
      .invoke('plugin:list')
      .then((raw) => {
        const list = raw as Array<{ id: string; title: string; packageName: string }>
        setPlugins(list.map((p) => ({ id: p.id, title: p.title, packageName: p.packageName })))
      })
      .catch(() => setPlugins([]))
    listSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
  }, [])

  const refreshCaps = useCallback(() => {
    getSessionCaps()
      .then((caps) => setSdkSkills(caps?.skills ?? []))
      .catch(() => setSdkSkills([]))
  }, [])

  useEffect(() => {
    refreshCaps()
  }, [refreshCaps, taskId])

  /** Keep the composer chip and sidebar spinner on one source of truth. */
  const applyPhase = useCallback(
    (next: AgentPhase, status?: AgentTaskStatus) => {
      setPhase(next)
      const st: AgentTaskStatus =
        status ?? (next === 'error' ? 'error' : next === 'idle' ? 'idle' : 'running')
      setLiveStatus(taskId, { status: st, phase: next })
    },
    [taskId]
  )

  useEffect(() => {
    let cancelled = false
    setMessages([])
    setPluginRefs([])
    setSkillRefs([])
    setDraft('')
    setStatusNote(null)
    setPhase('idle')
    setLiveStatus(taskId, { status: 'idle', phase: 'idle' })
    Promise.all([listTasks(), loadHistory(taskId)])
      .then(([tasks, history]) => {
        if (cancelled) return
        const t = tasks.find((x) => x.id === taskId) ?? null
        setTask(t)
        if (t?.status === 'error' && t.lastError) {
          setPhase('error')
          setStatusNote({ kind: 'error', text: t.lastError })
        }
        setAccessMode(t?.accessMode ?? 'approve')
        setMessages(history)
        const initPhase: AgentPhase =
          t?.status === 'running' ? 'thinking' : t?.status === 'error' ? 'error' : 'idle'
        setPhase(initPhase)
        if (t) setLiveStatus(t.id, { status: t.status, phase: initPhase })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [taskId])

  const applyEvent = useCallback(
    (e: AgentEvent) => {
      if (e.type === 'message' && e.taskId === taskId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === e.message.id)) {
            return prev.map((m) => (m.id === e.message.id ? { ...m, ...e.message } : m))
          }
          return [...prev, e.message]
        })
        if (e.message.role === 'user') onTasksChanged()
      } else if (e.type === 'message-update' && e.taskId === taskId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== e.messageId) return m
            return {
              ...m,
              ...(e.text !== undefined ? { text: e.text } : {}),
              ...(e.streaming !== undefined ? { streaming: e.streaming } : {}),
              ...(e.toolResult !== undefined ? { toolResult: e.toolResult } : {}),
              ...(e.toolStatus !== undefined ? { toolStatus: e.toolStatus } : {})
            }
          })
        )
      } else if (e.type === 'status' && e.taskId === taskId) {
        setTask((t) =>
          t
            ? {
                ...t,
                status: e.status,
                lastError: e.error,
                sessionId: e.sessionId ?? t.sessionId
              }
            : t
        )
        if (e.accessMode) setAccessMode(e.accessMode)
        // Keep sidebar spinner on the same source as the composer status chip.
        const nextPhase: AgentPhase = e.phase
          ? e.phase
          : e.status === 'running'
            ? 'thinking'
            : e.status === 'error'
              ? 'error'
              : 'idle'
        applyPhase(nextPhase, e.status)
        if (e.status === 'error') setStatusNote({ kind: 'error', text: e.error || '出错了' })
        if (e.status !== 'running') setSending(false)
        if (e.status === 'running') setStatusNote(null)
        // SDK init may have published new skills/commands
        if (e.status === 'running' || e.phase === 'thinking') refreshCaps()
        onTasksChanged()
      } else if (e.type === 'status') {
        // Background tasks: same live status source so their spinner stops too.
        const nextPhase: AgentPhase = e.phase
          ? e.phase
          : e.status === 'running'
            ? 'thinking'
            : e.status === 'error'
              ? 'error'
              : 'idle'
        setLiveStatus(e.taskId, { status: e.status, phase: nextPhase })
        onTasksChanged()
      } else if (e.type === 'permission' && e.payload.taskId === taskId) {
        setPermission(e.payload)
        applyPhase('waiting', 'running')
      } else if (e.type === 'permission') {
        // Background task waiting for permission — keep sidebar fresh
        onTasksChanged()
      } else if (e.type === 'error' && e.taskId === taskId) {
        setStatusNote({ kind: 'error', text: e.message })
        applyPhase('error', 'error')
        setSending(false)
      } else if (e.type === 'usage' && e.taskId === taskId) {
        setCtxUsed(e.usedTokens)
      }
    },
    [taskId, onTasksChanged, refreshCaps, applyPhase]
  )

  useEffect(() => onAgentEvent(applyEvent), [applyEvent])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!plusOpen) return
    const onDoc = (ev: MouseEvent): void => {
      if (plusRef.current && !plusRef.current.contains(ev.target as Node)) {
        setPlusOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [plusOpen])

  const activeModel = useMemo(() => {
    if (!settings) return null
    const id = task?.modelId ?? settings.activeModelId
    const all = (settings.providers ?? []).flatMap((p) =>
      (p.models ?? []).map((m) => ({
        ...m,
        providerLabel: p.label
      }))
    )
    return all.find((m) => m.id === id) ?? all[0] ?? null
  }, [settings, task])

  const filteredPlugins = useMemo(() => {
    const q = pickFilter.trim().toLowerCase()
    if (!q) return plugins
    return plugins.filter(
      (p) => p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
    )
  }, [plugins, pickFilter])

  const filteredSkills = useMemo(() => {
    const q = pickFilter.trim().toLowerCase()
    const fsList: SkillInfo[] = skills
    const extra: SkillInfo[] = sdkSkills
      .filter((id) => !skills.some((s) => s.id === id))
      .map((id) => ({ id, title: id, description: 'SDK 发现', source: 'sdk' }))
    const all = [...fsList, ...extra]
    if (!q) return all
    return all.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  }, [skills, sdkSkills, pickFilter])

  const insertPlugin = useCallback((id: string) => {
    setPluginRefs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setDraft((d) => d.replace(/@([^\s@]*)$/, ''))
    setPickKind(null)
    setPickFilter('')
    setPickIndex(0)
    inputRef.current?.focus()
  }, [])

  const insertSkill = useCallback((id: string) => {
    setSkillRefs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setDraft((d) => d.replace(/\/([^\s/]*)$/, ''))
    setPickKind(null)
    setPickFilter('')
    setPickIndex(0)
    setPlusOpen(false)
    inputRef.current?.focus()
  }, [])

  /** Current filtered options for keyboard nav (best match first). */
  const pickOptions = useMemo(() => {
    if (pickKind === 'plugin') return filteredPlugins.map((p) => p.id)
    if (pickKind === 'skill') return filteredSkills.map((s) => s.id)
    return [] as string[]
  }, [pickKind, filteredPlugins, filteredSkills])

  /** Keep highlight in range when the filtered list shrinks. */
  useEffect(() => {
    if (pickIndex >= pickOptions.length) setPickIndex(0)
  }, [pickIndex, pickOptions.length])

  const commitPick = useCallback(
    (id?: string) => {
      const target = id ?? pickOptions[Math.min(pickIndex, pickOptions.length - 1)]
      if (!target) return
      if (pickKind === 'plugin') insertPlugin(target)
      else if (pickKind === 'skill') insertSkill(target)
    },
    [pickKind, pickOptions, pickIndex, insertPlugin, insertSkill]
  )

  /** 编排模式 = /compose-next skill：向草稿注入 slash 命令以便 SDK 分派 */
  const applyOrchestration = useCallback(() => {
    setDraft((d) => {
      const t = d.trimStart()
      if (t.startsWith('/compose-next')) return d
      return d ? `/compose-next ${d}` : '/compose-next '
    })
    setSkillRefs((prev) => (prev.includes('compose-next') ? prev : [...prev, 'compose-next']))
    setPlusOpen(false)
    inputRef.current?.focus()
  }, [])

  const onDraftChange = (value: string): void => {
    setDraft(value)
    const at = value.match(/@([^\s@]*)$/)
    const slash = value.match(/\/([^\s/]*)$/)
    if (at) {
      setPickKind('plugin')
      setPickFilter(at[1] ?? '')
      setPickIndex(0)
    } else if (slash) {
      setPickKind('skill')
      setPickFilter(slash[1] ?? '')
      setPickIndex(0)
    } else {
      setPickKind(null)
      setPickFilter('')
      setPickIndex(0)
    }
  }

  const doSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sending) return
    if (!settings?.providers?.some((p) => p.models?.length)) {
      onOpenSettings()
      return
    }
    setSending(true)
    applyPhase('thinking', 'running')
    setStatusNote(null)
    const result = await sendMessage({
      taskId,
      text,
      pluginRefs,
      skillRefs,
      modelId: activeModel?.id,
      accessMode
    })
    if (!result.ok) {
      setStatusNote({ kind: 'error', text: result.error || '发送失败' })
      applyPhase('error', 'error')
      setSending(false)
      return
    }
    setDraft('')
    setPluginRefs([])
    setSkillRefs([])
    setPickKind(null)
  }

  const onModelChange = async (modelId: string): Promise<void> => {
    const r = await switchModel(taskId, modelId)
    if (r.ok) {
      setTask((t) => (t ? { ...t, modelId } : t))
      setStatusNote({ kind: 'info', text: '模型已切换 · 下一动作生效' })
    } else {
      setStatusNote({ kind: 'error', text: r.error || '切换模型失败' })
    }
  }

  const onAccessChange = async (mode: AccessMode): Promise<void> => {
    if (mode === accessMode) return
    const prev = accessMode
    setAccessMode(mode)
    const r = await switchAccessMode(taskId, mode)
    if (r.ok) {
      setStatusNote({
        kind: 'info',
        text: mode === 'full' ? '已切到完全访问 · 下一动作生效' : '已切到审批模式 · 下一动作生效'
      })
    } else {
      setAccessMode(prev)
      setStatusNote({ kind: 'error', text: r.error || '切换访问模式失败' })
    }
  }

  const running = task?.status === 'running' || sending
  const ctxTotal = activeModel?.contextInputTokens ?? 1_000_000

  return (
    <div className="agent-workspace">
      <header className="agent-header">
        <div className="agent-title">{task?.title || '新任务'}</div>
        <div className="agent-header-right">
          <StatusLabel phase={phase} />
          <span className="agent-mode-chip">{accessMode === 'full' ? '完全访问' : '审批模式'}</span>
          {running ? (
            <button
              className="btn-secondary"
              onClick={() => {
                void cancelSession(taskId)
                setSending(false)
                applyPhase('idle', 'idle')
              }}
            >
              停止
            </button>
          ) : null}
        </div>
      </header>

      <div className="agent-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="agent-empty">
            <div className="agent-empty-title">用对话开发插件</div>
            <div className="agent-empty-desc">
              描述你想要的插件能力，Agent 会在 plugins/ 下新建或修改。
              <br />
              <code>@</code> 引用插件 · <code>/</code> 引用 skill · <code>+</code> 编排模式
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </div>

      <div className="agent-composer">
        {pickKind && pickOptions.length > 0 && (
          <div className="mention-menu" role="listbox">
            {pickKind === 'plugin' ? (
              <>
                <div className="mention-label">插件 · @（↑↓ 选择 · Tab 补全）</div>
                {filteredPlugins.map((p, i) => (
                  <button
                    key={p.id}
                    className={`mention-item${i === pickIndex ? ' active' : ''}`}
                    role="option"
                    aria-selected={i === pickIndex}
                    onMouseEnter={() => setPickIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insertPlugin(p.id)
                    }}
                  >
                    <span className="mention-id">@{p.id}</span>
                    <span className="mention-title">{p.title}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="mention-label">Skill · /（↑↓ 选择 · Tab 补全）</div>
                {filteredSkills.map((s, i) => (
                  <button
                    key={s.id}
                    className={`mention-item${i === pickIndex ? ' active' : ''}`}
                    role="option"
                    aria-selected={i === pickIndex}
                    onMouseEnter={() => setPickIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insertSkill(s.id)
                    }}
                  >
                    <span className="mention-id">/{s.id}</span>
                    <span className="mention-title">{s.title}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {statusNote?.kind === 'error' && (
          <ErrorBanner text={statusNote.text} onDismiss={() => setStatusNote(null)} />
        )}

        <div className="composer-box">
          <div className="composer-header">
            <StatusLabel phase={phase} />
            {statusNote?.kind === 'info' && (
              <span className="composer-note">{statusNote.text}</span>
            )}
            <span className="composer-header-spacer" />
            {skillRefs.map((id) => (
              <span key={`hs-${id}`} className="ref-chip skill">
                /{id}
                <button onClick={() => setSkillRefs((prev) => prev.filter((x) => x !== id))}>×</button>
              </span>
            ))}
            {pluginRefs.map((id) => (
              <span key={`hp-${id}`} className="ref-chip plugin">
                @{id}
                <button onClick={() => setPluginRefs((prev) => prev.filter((x) => x !== id))}>×</button>
              </span>
            ))}
          </div>

          <textarea
            ref={inputRef}
            className="composer-input"
            placeholder="描述要开发或修改的插件…（@ 插件 · / skill · + 编排）"
            value={draft}
            rows={4}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              // Mention menu keyboard: ↑↓ select, Tab/Enter commit, Esc dismiss
              if (pickKind && pickOptions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setPickIndex((i) => (i + 1) % pickOptions.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPickIndex((i) => (i - 1 + pickOptions.length) % pickOptions.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  commitPick()
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setPickKind(null)
                  setPickFilter('')
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void doSend()
              }
            }}
          />

          <div className="composer-footer">
            <div className="composer-footer-left">
              <div className="plus-menu-wrap" ref={plusRef}>
                <button
                  type="button"
                  className={`footer-chip plus-btn${plusOpen ? ' active' : ''}`}
                  title="编排模式（/compose-next）"
                  onClick={() => setPlusOpen((v) => !v)}
                >
                  +
                </button>
                {plusOpen && (
                  <div className="plus-menu">
                    <div className="plus-section-title">编排模式</div>
                    <button
                      type="button"
                      className={`plus-item${skillRefs.includes('compose-next') ? ' active' : ''}`}
                      onMouseDown={applyOrchestration}
                    >
                      <span className="plus-item-title">/compose-next</span>
                      <span className="plus-item-desc">Compose Next 编排工作流 skill</span>
                    </button>
                  </div>
                )}
              </div>

              <select
                className="footer-select"
                value={accessMode}
                onChange={(e) => void onAccessChange(e.target.value as AccessMode)}
                title="访问模式（下一动作生效）"
              >
                <option value="approve">审批模式</option>
                <option value="full">完全访问</option>
              </select>
            </div>

            <div className="composer-footer-right">
              <ContextRing used={ctxUsed} total={ctxTotal} />
              <select
                className="footer-select"
                value={activeModel?.id ?? ''}
                onChange={(e) => {
                  void onModelChange(e.target.value)
                }}
                title="切换对话模型（下一动作生效）"
              >
                {(settings?.providers ?? []).flatMap((p) =>
                  (p.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {p.label ? `${p.label} · ` : ''}
                      {m.label || m.model}
                    </option>
                  ))
                )}
                {(!settings || !settings.providers?.some((p) => p.models?.length)) && (
                  <option value="">未配置模型</option>
                )}
              </select>
              <button
                className="btn-primary composer-send"
                disabled={!draft.trim() || sending}
                onClick={() => void doSend()}
              >
                {sending ? '…' : '发送'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {permission && (
        <PermissionDialog
          payload={permission}
          onRespond={(allow, reason, remember, updatedInput) => {
            void respondPermission(permission.requestId, allow, reason, remember, updatedInput)
            setPermission(null)
            if (phase === 'waiting') applyPhase('thinking', 'running')
          }}
        />
      )}
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }): JSX.Element {
  if (message.role === 'tool') {
    return <ToolCard message={message} />
  }
  if (message.role === 'system') {
    return (
      <div className={`msg msg-system${message.error ? ' error' : ''}`}>
        <Markdown text={message.text} />
      </div>
    )
  }
  const isUser = message.role === 'user'
  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-assistant'}`}>
      <div className="msg-text">
        <Markdown text={message.text} />
        {message.pluginRefs && message.pluginRefs.length > 0 && (
          <span className="msg-refs">{message.pluginRefs.map((r) => `@${r}`).join(' ')}</span>
        )}
        {message.skillRefs && message.skillRefs.length > 0 && (
          <span className="msg-refs">{message.skillRefs.map((r) => `/${r}`).join(' ')}</span>
        )}
      </div>
      {message.streaming && <div className="msg-streaming">生成中…</div>}
    </div>
  )
}

function ToolCard({ message }: { message: ChatMessage }): JSX.Element {
  const status = message.toolStatus ?? 'running'
  // Quiet by default — expand on click only (Apple: secondary UI must not compete).
  const [open, setOpen] = useState(false)
  const statusLabel = status === 'running' ? '运行中' : status === 'error' ? '失败' : '完成'
  const resultText = message.toolResult || ''
  const inputText = message.toolInput || message.text || ''
  const name = message.toolName || '工具'
  // Prefer description from input JSON; fall back to first line of summary.
  const summary = (() => {
    try {
      const parsed = JSON.parse(inputText) as { description?: string; command?: string; file_path?: string }
      if (parsed.description) return parsed.description
      if (parsed.command) return parsed.command.split('\n')[0].slice(0, 120)
      if (parsed.file_path) return parsed.file_path
    } catch {
      /* raw summary */
    }
    return (message.text || inputText.split('\n')[0] || '').slice(0, 120)
  })()

  return (
    <div className={`msg msg-tool tool-${status}`} data-open={open ? '1' : '0'}>
      <button
        type="button"
        className="tool-header"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <span className={`tool-dot tool-dot-${status}`} />
        <span className="tool-name">{name}</span>
        <span className="tool-summary">{summary}</span>
        <span className={`tool-status tool-status-${status}`}>{statusLabel}</span>
        <span className="tool-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="tool-body">
          {inputText && (
            <div className="tool-line">
              <span className="tool-line-label">参数</span>
              <pre className="tool-result">{inputText}</pre>
            </div>
          )}
          <div className="tool-line">
            <span className="tool-line-label">结果</span>
            {resultText ? (
              <pre className="tool-result">{resultText}</pre>
            ) : (
              <div className="tool-line-empty">
                {status === 'running' ? '执行中…' : '暂无输出'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatToolFields(
  inputPreview: string,
  skipDescription = false
): Array<{ key: string; value: string; mono?: boolean }> {
  try {
    const parsed = JSON.parse(inputPreview) as Record<string, unknown>
    const out: Array<{ key: string; value: string; mono?: boolean }> = []
    // Preferred display order for common Claude Code tool inputs.
    const order = [
      'description',
      'command',
      'file_path',
      'path',
      'notebook_path',
      'pattern',
      'url',
      'query',
      'prompt',
      'new_string',
      'old_string'
    ]
    const seen = new Set<string>()
    const push = (k: string, v: unknown): void => {
      if (v == null || v === '') return
      if (skipDescription && k === 'description') {
        seen.add(k)
        return
      }
      const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
      out.push({
        key: k,
        value: s.length > 2000 ? s.slice(0, 2000) + '…' : s,
        mono: k !== 'description'
      })
      seen.add(k)
    }
    for (const k of order) push(k, parsed[k])
    for (const [k, v] of Object.entries(parsed)) {
      if (!seen.has(k) && !(skipDescription && k === 'description')) push(k, v)
    }
    return out
  } catch {
    return [{ key: 'input', value: inputPreview, mono: true }]
  }
}

function ToolInputView({
  inputPreview,
  skipDescription
}: {
  inputPreview: string
  skipDescription?: boolean
}): JSX.Element {
  const fields = formatToolFields(inputPreview, skipDescription)
  return (
    <div className="tool-fields">
      {fields.map((f) => (
        <div key={f.key} className="tool-field">
          <div className="tool-field-key">{f.key}</div>
          {f.mono ? (
            <pre className="tool-field-val mono">{f.value}</pre>
          ) : (
            <div className="tool-field-val">{f.value}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function PermissionDialog({
  payload,
  onRespond
}: {
  payload: PermissionRequestPayload
  onRespond: (
    allow: boolean,
    reason?: string,
    rememberSession?: boolean,
    updatedInput?: Record<string, unknown>
  ) => void
}): JSX.Element {
  const [reason, setReason] = useState('')
  const isAsk = payload.toolName === 'AskUserQuestion'
  const askQuestions = useMemo(() => {
    if (!isAsk) return [] as Array<{
      question: string
      header?: string
      multiSelect?: boolean
      options?: Array<{ label: string; description?: string }>
    }>
    try {
      const parsed = JSON.parse(payload.inputPreview) as {
        questions?: Array<{
          question?: string
          header?: string
          multiSelect?: boolean
          options?: Array<{ label?: string; description?: string }>
        }>
      }
      return (parsed.questions ?? []).map((q) => ({
        question: q.question ?? '',
        header: q.header,
        multiSelect: q.multiSelect,
        options: (q.options ?? []).map((o) => ({
          label: o.label ?? '',
          description: o.description
        }))
      }))
    } catch {
      return []
    }
  }, [isAsk, payload.inputPreview])
  const [answers, setAnswers] = useState<Record<number, string[]>>({})

  const submitAsk = (): void => {
    // SDK AskUserQuestionInput: keep original questions; answers is
    // { [questionText]: string } with multi-select values comma-separated.
    const answersMap: Record<string, string> = {}
    let response: string | undefined
    askQuestions.forEach((q, i) => {
      const picked = answers[i] ?? []
      const optionLabels = new Set((q.options ?? []).map((o) => o.label))
      const structured = picked.filter((a) => optionLabels.has(a))
      const free = picked.find((a) => !optionLabels.has(a))
      if (structured.length) {
        answersMap[q.question] = structured.join(',')
      }
      if (free) response = free
    })
    const original = (() => {
      try {
        const parsed = JSON.parse(payload.inputPreview) as { questions?: unknown }
        return parsed.questions ?? askQuestions
      } catch {
        return askQuestions
      }
    })()
    onRespond(true, undefined, false, {
      questions: original,
      answers: answersMap,
      ...(response ? { response } : {})
    })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal permission-modal">
        <div className="modal-header">
          <div className="modal-title">
            {isAsk ? '需要你补充' : payload.dangerous ? '危险操作确认' : '操作确认'}
          </div>
        </div>
        <div className="modal-body">
          <div className="perm-title">{payload.title}</div>
          {payload.description && <div className="perm-desc">{payload.description}</div>}
          {isAsk ? (
            <div className="ask-questions">
              {askQuestions.length === 0 && <ToolInputView inputPreview={payload.inputPreview} />}
              {askQuestions.map((q, qi) => (
                <div key={qi} className="ask-q">
                  <div className="ask-q-title">
                    {q.header ? <strong>{q.header}</strong> : null} {q.question}
                  </div>
                  <div className="ask-options">
                    {(q.options ?? []).map((o) => {
                      const selected = (answers[qi] ?? []).includes(o.label)
                      return (
                        <button
                          key={o.label}
                          type="button"
                          className={`ask-option${selected ? ' active' : ''}`}
                          onClick={() => {
                            setAnswers((prev) => {
                              const cur = prev[qi] ?? []
                              const next = q.multiSelect
                                ? selected
                                  ? cur.filter((x) => x !== o.label)
                                  : [...cur, o.label]
                                : selected
                                  ? []
                                  : [o.label]
                              return { ...prev, [qi]: next }
                            })
                          }}
                        >
                          <span className="ask-option-label">{o.label}</span>
                          {o.description && (
                            <span className="ask-option-desc">{o.description}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    className="ask-free"
                    placeholder="或输入自定义答案"
                    value={(answers[qi] ?? []).find((a) => !(q.options ?? []).some((o) => o.label === a)) ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setAnswers((prev) => {
                        const picked = (prev[qi] ?? []).filter((a) =>
                          (q.options ?? []).some((o) => o.label === a)
                        )
                        return { ...prev, [qi]: v ? [...picked, v] : picked }
                      })
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="perm-meta">
                <div>
                  <span className="perm-label">工具</span> {payload.toolName}
                </div>
                {payload.blockedPath && (
                  <div>
                    <span className="perm-label">路径</span> {payload.blockedPath}
                  </div>
                )}
              </div>
              <ToolInputView inputPreview={payload.inputPreview} skipDescription={!!payload.description} />
              <label className="field">
                <span>拒绝原因（可选）</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="modal-footer">
          {isAsk ? (
            <>
              <button className="btn-secondary" onClick={() => onRespond(false, '用户取消了补充输入')}>
                取消
              </button>
              <button className="btn-primary" onClick={submitAsk}>
                提交
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => onRespond(false, reason)}>
                拒绝
              </button>
              <button className="btn-secondary" onClick={() => onRespond(true, undefined, true)}>
                允许并记住本会话
              </button>
              <button
                className={payload.dangerous ? 'btn-danger' : 'btn-primary'}
                onClick={() => onRespond(true)}
              >
                允许
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
