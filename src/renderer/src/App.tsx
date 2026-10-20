import { useEffect, useState, ComponentType, Suspense } from 'react'
import type { DevDashPluginMeta } from './hostApi'
import { PluginSidebar } from './shell/PluginSidebar'
import { TaskFooter } from './shell/TaskFooter'
import { ErrorBoundary } from './shell/ErrorBoundary'

type DiscoveredPlugin = Omit<DevDashPluginMeta, 'rootDir' | 'uiEntry'> & { uiUrl: string }

type LoadedPlugin = {
  meta: DiscoveredPlugin
  App: ComponentType
}

export default function App(): JSX.Element {
  const [plugins, setPlugins] = useState<DiscoveredPlugin[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Record<string, LoadedPlugin>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.devdash
      .invoke('plugin:list')
      .then((raw) => {
        if (cancelled) return
        const list = raw as DiscoveredPlugin[]
        setPlugins(list)
        if (list[0]) setActiveId((prev) => prev ?? list[0].id)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeId) return
    const meta = plugins.find((p) => p.id === activeId)
    if (!meta || loaded[activeId]) return
    let cancelled = false
    import(/* @vite-ignore */ meta.uiUrl)
      .then((mod: { default?: { App: ComponentType }; App?: ComponentType }) => {
        if (cancelled) return
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
      .catch((e: Error) => setError(`加载插件失败：${e.message}`))
    return () => {
      cancelled = true
    }
  }, [activeId, plugins, loaded])

  const active = activeId ? loaded[activeId] : null

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
            {active && (
              <>
                <span className="titlebar-sep">/</span>
                <span className="titlebar-page">{active.meta.title}</span>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="app-body">
        <PluginSidebar plugins={plugins} activeId={activeId} onSelect={setActiveId} />
        <main className="workspace">
          <div className="workspace-body">
            {error ? (
              <div className="empty-state">
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>出错了</div>
                  <div>{error}</div>
                </div>
              </div>
            ) : active ? (
              <ErrorBoundary key={active.meta.id}>
                <Suspense fallback={<div className="empty-state">加载插件…</div>}>
                  <active.App />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <div className="empty-state">
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>DevDash</div>
                  <div>从左侧选择一个插件应用开始</div>
                </div>
              </div>
            )}
          </div>
          <footer className="app-footer">
            <span className="footer-hint">DevDash</span>
            <TaskFooter />
          </footer>
        </main>
      </div>
    </div>
  )
}
