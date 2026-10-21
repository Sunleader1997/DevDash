import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccessMode,
  AgentEvent,
  AgentPhase,
  AgentSettings,
  AgentTask,
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

type PluginLite = { id: string; title: string; packageName: string }
type PickKind = 'plugin' | 'skill' | null

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: '就绪',
  thinking: '思考中',
  tool: '使用工具',
  waiting: '等待你确认',
  streaming: '生成中',
  error: '出错'
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
  const [sending, setSending] = useState(false)
  const [permission, setPermission] = useState<PermissionRequestPayload | null>(null)
  const [phase, setPhase] = useState<AgentPhase>('idle')
  const [statusNote, setStatusNote] = useState<string | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setMessages([])
    setPluginRefs([])
    setSkillRefs([])
    setDraft('')
    setStatusNote(null)
    setPhase('idle')
    Promise.all([listTasks(), loadHistory(taskId)])
      .then(([tasks, history]) => {
        if (cancelled) return
        const t = tasks.find((x) => x.id === taskId) ?? null
        setTask(t)
        setAccessMode(t?.accessMode ?? 'approve')
        setMessages(history)
        setPhase(t?.status === 'running' ? 'thinking' : t?.status === 'error' ? 'error' : 'idle')
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
        if (e.phase) setPhase(e.phase)
        else if (e.status === 'running') setPhase('thinking')
        else if (e.status === 'error') {
          setPhase('error')
          setStatusNote(e.error || '出错了')
        } else setPhase('idle')
        if (e.status !== 'running') setSending(false)
        if (e.status === 'running') setStatusNote(null)
        // SDK init may have published new skills/commands
        if (e.status === 'running' || e.phase === 'thinking') refreshCaps()
        onTasksChanged()
      } else if (e.type === 'permission' && e.payload.taskId === taskId) {
        setPermission(e.payload)
        setPhase('waiting')
      } else if (e.type === 'error' && e.taskId === taskId) {
        setStatusNote(e.message)
        setPhase('error')
        setSending(false)
      } else if (e.type === 'usage' && e.taskId === taskId) {
        setCtxUsed(e.usedTokens)
      }
    },
    [taskId, onTasksChanged, refreshCaps]
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
    const id = task?.modelId ?? settings.activePresetId
    return settings.presets.find((p) => p.id === id) ?? settings.presets[0] ?? null
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
    inputRef.current?.focus()
  }, [])

  const insertSkill = useCallback((id: string) => {
    setSkillRefs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setDraft((d) => d.replace(/\/([^\s/]*)$/, ''))
    setPickKind(null)
    setPickFilter('')
    setPlusOpen(false)
    inputRef.current?.focus()
  }, [])

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
    } else if (slash) {
      setPickKind('skill')
      setPickFilter(slash[1] ?? '')
    } else {
      setPickKind(null)
      setPickFilter('')
    }
  }

  const doSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sending) return
    if (!settings?.presets?.length) {
      onOpenSettings()
      return
    }
    setSending(true)
    setPhase('thinking')
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
      setStatusNote(result.error || '发送失败')
      setPhase('error')
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
      setStatusNote('模型已切换 · 下一动作生效')
    } else {
      setStatusNote(r.error || '切换模型失败')
    }
  }

  const onAccessChange = async (mode: AccessMode): Promise<void> => {
    if (mode === accessMode) return
    const prev = accessMode
    setAccessMode(mode)
    const r = await switchAccessMode(taskId, mode)
    if (r.ok) {
      setStatusNote(mode === 'full' ? '已切到完全访问 · 下一动作生效' : '已切到审批模式 · 下一动作生效')
    } else {
      setAccessMode(prev)
      setStatusNote(r.error || '切换访问模式失败')
    }
  }

  const running = task?.status === 'running' || sending
  const statusText = PHASE_LABEL[phase]
  const ctxTotal = activeModel?.contextInputTokens ?? 1_000_000

  return (
    <div className="agent-workspace">
      <header className="agent-header">
        <div className="agent-title">{task?.title || '新任务'}</div>
        <div className="agent-header-right">
          <span className={`agent-status-chip phase-${phase}`}>{statusText}</span>
          <span className="agent-mode-chip">{accessMode === 'full' ? '完全访问' : '审批模式'}</span>
          {running ? (
            <button
              className="btn-secondary"
              onClick={() => {
                void cancelSession(taskId)
                setSending(false)
                setPhase('idle')
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
        <div className="composer-statusline">
          <span className={`agent-status-chip phase-${phase}`}>{statusText}</span>
          {statusNote && <span className="composer-note">{statusNote}</span>}
        </div>

        {(pluginRefs.length > 0 || skillRefs.length > 0) && (
          <div className="ref-chips">
            {pluginRefs.map((id) => (
              <span key={`p-${id}`} className="ref-chip plugin">
                @{id}
                <button onClick={() => setPluginRefs((prev) => prev.filter((x) => x !== id))}>×</button>
              </span>
            ))}
            {skillRefs.map((id) => (
              <span key={`s-${id}`} className="ref-chip skill">
                /{id}
                <button onClick={() => setSkillRefs((prev) => prev.filter((x) => x !== id))}>×</button>
              </span>
            ))}
          </div>
        )}

        {pickKind && (
          <div className="mention-menu">
            {pickKind === 'plugin' ? (
              <>
                <div className="mention-label">插件 · @</div>
                {filteredPlugins.length === 0 && <div className="mention-empty">无匹配插件</div>}
                {filteredPlugins.map((p) => (
                  <button key={p.id} className="mention-item" onMouseDown={() => insertPlugin(p.id)}>
                    <span className="mention-id">@{p.id}</span>
                    <span className="mention-title">{p.title}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="mention-label">Skill · /</div>
                {filteredSkills.length === 0 && <div className="mention-empty">无匹配 skill</div>}
                {filteredSkills.map((s) => (
                  <button key={s.id} className="mention-item" onMouseDown={() => insertSkill(s.id)}>
                    <span className="mention-id">/{s.id}</span>
                    <span className="mention-title">{s.title}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="composer-box">
          <textarea
            ref={inputRef}
            className="composer-input"
            placeholder="描述要开发或修改的插件…（@ 插件 · / skill · + 编排）"
            value={draft}
            rows={4}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
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

              <div className="mode-toggle" role="group" aria-label="访问模式">
                <button
                  type="button"
                  className={`mode-btn${accessMode === 'approve' ? ' active' : ''}`}
                  title="危险操作需确认；切换后下一动作生效"
                  onClick={() => void onAccessChange('approve')}
                >
                  审批模式
                </button>
                <button
                  type="button"
                  className={`mode-btn${accessMode === 'full' ? ' active' : ''}`}
                  title="跳过权限确认；切换后下一动作生效"
                  onClick={() => void onAccessChange('full')}
                >
                  完全访问
                </button>
              </div>
            </div>

            <div className="composer-footer-right">
              <ContextRing used={ctxUsed} total={ctxTotal} />
              <select
                className="footer-select"
                value={activeModel?.id ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__add__') {
                    onOpenSettings()
                    return
                  }
                  void onModelChange(v)
                }}
                title="切换对话模型（下一动作生效）"
              >
                <option value="__add__">添加模型</option>
                {(settings?.presets ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.model}
                  </option>
                ))}
                {(!settings || settings.presets.length === 0) && (
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
            setPhase((p) => (p === 'waiting' ? 'thinking' : p))
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
        <span className="tool-summary">{inputText.split('\n')[0]?.slice(0, 120)}</span>
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
              {askQuestions.length === 0 && (
                <pre className="msg-code">{payload.inputPreview}</pre>
              )}
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
              <pre className="msg-code">{payload.inputPreview}</pre>
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
