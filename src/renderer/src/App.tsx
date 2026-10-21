import { useCallback, useEffect, useRef, useState, ComponentType, Suspense } from 'react'
import type { DevDashPluginMeta } from './hostApi'
import { PluginSidebar, type TaskListItem } from './shell/PluginSidebar'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { AgentWorkspace } from './agent/AgentWorkspace'
import { SettingsModal } from './agent/SettingsModal'
import type { AgentSettings } from './agent/types'
import { createTask, deleteTask, getSettings, listTasks } from './agent/agentApi'
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
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFocus, setSettingsFocus] = useState<'models' | 'uiDev'>('models')
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)
  /** Bumped on hot-reload so in-flight imports from a previous gen are discarded. */
  const reloadGen = useRef(0)

  const refreshTasks = useCallback(() => {
    listTasks()
      .then((list) => {
        setTasks(list.map((t) => ({ id: t.id, title: t.title, status: t.status })))
      })
      .catch(() => setTasks([]))
  }, [])

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
    import(/* @vite-ignore */ `${meta.uiUrl}?t=${Date.now()}`)
      .then((mod: { default?: { App: ComponentType }; App?: ComponentType }) => {
        if (cancelled || gen !== reloadGen.current) return
        const pluginApp = mod.default?.App ?? mod.App
        if (!pluginApp) {
          setError(`插件 ${meta.id} 未导出 App 组件`)
          return
        }
        setLoaded((prev) => ({
          ...prev,
          [activeId]: { meta, App: pluginApp as ComponentType }
        }))
      })
      .catch((e: Error) => {
        if (cancelled || gen !== reloadGen.current) return
        setError(`加载插件失败：${e.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [view, plugins, loaded])

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
      setError(null)
      // Re-discover list so new/renamed plugins show up (UI-only; IPC still needs restart).
      window.devdash
        .invoke('plugin:list')
        .then((raw) => setPlugins(raw as DiscoveredPlugin[]))
        .catch(() => {})
    }
    window.addEventListener('devdash:reload-plugin-ui', onReload as EventListener)
    return () => {
      window.removeEventListener('devdash:reload-plugin-ui', onReload as EventListener)
    }
  }, [])

  const onNewTask = (): void => {
    void createTask('新任务')
      .then((t) => {
        refreshTasks()
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

  const activePlugin = view?.kind === 'plugin' ? loaded[view.pluginId] : null
  const titlePage =
    view?.kind === 'agent'
      ? 'Agent 任务'
      : activePlugin
        ? activePlugin.meta.title
        : 'DevDash'

  return (
    <div className="app-shell">
      <header className="app-titlebar">
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
            <span className="titlebar-name">DevDash</span>
            <span className="titlebar-sep">/</span>
            <span className="titlebar-page">{titlePage}</span>
          </div>
        </div>
      </header>
      <div className="app-body">
        <PluginSidebar
          plugins={plugins}
          activeId={view?.kind === 'plugin' ? view.pluginId : null}
          tasks={tasks}
          activeTaskId={view?.kind === 'agent' ? view.taskId : null}
          onSelectPlugin={(id) => setView({ kind: 'plugin', pluginId: id })}
          onSelectTask={(id) => setView({ kind: 'agent', taskId: id })}
          onNewTask={onNewTask}
          onDeleteTask={onDeleteTask}
          onOpenSettings={() => {
            setSettingsFocus('uiDev')
            setSettingsOpen(true)
          }}
        />
        <main className="workspace">
          <div className="workspace-body">
            {error ? (
              <div className="empty-state">
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>出错了</div>
                  <div>{error}</div>
                </div>
              </div>
            ) : view?.kind === 'agent' ? (
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
            ) : activePlugin ? (
              <ErrorBoundary key={activePlugin.meta.id}>
                <Suspense fallback={<div className="empty-state">加载插件…</div>}>
                  <activePlugin.App />
                </Suspense>
              </ErrorBoundary>
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
      <SettingsModal
        open={settingsOpen}
        focus={settingsFocus}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => setAgentSettings(s)}
      />
    </div>
  )
}
