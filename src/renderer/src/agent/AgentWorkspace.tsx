import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccessMode,
  AgentSettings,
  AgentTask,
  ChatMessage,
  PermissionRequestPayload,
  SkillInfo
} from './types'
import {
  cancelSession,
  listSkills,
  listTasks,
  loadHistory,
  onAgentEvent,
  respondPermission,
  sendMessage,
  switchModel
} from './agentApi'

type PluginLite = { id: string; title: string; packageName: string }
type PickKind = 'plugin' | 'skill' | null

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
  const [draft, setDraft] = useState('')
  const [pluginRefs, setPluginRefs] = useState<string[]>([])
  const [skillRefs, setSkillRefs] = useState<string[]>([])
  const [pickKind, setPickKind] = useState<PickKind>(null)
  const [pickFilter, setPickFilter] = useState('')
  const [sending, setSending] = useState(false)
  const [permission, setPermission] = useState<PermissionRequestPayload | null>(null)
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [accessMode, setAccessMode] = useState<AccessMode>('approve')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

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

  useEffect(() => {
    let cancelled = false
    setMessages([])
    setPluginRefs([])
    setSkillRefs([])
    setDraft('')
    setStatusLine(null)
    Promise.all([listTasks(), loadHistory(taskId)])
      .then(([tasks, history]) => {
        if (cancelled) return
        const t = tasks.find((x) => x.id === taskId) ?? null
        setTask(t)
        setAccessMode(t?.accessMode ?? 'approve')
        setMessages(history)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [taskId])

  useEffect(() => {
    return onAgentEvent((e) => {
      if (e.type === 'message' && e.taskId === taskId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === e.message.id)) return prev
          return [...prev, e.message]
        })
        if (e.message.role === 'assistant') {
          setStatusLine(null)
          setSending(false)
        }
        if (e.message.role === 'user') onTasksChanged()
      } else if (e.type === 'message-update' && e.taskId === taskId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === e.messageId
              ? {
                  ...m,
                  text: e.text || m.text,
                  streaming: e.streaming ?? false
                }
              : m
          )
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
        if (e.status === 'running') setStatusLine('Agent 运行中…')
        else if (e.status === 'error') setStatusLine(e.error || '出错了')
        else setStatusLine(null)
        if (e.status !== 'running') setSending(false)
        onTasksChanged()
      } else if (e.type === 'permission' && e.payload.taskId === taskId) {
        setPermission(e.payload)
      } else if (e.type === 'error' && e.taskId === taskId) {
        setStatusLine(e.message)
        setSending(false)
      }
    })
  }, [taskId, onTasksChanged])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

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
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  }, [skills, pickFilter])

  const insertPlugin = useCallback((id: string) => {
    setPluginRefs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setDraft((d) => d.replace(/#([^\s#]*)$/, ''))
    setPickKind(null)
    setPickFilter('')
    inputRef.current?.focus()
  }, [])

  const insertSkill = useCallback((id: string) => {
    setSkillRefs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setDraft((d) => d.replace(/\/([^\s/]*)$/, ''))
    setPickKind(null)
    setPickFilter('')
    inputRef.current?.focus()
  }, [])

  const onDraftChange = (value: string): void => {
    setDraft(value)
    const hash = value.match(/#([^\s#]*)$/)
    const slash = value.match(/\/([^\s/]*)$/)
    if (hash) {
      setPickKind('plugin')
      setPickFilter(hash[1] ?? '')
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
    setStatusLine('发送中…')
    const result = await sendMessage({
      taskId,
      text,
      pluginRefs,
      skillRefs,
      modelId: activeModel?.id,
      accessMode
    })
    if (!result.ok) {
      setStatusLine(result.error || '发送失败')
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
    } else {
      setStatusLine(r.error || '切换模型失败')
    }
  }

  return (
    <div className="agent-workspace">
      <header className="agent-header">
        <div className="agent-title">{task?.title || '新任务'}</div>
        <div className="agent-header-right">
          {task?.status === 'running' ? (
            <button
              className="btn-secondary"
              onClick={() => {
                void cancelSession(taskId)
                setSending(false)
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
              <code>#</code> 引用插件 · <code>/</code> 引用 skill
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {statusLine && (
          <div className={`agent-status${task?.status === 'error' ? ' error' : ''}`}>{statusLine}</div>
        )}
      </div>

      <div className="agent-composer">
        {(pluginRefs.length > 0 || skillRefs.length > 0) && (
          <div className="ref-chips">
            {pluginRefs.map((id) => (
              <span key={`p-${id}`} className="ref-chip plugin">
                #{id}
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
                <div className="mention-label">插件 · #</div>
                {filteredPlugins.length === 0 && <div className="mention-empty">无匹配插件</div>}
                {filteredPlugins.map((p) => (
                  <button key={p.id} className="mention-item" onMouseDown={() => insertPlugin(p.id)}>
                    <span className="mention-id">#{p.id}</span>
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

        <textarea
          ref={inputRef}
          className="composer-input"
          placeholder="描述要开发或修改的插件…（# 插件 · / skill）"
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
            <div className="mode-toggle" role="group" aria-label="访问模式">
              <button
                type="button"
                className={`mode-btn${accessMode === 'approve' ? ' active' : ''}`}
                title="危险操作需确认"
                onClick={() => setAccessMode('approve')}
              >
                审批模式
              </button>
              <button
                type="button"
                className={`mode-btn${accessMode === 'full' ? ' active' : ''}`}
                title="跳过权限确认，Agent 自主执行"
                onClick={() => setAccessMode('full')}
              >
                完全访问
              </button>
            </div>

            <select
              className="footer-select"
              value={activeModel?.id ?? ''}
              onChange={(e) => void onModelChange(e.target.value)}
              title="切换对话模型"
            >
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
              type="button"
              className={`footer-chip${pickKind === 'skill' ? ' active' : ''}`}
              title="引用 skill（点击开关，或在输入框键入 /）"
              onClick={() => {
                setPickKind((k) => (k === 'skill' ? null : 'skill'))
                setPickFilter('')
                inputRef.current?.focus()
              }}
            >
              / skill
            </button>
            <button
              type="button"
              className={`footer-chip${pickKind === 'plugin' ? ' active' : ''}`}
              title="引用插件（点击开关，或在输入框键入 #）"
              onClick={() => {
                setPickKind((k) => (k === 'plugin' ? null : 'plugin'))
                setPickFilter('')
                inputRef.current?.focus()
              }}
            >
              # 插件
            </button>
          </div>

          <div className="composer-footer-right">
            <button
              type="button"
              className="btn-icon footer-settings"
              title="模型设置"
              onClick={onOpenSettings}
            >
              ⚙
            </button>
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

      {permission && (
        <PermissionDialog
          payload={permission}
          onRespond={(allow, reason) => {
            void respondPermission(permission.requestId, allow, reason)
            setPermission(null)
          }}
        />
      )}
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }): JSX.Element {
  if (message.role === 'tool') {
    return (
      <div className="msg msg-tool">
        <div className="msg-meta">
          <span className="msg-role">工具</span>
          <span className="msg-tool-name">{message.toolName}</span>
        </div>
        <pre className="msg-code">{message.text}</pre>
      </div>
    )
  }
  if (message.role === 'system') {
    return (
      <div className={`msg msg-system${message.error ? ' error' : ''}`}>
        <div className="msg-meta">
          <span className="msg-role">系统</span>
        </div>
        <div className="msg-text">{message.text}</div>
      </div>
    )
  }
  const isUser = message.role === 'user'
  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-assistant'}`}>
      <div className="msg-meta">
        <span className="msg-role">{isUser ? '你' : 'Agent'}</span>
        {message.pluginRefs && message.pluginRefs.length > 0 && (
          <span className="msg-refs">{message.pluginRefs.map((r) => `#${r}`).join(' ')}</span>
        )}
        {message.skillRefs && message.skillRefs.length > 0 && (
          <span className="msg-refs">{message.skillRefs.map((r) => `/${r}`).join(' ')}</span>
        )}
        {message.streaming && <span className="msg-streaming">生成中…</span>}
      </div>
      <div className="msg-text">{message.text}</div>
    </div>
  )
}

function PermissionDialog({
  payload,
  onRespond
}: {
  payload: PermissionRequestPayload
  onRespond: (allow: boolean, reason?: string) => void
}): JSX.Element {
  const [reason, setReason] = useState('')
  return (
    <div className="modal-backdrop">
      <div className="modal permission-modal">
        <div className="modal-header">
          <div className="modal-title">{payload.dangerous ? '危险操作确认' : '操作确认'}</div>
        </div>
        <div className="modal-body">
          <div className="perm-title">{payload.title}</div>
          {payload.description && <div className="perm-desc">{payload.description}</div>}
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
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => onRespond(false, reason)}>
            拒绝
          </button>
          <button
            className={payload.dangerous ? 'btn-danger' : 'btn-primary'}
            onClick={() => onRespond(true)}
          >
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
