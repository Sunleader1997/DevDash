import { useCallback, useEffect, useRef, useState, useSyncExternalStore, ComponentType, Suspense } from 'react'
import type { DevDashPluginMeta } from './hostApi'
import { PluginSidebar, type TaskListItem } from './shell/PluginSidebar'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { AgentWorkspace } from './agent/AgentWorkspace'
import { SettingsModal } from './agent/SettingsModal'
import type { AgentPhase, AgentSettings } from './agent/types'
import { createTask, deleteTask, getSettings, listTasks, onAgentEvent } from './agent/agentApi'
import { resolveStatus, setLiveStatus, subscribeLiveStatus, liveStatusVersion } from './agent/liveStatus'
import './agent/agent.css'

type DiscoveredPlugin = Omit<DevDashPluginMeta, 'rootDir' | 'uiEntry'> & { uiUrl: string }

type LoadedPlugin = {
  meta: DiscoveredPlugin
  App: ComponentType
}

type View =
  | { kind: 'agent'; taskId: string }
  | { kind: 'plugin'; pluginId: string }

export default function App(): JSX.Element {
  const [plugins, setPlugins] = useState<DiscoveredPlugin[]>([])
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [view, setView] = useState<View | null>(null)
  const [loaded, setLoaded] = useState<Record<string, LoadedPlugin>>({})
  /** App-level notices (task ops etc.) — toast only, never blocks the workspace. */
  const [error, setError] = useState<string | null>(null)
  /** Per-plugin dynamic-import failures. Scoped to the plugin pane so sessions stay usable. */
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({})
  /** Bumped on retry / hot-reload so the lazy-import effect re-runs. */
  const [loadNonce, setLoadNonce] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFocus, setSettingsFocus] = useState<'models' | 'uiDev'>('models')
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)
  /** Bumped on hot-reload so in-flight imports from a previous gen are discarded. */
  const reloadGen = useRef(0)
  /** Monotonic refresh token — ignores stale listTasks responses. */
  const listSeq = useRef(0)

  const refreshTasks = useCallback(() => {
    const seq = ++listSeq.current
    listTasks()
      .then((list) => {
        // Drop out-of-order responses so a slow listSessions call cannot
        // overwrite a newer status with a stale `running` snapshot.
        if (seq !== listSeq.current) return
        setTasks(
          list.map((t) => ({
            id: t.id,
            title: t.title,
            status: resolveStatus(t.id, t.status)
          }))
        )
      })
      .catch(() => setTasks([]))
  }, [])

  // Re-render when live status changes so the sidebar spinner tracks the
  // composer chip without waiting for another listTasks round-trip.
  useSyncExternalStore(subscribeLiveStatus, () => liveStatusVersion(), () => 0)

  // Live status events are the same source as the composer status chip.
  // Subscribe at app level so the sidebar spinner stays in sync even when
  // AgentWorkspace is unmounted (e.g. viewing a plugin).
  useEffect(() => {
    return onAgentEvent((e) => {
      if (e.type !== 'status') return
      const nextPhase: AgentPhase = e.phase
        ? e.phase
        : e.status === 'running'
          ? 'thinking'
          : e.status === 'error'
            ? 'error'
            : 'idle'
      setLiveStatus(e.taskId, { status: e.status, phase: nextPhase })
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === e.taskId)
        if (idx < 0) {
          // New or unknown task — pick it up from the store.
          refreshTasks()
          return prev
        }
        if (prev[idx].status === e.status) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], status: e.status }
        return next
      })
    })
  }, [refreshTasks])

  useEffect(() => {
    let cancelled = false
    window.devdash
      .invoke('plugin:list')
      .then((raw) => {
        if (cancelled) return
        const list = raw as DiscoveredPlugin[]
        setPlugins(list)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    refreshTasks()
    getSettings()
      .then(setAgentSettings)
      .catch(() => setAgentSettings(null))
  }, [refreshTasks])

  // Default view: plugin declaring `home` (landing), else first agent task, else first plugin
  useEffect(() => {
    if (view) return
    const landing = plugins.find((p) => p.home)
    if (landing) {
      setView({ kind: 'plugin', pluginId: landing.id })
      return
    }
    if (tasks.length > 0) {
      setView({ kind: 'agent', taskId: tasks[0].id })
      return
    }
    if (plugins.length > 0) {
      setView({ kind: 'plugin', pluginId: plugins[0].id })
    }
  }, [view, tasks, plugins])

  // Lazy-load plugin UI when viewing a plugin
  useEffect(() => {
    if (view?.kind !== 'plugin') return
    const activeId = view.pluginId
    const meta = plugins.find((p) => p.id === activeId)
    if (!meta || loaded[activeId]) return
    let cancelled = false
    const gen = reloadGen.current
    setPluginErrors((prev) => {
      if (!(activeId in prev)) return prev
      const next = { ...prev }
      delete next[activeId]
      return next
    })
    import(/* @vite-ignore */ `${meta.uiUrl}?t=${Date.now()}`)
      .then((mod: { default?: { App: ComponentType }; App?: ComponentType }) => {
        if (cancelled || gen !== reloadGen.current) return
        const pluginApp = mod.default?.App ?? mod.App
        if (!pluginApp) {
          setPluginErrors((prev) => ({ ...prev, [activeId]: `插件 ${meta.id} 未导出 App 组件` }))
          return
        }
        setLoaded((prev) => ({
          ...prev,
          [activeId]: { meta, App: pluginApp as ComponentType }
        }))
      })
      .catch((e: Error) => {
        if (cancelled || gen !== reloadGen.current) return
        setPluginErrors((prev) => ({
          ...prev,
          [activeId]: `加载插件失败：${e.message}`
        }))
      })
    return () => {
      cancelled = true
    }
  }, [view, plugins, loaded, loadNonce])

  const retryPlugin = useCallback((pluginId: string) => {
    setPluginErrors((prev) => {
      if (!(pluginId in prev)) return prev
      const next = { ...prev }
      delete next[pluginId]
      return next
    })
    setLoaded((prev) => {
      if (!(pluginId in prev)) return prev
      const next = { ...prev }
      delete next[pluginId]
      return next
    })
    setLoadNonce((n) => n + 1)
  }, [])

  // Hot-reload plugin UI modules (agent tool / manual) without restarting Electron.
  useEffect(() => {
    const onReload = (e: Event) => {
      const raw = (e as CustomEvent<{ pluginId?: string | null }>).detail?.pluginId
      const targetId = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
      reloadGen.current += 1
      setLoaded((prev) => {
        // Always return a new object so the lazy-import effect re-runs even when
        // the module was still importing (key not yet present).
        if (!targetId) return {}
        const next = { ...prev }
        delete next[targetId]
        return next
      })
      setPluginErrors((prev) => {
        if (!targetId) return {}
        if (!(targetId in prev)) return prev
        const next = { ...prev }
        delete next[targetId]
        return next
      })
      setError(null)
      setLoadNonce((n) => n + 1)
      // Re-discover list so new/renamed plugins show up (plugin IPC is runtime-registered).
      window.devdash
        .invoke('plugin:list')
        .then((raw) => setPlugins(raw as DiscoveredPlugin[]))
        .catch(() => {})
    }
    const onPluginsChanged = (): void => {
      onReload(new CustomEvent('devdash:reload-plugin-ui', { detail: {} }))
    }
    window.addEventListener('devdash:reload-plugin-ui', onReload as EventListener)
    window.addEventListener('devdash:plugins-changed', onPluginsChanged as EventListener)
    return () => {
      window.removeEventListener('devdash:reload-plugin-ui', onReload as EventListener)
      window.removeEventListener('devdash:plugins-changed', onPluginsChanged as EventListener)
    }
  }, [])

  const onNewTask = (): void => {
    void createTask('新任务')
      .then((t) => {
        refreshTasks()
        setError(null)
        setView({ kind: 'agent', taskId: t.id })
      })
      .catch((e: Error) => setError(e.message))
  }

  const onDeleteTask = (id: string): void => {
    void deleteTask(id)
      .then(() => {
        // Optimistic: drop from list immediately so UI responds
        setTasks((prev) => prev.filter((t) => t.id !== id))
        setView((v) => (v?.kind === 'agent' && v.taskId === id ? null : v))
        refreshTasks()
      })
      .catch((e: Error) => setError(e.message))
  }

  const selectPlugin = (id: string): void => {
    setError(null)
    setView({ kind: 'plugin', pluginId: id })
  }

  const selectTask = (id: string): void => {
    setError(null)
    setView({ kind: 'agent', taskId: id })
  }

  const activePlugin = view?.kind === 'plugin' ? loaded[view.pluginId] : null
  const pluginError = view?.kind === 'plugin' ? (pluginErrors[view.pluginId] ?? null) : null
  // Overlay live event status so the spinner matches the composer chip immediately.
  const displayTasks: TaskListItem[] = tasks.map((t) => ({
    ...t,
    status: resolveStatus(t.id, t.status)
  }))
  const titlePage =
    view?.kind === 'agent'
      ? 'Agent 任务'
      : activePlugin
        ? activePlugin.meta.title
        : ''

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <div className="titlebar-drag-shield" aria-hidden="true" />
        {window.devdash.platform !== 'darwin' && (
          <div className="traffic-lights">
            <button
              className="tl tl-close"
              title="关闭"
              onClick={() => void window.devdash.invoke('window:close')}
            />
            <button
              className="tl tl-min"
              title="最小化"
              onClick={() => void window.devdash.invoke('window:minimize')}
            />
            <button
              className="tl tl-max"
              title="最大化"
              onClick={() => void window.devdash.invoke('window:maximize')}
            />
          </div>
        )}
        <div className="titlebar-drag">
          <div className="titlebar-brand">
            <span className="titlebar-dot" />
            {titlePage ? <span className="titlebar-name">{titlePage}</span> : null}
          </div>
        </div>
      </header>
      <div className="app-body">
        <PluginSidebar
          plugins={plugins}
          activeId={view?.kind === 'plugin' ? view.pluginId : null}
          tasks={displayTasks}
          activeTaskId={view?.kind === 'agent' ? view.taskId : null}
          onSelectPlugin={selectPlugin}
          onSelectTask={selectTask}
          onNewTask={onNewTask}
          onDeleteTask={onDeleteTask}
          onOpenSettings={() => {
            setSettingsFocus('uiDev')
            setSettingsOpen(true)
          }}
        />
        <main className="workspace">
          <div className="workspace-body">
            {view?.kind === 'agent' ? (
              <AgentWorkspace
                key={view.taskId}
                taskId={view.taskId}
                settings={agentSettings}
                onSettingsChange={setAgentSettings}
                onOpenSettings={() => {
                  setSettingsFocus('models')
                  setSettingsOpen(true)
                }}
                onTasksChanged={refreshTasks}
              />
            ) : pluginError ? (
              <div className="empty-state">
                <div style={{ maxWidth: 520 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>插件加载失败</div>
                  <div
                    style={{
                      color: 'var(--danger)',
                      marginBottom: 12,
                      wordBreak: 'break-all'
                    }}
                  >
                    {pluginError}
                  </div>
                  <div style={{ marginBottom: 16, color: 'var(--fg-secondary)' }}>
                    插件还在开发中或构建产物损坏时会出现。修好后点「重试」，或让 agent
                    构建后再热重载；切换左侧会话不受影响。
                  </div>
                  <button
                    className="gm-btn"
                    onClick={() => view && retryPlugin(view.pluginId)}
                  >
                    重试
                  </button>
                </div>
              </div>
            ) : activePlugin ? (
              <ErrorBoundary
                key={activePlugin.meta.id}
                onRetry={() => retryPlugin(activePlugin.meta.id)}
              >
                <Suspense fallback={<div className="empty-state">加载插件…</div>}>
                  <activePlugin.App />
                </Suspense>
              </ErrorBoundary>
            ) : view?.kind === 'plugin' ? (
              <div className="empty-state">加载插件…</div>
            ) : (
              <div className="empty-state">
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>DevDash</div>
                  <div>左上角「新建任务」，用对话开发插件</div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {error ? (
        <div className="toast error" role="alert">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>出错了</div>
          <div style={{ wordBreak: 'break-all' }}>{error}</div>
          <button
            className="gm-btn"
            style={{ marginTop: 8 }}
            onClick={() => setError(null)}
          >
            知道了
          </button>
        </div>
      ) : null}
      <SettingsModal
        open={settingsOpen}
        focus={settingsFocus}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => setAgentSettings(s)}
      />
    </div>
  )
}
