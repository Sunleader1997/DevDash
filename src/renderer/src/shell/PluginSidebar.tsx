export type PluginListItem = {
  id: string
  title: string
  icon?: string
  order?: number
  packageName: string
  uiUrl: string
}

export function PluginSidebar({
  plugins,
  activeId,
  onSelect
}: {
  plugins: PluginListItem[]
  activeId: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-section-label">插件应用</div>
      <nav className="plugin-list">
        {plugins.map((p) => (
          <button
            key={p.id}
            className={`plugin-item${activeId === p.id ? ' active' : ''}`}
            onClick={() => onSelect(p.id)}
            title={p.packageName}
          >
            <span className="plugin-icon">{iconGlyph(p.icon)}</span>
            <span>{p.title}</span>
          </button>
        ))}
        {plugins.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--fg-secondary)', fontSize: 12 }}>
            未发现插件。可将 npm 插件安装到 plugins/ 目录。
          </div>
        )}
      </nav>
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
    default:
      return '◆'
  }
}
