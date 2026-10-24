import { useEffect, useRef, useState } from 'react'
import { TaskFooter } from './TaskFooter'

export type PluginListItem = {
  id: string
  title: string
  icon?: string
  order?: number
  packageName: string
  uiUrl: string
}

export type TaskListItem = {
  id: string
  title: string
  status: 'idle' | 'running' | 'error'
}

const GITHUB_URL = 'https://github.com/Sunleader1997/DevDash'

export function PluginSidebar({
  plugins,
  activeId,
  tasks,
  activeTaskId,
  onSelectPlugin,
  onSelectTask,
  onNewTask,
  onDeleteTask,
  onOpenSettings
}: {
  plugins: PluginListItem[]
  activeId: string | null
  tasks: TaskListItem[]
  activeTaskId: string | null
  onSelectPlugin: (id: string) => void
  onSelectTask: (id: string) => void
  onNewTask: () => void
  onDeleteTask: (id: string) => void
  onOpenSettings: () => void
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand" aria-label="DevDash">
          DevDash
        </div>
        <button className="sidebar-new-task" onClick={onNewTask}>
          ＋ 新建任务
        </button>
      </div>

      <div className="sidebar-section-label">对话任务</div>
      <nav className="task-list">
        {tasks.map((t) => (
          <div key={t.id} className={`task-item${activeTaskId === t.id ? ' active' : ''}`}>
            <button
              className="task-item-title"
              onClick={() => onSelectTask(t.id)}
              title={t.title}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'var(--cursor-pointer)',
                textAlign: 'left',
                padding: 0,
                font: 'inherit'
              }}
            >
              {t.status === 'running' ? (
                <span className="task-spinner" title="运行中" />
              ) : t.status === 'error' ? (
                <span className="task-dot error" title="出错" />
              ) : (
                <span className="task-dot idle" aria-hidden="true" />
              )}
              {t.title}
            </button>
            <button
              className="task-item-del"
              title="删除任务"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteTask(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <div style={{ padding: '6px 10px', color: 'var(--fg-secondary)', fontSize: 12 }}>
            暂无任务，点上方新建。
          </div>
        )}
      </nav>

      <div className="sidebar-section-label">插件应用</div>
      <nav className="plugin-list">
        {plugins.map((p) => (
          <button
            key={p.id}
            className={`plugin-item${activeId === p.id ? ' active' : ''}`}
            onClick={() => onSelectPlugin(p.id)}
            title={p.packageName}
          >
            <span className="plugin-icon">{iconGlyph(p.icon)}</span>
            <span>{p.title}</span>
          </button>
        ))}
        {plugins.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--fg-secondary)', fontSize: 12 }}>
            未发现插件。可在对话中用 Agent 新建。
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="footer-brand-wrap" ref={menuRef}>
          <button
            className={`footer-brand${menuOpen ? ' active' : ''}`}
            title="应用菜单"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            菜单
            <svg className="footer-brand-caret" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M2 3 L4 5 L6 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          {menuOpen && (
            <div className="brand-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="brand-menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenSettings()
                }}
              >
                <span className="brand-menu-icon">⚙</span>
                设置
              </button>
              <button
                type="button"
                role="menuitem"
                className="brand-menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  void window.devdash.invoke('shell:open-external', GITHUB_URL)
                }}
              >
                <span className="brand-menu-icon">↗</span>
                GitHub 仓库
              </button>
            </div>
          )}
        </div>
        <TaskFooter />
      </div>
    </aside>
  )
}

function iconGlyph(icon?: string): string {
  switch (icon) {
    case 'git-branch':
      return '⎇'
    case 'code':
      return '{}'
    case 'chart':
      return '◈'
    case 'moon':
      return '☾'
    default:
      return '◆'
  }
}
