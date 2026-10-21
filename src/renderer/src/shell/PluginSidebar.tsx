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

export function PluginSidebar({
  plugins,
  activeId,
  tasks,
  activeTaskId,
  onSelectPlugin,
  onSelectTask,
  onNewTask,
  onDeleteTask
}: {
  plugins: PluginListItem[]
  activeId: string | null
  tasks: TaskListItem[]
  activeTaskId: string | null
  onSelectPlugin: (id: string) => void
  onSelectTask: (id: string) => void
  onNewTask: () => void
  onDeleteTask: (id: string) => void
}): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
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
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0,
                font: 'inherit'
              }}
            >
              {t.status === 'running' ? '● ' : ''}
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
        <button
          className="footer-brand"
          title="打开 GitHub 仓库"
          onClick={() => {
            void window.devdash.invoke('shell:open-external', 'https://github.com/Sunleader1997/DevDash')
          }}
        >
          DevDash
        </button>
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
