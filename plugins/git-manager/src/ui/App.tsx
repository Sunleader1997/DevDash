import React, { useCallback, useEffect, useMemo, useRef, useState } from './host-react'
import { api } from './api'
import type {
  BranchInfo,
  CommitInfo,
  DiffFileInfo,
  GitLabDefaults,
  GitLabMember,
  GitLabRepoConfig,
  GitLabSettings,
  MrFormCache,
  RepoInfo,
  StatusEntry
} from './types'
import { ensurePluginStyle } from './styles'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function statusClass(s: StatusEntry['status'] | string): string {
  return `st-${s}`
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString()
}

function newBranchName(repoPath: string): string {
  const base = repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'repo'
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `feature/${slug}-${y}${m}${d}`
}

type ProjectRecord = { id: string; name: string; path: string; pinned?: boolean }

type OpenedFile = {
  path: string
  label: string
  status?: string
  patch: string
  /** Set when content cannot be shown without user confirmation. */
  block?: {
    kind: 'whitelist' | 'size' | 'binary' | 'error'
    size?: number
    message?: string
    ext?: string
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function IconPlus(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconGear(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 2.2a1.2 1.2 0 0 1 1.2 1.2v.35c.3.1.58.24.83.42l.28-.2a1.2 1.2 0 0 1 1.7 1.7l-.2.28c.18.25.32.53.42.83h.35a1.2 1.2 0 0 1 0 2.4h-.35c-.1.3-.24.58-.42.83l.2.28a1.2 1.2 0 0 1-1.7 1.7l-.28-.2c-.25.18-.53.32-.83.42v.35a1.2 1.2 0 0 1-2.4 0v-.35c-.3-.1-.58-.24-.83-.42l-.28.2a1.2 1.2 0 0 1-1.7-1.7l.2-.28a3.8 3.8 0 0 1-.42-.83H2.2a1.2 1.2 0 0 1 0-2.4h.35c.1-.3.24-.58.42-.83l-.2-.28a1.2 1.2 0 0 1 1.7-1.7l.28.2c.25-.18.53-.32.83-.42V3.4A1.2 1.2 0 0 1 8 2.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function IconMr(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <circle cx="4.5" cy="3.5" r="1.5" fill="currentColor" />
      <circle cx="4.5" cy="12.5" r="1.5" fill="currentColor" />
      <circle cx="11.5" cy="3.5" r="1.5" fill="currentColor" />
      <path d="M4.5 5v6M11.5 5v1.5a3 3 0 0 1-3 3H6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M7.2 8.2L5.5 9.9l1.7 1.7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBranch(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <circle cx="5" cy="4" r="1.6" fill="currentColor" />
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="11" cy="4" r="1.6" fill="currentColor" />
      <path d="M5 5.6v4.8M11 5.6v1.2a3 3 0 0 1-3 3H6.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  )
}

function IconCompare(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="9" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function IconClose(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      className="gm-tree-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconFolder({ open }: { open?: boolean }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      {open ? (
        <path
          d="M2 4.5h4l1.2 1.2H14v6.3H2V4.5z"
          fill="currentColor"
          opacity="0.25"
          stroke="currentColor"
          strokeWidth="1.1"
        />
      ) : (
        <>
          <path d="M2 4h4.2l1.2 1.2H14v7.3H2V4z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.1" />
          <path d="M2 6h12" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        </>
      )}
    </svg>
  )
}

function IconFile(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4 2h5.5L12 4.5V14H4V2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9 2v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconMenuRename(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 12.5l1-3.2L10.2 3l2.8 2.8L6.2 12l-3.2 1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function IconMenuPin(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 2h4v4l2 2v1H8v5l-.8 1.5h-.4L6 14V9H4V8l2-2V2z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </svg>
  )
}

function IconMenuFolder(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M2 4h4l1.2 1.2H14v7.3H2V4z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function IconMenuTrash(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 5h8l-.7 9H4.7L4 5zM6 5V3h4v2M3 5h10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconMenuIgnore(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 11.5l7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function IconMenuRevert(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3.5 7.5A5 5 0 118 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.5 4v3.5H7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MenuItem({
  icon,
  danger,
  onClick,
  children
}: {
  icon: JSX.Element
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button className={cx(danger && 'gm-menu-danger', 'gm-menu-item')} onClick={onClick}>
      <span className="gm-menu-icon">{icon}</span>
      <span>{children}</span>
    </button>
  )
}

type UiSizes = {
  sideWidth: number
  leftWidth: number
  historyHeight: number
}

const DEFAULT_SIZES: UiSizes = {
  sideWidth: 260,
  leftWidth: 280,
  historyHeight: 180
}

function loadProjects(): ProjectRecord[] {
  try {
    const raw = localStorage.getItem('devdash.git-manager.projects')
    return raw ? (JSON.parse(raw) as ProjectRecord[]) : []
  } catch {
    return []
  }
}

function saveProjects(list: ProjectRecord[]): void {
  localStorage.setItem('devdash.git-manager.projects', JSON.stringify(list))
}

/** Horizontal drag handle */
function Splitter({
  vertical,
  onDelta
}: {
  vertical?: boolean
  onDelta: (dx: number, dy: number) => void
}): JSX.Element {
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  const onPointerDown = (e: { clientX: number; clientY: number; currentTarget: { setPointerCapture: (id: number) => void }; pointerId?: number }) => {
    dragging.current = true
    last.current = { x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId ?? 1)
    } catch {
      /* noop */
    }
  }
  const onPointerMove = (e: { clientX: number; clientY: number }) => {
    if (!dragging.current) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    onDelta(dx, dy)
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div
      className={vertical ? 'gm-splitter vertical' : 'gm-splitter'}
      onPointerDown={onPointerDown as never}
      onPointerMove={onPointerMove as never}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}

function GitManagerApp(): JSX.Element {
  ensurePluginStyle()

  const [projects, setProjects] = useState<ProjectRecord[]>(() => loadProjects())
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {}
    for (const p of loadProjects()) all[p.id] = true
    return all
  })
  const [reposByProject, setReposByProject] = useState<Record<string, RepoInfo[]>>({})
  const [repoListCache, setRepoListCache] = useState<Record<string, string[]>>({})
  const [activeRepo, setActiveRepo] = useState<RepoInfo | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [sideWidth, setSideWidth] = useState(DEFAULT_SIZES.sideWidth)
  const [projMenu, setProjMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false)

  const showToast = useCallback((text: string, error?: boolean) => {
    setToast({ text, error })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    saveProjects(projects)
  }, [projects])

  // Auto-expand & scan all projects on mount
  useEffect(() => {
    for (const p of projects) {
      setExpanded((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: true }))
      if (!reposByProject[p.id]) void scanProject(p)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  const addProject = async () => {
    const dir = await api.pickDirectory()
    if (!dir) return
    if (projects.some((p) => p.path === dir)) {
      showToast('该项目已添加')
      return
    }
    const rec: ProjectRecord = {
      id: `${dir}`,
      name: dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dir,
      path: dir,
      pinned: false
    }
    void api.tasks('project-init', `初始化 ${rec.name}`, async () => {
      await api.storeRead(rec.path)
      return true
    }).catch(() => undefined)
    setProjects((prev) => [...prev, rec])
    setExpanded((prev) => ({ ...prev, [rec.id]: true }))
    void scanProject(rec)
  }

  const scanProject = async (project: ProjectRecord) => {
    try {
      const paths = await api.tasks(`scan-${project.id}`, `扫描 ${project.name}`, () =>
        api.findRepos(project.path, 3)
      )
      setRepoListCache((prev) => ({ ...prev, [project.id]: paths }))
      const infos = await Promise.all(
        paths.map(async (r) => {
          try {
            return await api.repoInfo(r)
          } catch {
            return { path: r, name: r.replace(/\\/g, '/').split('/').pop() ?? r, branch: null, dirtyCount: 0 }
          }
        })
      )
      setReposByProject((prev) => ({ ...prev, [project.id]: infos }))
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const removeProject = (id: string) => {
    const project = projects.find((p) => p.id === id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setReposByProject((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (project && activeRepo && activeRepo.path.startsWith(project.path)) {
      setActiveRepo(null)
      setActiveProject(null)
    }
  }

  const pinProject = (id: string) => {
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id)
      if (!target) return prev
      const rest = prev.filter((p) => p.id !== id)
      return [{ ...target, pinned: true }, ...rest]
    })
    setProjMenu(null)
  }

  const startRename = (id: string) => {
    const p = projects.find((x) => x.id === id)
    if (!p) return
    setRenamingId(id)
    setRenameDraft(p.name)
    setProjMenu(null)
  }

  const commitRename = () => {
    if (!renamingId) return
    const name = renameDraft.trim()
    if (name) {
      setProjects((prev) => prev.map((p) => (p.id === renamingId ? { ...p, name } : p)))
    }
    setRenamingId(null)
  }

  const openRepo = async (project: ProjectRecord, repoPath: string) => {
    try {
      const info = await api.repoInfo(repoPath)
      setGlobalSettingsOpen(false)
      setActiveRepo(info)
      setActiveProject(project)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div className="gm-root" style={{ gridTemplateColumns: `${sideWidth}px 5px 1fr` }}>
      <aside className="gm-side">
        <div className="gm-side-header">
          <div className="gm-side-title">项目</div>
          <button className="gm-btn icon bare" title="添加项目" aria-label="添加项目" onClick={() => void addProject()}>
            <IconPlus />
          </button>
        </div>
        <div className="gm-tree">
          {[...projects]
            .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
            .map((p) => {
            const open = expanded[p.id]
            const repos = reposByProject[p.id]
            return (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div
                  className="gm-row"
                  style={{ cursor: 'default' }}
                  onContextMenu={(e) => {
                    e.preventDefault?.()
                    e.stopPropagation?.()
                    setProjMenu({
                      id: p.id,
                      x: (e as { clientX?: number }).clientX ?? 0,
                      y: (e as { clientY?: number }).clientY ?? 0
                    })
                  }}
                >
                  <button
                    className="gm-row"
                    style={{ width: 'auto', flex: 1, padding: 0, background: 'transparent' }}
                    onClick={() => {
                      if (renamingId === p.id) return
                      setExpanded((prev) => ({ ...prev, [p.id]: !open }))
                      if (!repos) void scanProject(p)
                    }}
                  >
                    <IconFolder open={!!open} />
                    {renamingId === p.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          const key = (e as { key?: string }).key
                          if (key === 'Enter') commitRename()
                          if (key === 'Escape') setRenamingId(null)
                        }}
                        onClick={(e) => e.stopPropagation?.()}
                        style={{
                          width: '100%',
                          padding: '2px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--accent)',
                          background: 'var(--bg)'
                        }}
                      />
                    ) : (
                      <>
                        <span style={{ fontWeight: 560 }}>{p.name}</span>
                        {p.pinned && <span title="已置顶" style={{ opacity: 0.7 }}>📌</span>}
                        <span className="muted" title={p.path}>
                          {p.path.length > 28 ? `…${p.path.slice(-28)}` : p.path}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {open && (
                  <div style={{ paddingLeft: 14 }}>
                    {!repos && <div style={{ padding: '6px 8px', color: 'var(--fg-secondary)' }}>扫描中…</div>}
                    {repos?.length === 0 && (
                      <div style={{ padding: '6px 8px', color: 'var(--fg-secondary)' }}>未发现 Git 仓库</div>
                    )}
                    {repos?.map((r) => (
                      <button
                        key={r.path}
                        className={cx('gm-row', activeRepo?.path === r.path && 'active')}
                        onClick={() => void openRepo(p, r.path)}
                        title={r.path}
                      >
                        <span className="gm-chevron">·</span>
                        <span>{r.name}</span>
                        {r.branch && <span className="gm-repo-branch">{r.branch}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {projects.length === 0 && (
            <div style={{ padding: 12, color: 'var(--fg-secondary)' }}>
              选择目录以扫描 Git 仓库；配置写入 .devDash/。右键项目可重命名/置顶/移除。
            </div>
          )}
        </div>
        <div className="gm-side-footer">
          <button
            className="gm-row gm-side-footer-btn"
            title="全局设置"
            aria-label="全局设置"
            onClick={() => setGlobalSettingsOpen(true)}
          >
            <IconGear />
            <span>全局设置</span>
          </button>
        </div>
      </aside>

      <Splitter
        onDelta={(dx) => setSideWidth((w) => Math.min(420, Math.max(180, w + dx)))}
      />

      <section className="gm-main">
        {globalSettingsOpen ? (
          <GlobalSettingsPanel
            onClose={() => setGlobalSettingsOpen(false)}
            onToast={showToast}
          />
        ) : activeRepo ? (
          <RepoWorkspace
            key={activeRepo.path}
            repo={activeRepo}
            project={activeProject}
            onChanged={(info) => setActiveRepo(info)}
            onToast={showToast}
          />
        ) : (
          <div className="gm-empty">
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Git 管理</div>
              <div>添加项目并选择仓库后，可查看分支、变更、历史与 MR。</div>
            </div>
          </div>
        )}
      </section>

      {projMenu && (
        <>
          <div
            className="gm-menu-backdrop"
            onClick={() => setProjMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault?.()
              setProjMenu(null)
            }}
          />
          <div
            className="gm-dropdown gm-context-menu"
            style={{ left: projMenu.x, top: projMenu.y, minWidth: 180 }}
          >
            <MenuItem icon={<IconMenuRename />} onClick={() => startRename(projMenu.id)}>
              重命名
            </MenuItem>
            <MenuItem icon={<IconMenuPin />} onClick={() => pinProject(projMenu.id)}>
              置顶
            </MenuItem>
            <MenuItem
              icon={<IconMenuFolder />}
              onClick={() => {
                const p = projects.find((x) => x.id === projMenu.id)
                if (p) void api.openPath(p.path).catch((e: Error) => showToast(e.message, true))
                setProjMenu(null)
              }}
            >
              在文件管理器中打开
            </MenuItem>
            <MenuItem
              icon={<IconMenuTrash />}
              danger
              onClick={() => {
                removeProject(projMenu.id)
                setProjMenu(null)
              }}
            >
              移除
            </MenuItem>
          </div>
        </>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  )
}

function MembersError({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null
  return (
    <div className="gm-settings-error">
      {message}
      <div className="gm-settings-hint">
        请检查 GitLab 项目标识（链接 / projectId / group/repo）与 token 权限（read_api 或 api）。
      </div>
    </div>
  )
}

/** Global (plugin-wide) open policy + GitLab default config. */
const GLOBAL_SETTINGS_SECTIONS = [
  { id: 'open-policy', title: '打开策略', subtitle: '文件白名单与大小上限' },
  { id: 'gitlab-connection', title: 'GitLab 连接', subtitle: 'baseUrl / token / 项目' },
  { id: 'gitlab-people', title: '默认指派', subtitle: 'Assignee / Reviewer' }
] as const

function GlobalSettingsPanel({
  onClose,
  onToast
}: {
  onClose: () => void
  onToast: (t: string, e?: boolean) => void
}): JSX.Element {
  const [whitelist, setWhitelist] = useState<string[]>([])
  const [defaults, setDefaults] = useState<string[]>([])
  const [maxMb, setMaxMb] = useState(10)
  const [draftExt, setDraftExt] = useState('')
  const [activeSection, setActiveSection] = useState<string>(GLOBAL_SETTINGS_SECTIONS[0].id)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [gl, setGl] = useState<GitLabDefaults>({
    baseUrl: '',
    token: '',
    projectPath: '',
    assignees: [],
    reviewers: [],
    assigneeNames: [],
    reviewerNames: []
  })
  const [members, setMembers] = useState<GitLabMember[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const [glSaved, setGlSaved] = useState(false)

  /** Persist whitelist immediately so add/remove never depends on the 保存 button. */
  const persistWhitelist = async (next: string[], max = maxMb) => {
    const sorted = [...new Set(next.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    )
    setWhitelist(sorted)
    try {
      await api.settingsSave({ textWhitelist: sorted, maxFileSizeMb: Math.max(1, Math.min(200, max)) })
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const addWhitelistEntry = () => {
    const v = draftExt.trim().replace(/^\./, '').toLowerCase()
    if (!v) return
    if (whitelist.includes(v)) {
      onToast(`「${v}」已在名单中`)
      setDraftExt('')
      return
    }
    void persistWhitelist([...whitelist, v])
    setDraftExt('')
  }

  const loadMembers = async (s: GitLabSettings) => {
    if (s.baseUrl && s.token && s.projectPath) {
      try {
        setMembers(await api.gitlabMembers(s))
        setMembersError(null)
        return
      } catch (e) {
        setMembers([])
        setMembersError((e as Error).message)
        return
      }
    }
    setMembers([])
    setMembersError(null)
  }

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.settingsGet()
        setWhitelist(s.textWhitelist)
        setDefaults(s.defaultWhitelist)
        setMaxMb(s.maxFileSizeMb)
        const d = await api.gitlabDefaults()
        setGl(d)
        await loadMembers({
          baseUrl: d.baseUrl,
          token: d.token,
          projectPath: d.projectPath,
          assignees: d.assignees,
          reviewers: d.reviewers,
          assigneeNames: d.assigneeNames,
          reviewerNames: d.reviewerNames,
          overrides: []
        })
      } catch (e) {
        onToast((e as Error).message, true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track which section is in view for the left index.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const id = visible[0]?.target.getAttribute('data-section')
        if (id) setActiveSection(id)
      },
      { root, rootMargin: '-20% 0px -55% 0px', threshold: [0.15, 0.4, 0.75] }
    )
    for (const el of Object.values(sectionRefs.current)) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id]
    const root = scrollRef.current
    if (!el || !root) return
    setActiveSection(id)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = el.offsetTop - 12
    root.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
  }

  const save = async () => {
    try {
      await api.settingsSave({
        textWhitelist: whitelist,
        maxFileSizeMb: Math.max(1, Math.min(200, maxMb))
      })
      onToast('文件策略已保存')
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const saveGitlab = async () => {
    try {
      const next = await api.saveGitlabDefaults({
        ...gl,
        assigneeNames: members.filter((m) => gl.assignees.includes(m.id)).map((m) => m.username),
        reviewerNames: members.filter((m) => gl.reviewers.includes(m.id)).map((m) => m.username)
      })
      setGl(next)
      await loadMembers({
        baseUrl: next.baseUrl,
        token: next.token,
        projectPath: next.projectPath,
        assignees: next.assignees,
        reviewers: next.reviewers,
        assigneeNames: next.assigneeNames,
        reviewerNames: next.reviewerNames,
        overrides: []
      })
      setGlSaved(true)
      window.setTimeout(() => setGlSaved(false), 2000)
      onToast('GitLab 默认已保存')
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  return (
    <div className="gm-settings-layout">
      <nav className="gm-settings-nav" aria-label="全局设置分区">
        <div className="gm-settings-nav-head">
          <div className="gm-settings-nav-title">全局设置</div>
          <div className="gm-settings-nav-sub">按功能分区 · 右侧可滚动</div>
        </div>
        <div className="gm-settings-nav-list">
          {GLOBAL_SETTINGS_SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={cx('gm-settings-nav-item', activeSection === s.id && 'active')}
              onClick={() => scrollToSection(s.id)}
            >
              <span className="gm-settings-nav-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="gm-settings-nav-text">
                <span className="gm-settings-nav-label">{s.title}</span>
                <span className="gm-settings-nav-desc">{s.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      <div className="gm-settings-scroll" ref={scrollRef}>
        <header className="gm-settings-top">
          <div>
            <h2>全局设置</h2>
            <p className="gm-settings-desc">对所有仓库生效。分区保存，互不影响。</p>
          </div>
          <button className="gm-btn ghost icon" title="关闭" aria-label="关闭" onClick={onClose}>
            <IconClose />
          </button>
        </header>

        <section
          id="open-policy"
          data-section="open-policy"
          ref={(el) => {
            sectionRefs.current['open-policy'] = el
          }}
          className="gm-settings-card"
        >
          <div className="gm-settings-card-head">
            <div>
              <h2>打开策略</h2>
              <p className="gm-settings-desc">文本直接打开白名单与大小上限。</p>
            </div>
            <button className="gm-btn primary" onClick={() => void save()}>
              保存
            </button>
          </div>

          <div className="gm-field">
            <label>文本直接打开白名单（扩展名 / 文件名）</label>
            <div className="gm-chips" style={{ marginBottom: 8 }}>
              {[...whitelist]
                .sort((a, b) => a.localeCompare(b))
                .map((e) => (
                <button
                  key={e}
                  type="button"
                  className="gm-chip on"
                  title="点击移除"
                  onClick={() => void persistWhitelist(whitelist.filter((x) => x !== e))}
                >
                  {e} ×
                </button>
              ))}
            </div>
            <div className="gm-settings-row">
              <input
                value={draftExt}
                placeholder="添加扩展名，如 jsonc"
                onChange={(e) => setDraftExt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e as { key?: string }).key === 'Enter') {
                    addWhitelistEntry()
                  }
                }}
              />
              <button className="gm-btn" type="button" onClick={addWhitelistEntry}>
                添加
              </button>
            </div>
            <div className="gm-settings-hint">添加 / 移除后立即生效并保存，无需再点「保存」。</div>
          </div>

          <div className="gm-field">
            <label>预置</label>
            <div className="gm-chips">
              <button type="button" className="gm-chip" onClick={() => void persistWhitelist([...defaults])}>
                重置为预置
              </button>
              <button
                type="button"
                className="gm-chip"
                onClick={() => void persistWhitelist([...whitelist, ...defaults])}
              >
                合并预置
              </button>
            </div>
          </div>

          <div className="gm-field">
            <label>最大直接打开文件大小（MB）</label>
            <input
              type="number"
              min={1}
              max={200}
              value={maxMb}
              onChange={(e) => setMaxMb(Number(e.target.value) || 10)}
            />
            <div className="gm-settings-hint">
              超过此大小会提示确认，可强制以文本打开。默认 10 MB，硬上限 200 MB。
            </div>
          </div>
        </section>

        <section
          id="gitlab-connection"
          data-section="gitlab-connection"
          ref={(el) => {
            sectionRefs.current['gitlab-connection'] = el
          }}
          className="gm-settings-card"
        >
          <div className="gm-settings-card-head">
            <div>
              <h2>GitLab 连接</h2>
              <p className="gm-settings-desc">
                作为所有仓库的默认配置。仓库「设置」未填写时自动引用这里。
              </p>
            </div>
            <button className="gm-btn primary" onClick={() => void saveGitlab()}>
              保存
            </button>
          </div>

          <div className="gm-settings-grid">
            <div className="gm-field">
              <label>baseUrl</label>
              <input
                value={gl.baseUrl}
                onChange={(e) => setGl((s) => ({ ...s, baseUrl: e.target.value }))}
                placeholder="https://gitlab.com"
              />
            </div>
            <div className="gm-field">
              <label>token</label>
              <input
                type="password"
                value={gl.token}
                onChange={(e) => setGl((s) => ({ ...s, token: e.target.value }))}
                placeholder="personal access token"
              />
            </div>
            <div className="gm-field gm-settings-span">
              <label>GitLab 项目（默认 / 拉取成员）</label>
              <input
                value={gl.projectPath}
                onChange={(e) => setGl((s) => ({ ...s, projectPath: e.target.value }))}
                placeholder="粘贴仓库链接 / 数字 projectId / group/repo"
              />
              <div className="gm-settings-hint">
                支持粘贴仓库链接、数字 projectId 或 group/repo；保存时自动识别。仓库未配置时回落到此值，并用于拉取成员列表。
              </div>
            </div>
          </div>
        </section>

        <section
          id="gitlab-people"
          data-section="gitlab-people"
          ref={(el) => {
            sectionRefs.current['gitlab-people'] = el
          }}
          className="gm-settings-card"
        >
          <div className="gm-settings-card-head">
            <div>
              <h2>默认指派</h2>
              <p className="gm-settings-desc">创建 MR 时的默认 Assignee / Reviewer。</p>
            </div>
            <button className="gm-btn primary" onClick={() => void saveGitlab()}>
              保存
            </button>
          </div>

          <div className="gm-field">
            <label>Assignee（默认）</label>
            <div className="gm-chips">
              <MembersError message={membersError} />
              {!membersError && members.length === 0 && (
                <span className="gm-settings-hint">配置连接与 GitLab 项目后可选择成员</span>
              )}
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cx('gm-chip', gl.assignees.includes(m.id) && 'on')}
                  onClick={() =>
                    setGl((s) => ({
                      ...s,
                      assignees: s.assignees.includes(m.id)
                        ? s.assignees.filter((x) => x !== m.id)
                        : [...s.assignees, m.id]
                    }))
                  }
                >
                  {m.name || m.username}
                </button>
              ))}
            </div>
          </div>

          <div className="gm-field">
            <label>Reviewer（默认）</label>
            <div className="gm-chips">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cx('gm-chip', gl.reviewers.includes(m.id) && 'on')}
                  onClick={() =>
                    setGl((s) => ({
                      ...s,
                      reviewers: s.reviewers.includes(m.id)
                        ? s.reviewers.filter((x) => x !== m.id)
                        : [...s.reviewers, m.id]
                    }))
                  }
                >
                  {m.name || m.username}
                </button>
              ))}
            </div>
          </div>

          {glSaved && <div className="gm-settings-ok">已保存</div>}
        </section>
      </div>
    </div>
  )
}

type RepoUiState = {
  treeExpanded?: Record<string, boolean>
  sizes?: UiSizes
  selectedFile?: string | null
  selectedCommit?: string | null
}

function RepoWorkspace({
  repo,
  project,
  onChanged,
  onToast
}: {
  repo: RepoInfo
  project: ProjectRecord | null
  onChanged: (info: RepoInfo) => void
  onToast: (text: string, error?: boolean) => void
}): JSX.Element {
  const [view, setView] = useState<'files' | 'history' | 'settings'>('files')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchOpen, setBranchOpen] = useState(false)
  const [status, setStatus] = useState<StatusEntry[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({})
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [opened, setOpened] = useState<OpenedFile | null>(null)
  const [commitMode, setCommitMode] = useState(false)
  const [commitChecked, setCommitChecked] = useState<Set<string>>(new Set())
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const [unpushedCount, setUnpushedCount] = useState(0)
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null)
  const [commitFiles, setCommitFiles] = useState<DiffFileInfo[]>([])
  const [commitTreeExpanded, setCommitTreeExpanded] = useState<Record<string, boolean>>({})
  const [mrOpen, setMrOpen] = useState(false)
  const [sizes, setSizes] = useState<UiSizes>(DEFAULT_SIZES)
  const [hydrated, setHydrated] = useState(false)
  const [ready, setReady] = useState(false)

  const statusByPath = useMemo(() => {
    const map = new Map<string, StatusEntry['status']>()
    for (const s of status) map.set(s.path, s.status)

    // Only mark a directory ignored when it is itself ignored, or every child file is ignored.
    const isIgnored = (p: string) => map.get(p) === 'ignored'
    const dirToFiles = new Map<string, string[]>()
    for (const f of files) {
      const parts = f.split('/')
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/')
        const list = dirToFiles.get(dir)
        if (list) list.push(f)
        else dirToFiles.set(dir, [f])
      }
    }
    for (const [dir, list] of dirToFiles) {
      if (isIgnored(dir)) {
        for (const f of list) map.set(f, 'ignored')
        continue
      }
      if (list.length > 0 && list.every((f) => isIgnored(f))) {
        map.set(dir, 'ignored')
      }
    }
    // Propagate ignored from ignored dirs down
    for (const f of files) {
      const parts = f.split('/')
      for (let i = 0; i < parts.length - 1; i++) {
        const prefix = parts.slice(0, i + 1).join('/')
        if (map.get(prefix) === 'ignored') {
          map.set(f, 'ignored')
          break
        }
      }
    }
    return map
  }, [status, files])

  // Hydrate UI state from project .devDash
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!project?.path) {
        setHydrated(true)
        return
      }
      try {
        const state = (await api.storeRead(project.path)) as Record<string, unknown>
        const key = `repo:${repo.path}`
        const saved = (state[key] ?? {}) as RepoUiState
        if (cancelled) return
        // view is intentionally not persisted — always enter the files tab.
        if (saved.treeExpanded) setTreeExpanded(saved.treeExpanded)
        if (saved.sizes) setSizes({ ...DEFAULT_SIZES, ...saved.sizes })
        if (saved.selectedFile) {
          setSelectedFile(saved.selectedFile)
          void openFile(saved.selectedFile, true)
        }
        if (saved.selectedCommit) setSelectedCommit({ hash: saved.selectedCommit, shortHash: saved.selectedCommit.slice(0, 7), subject: '', authorName: '', authorEmail: '', date: '' })
      } catch {
        /* first run */
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [project?.path, repo.path])

  // Persist UI state (debounced)
  const persistRef = useRef(0)
  useEffect(() => {
    if (!hydrated || !project?.path) return
    window.clearTimeout(persistRef.current)
    persistRef.current = window.setTimeout(() => {
      const payload: RepoUiState = {
        treeExpanded,
        sizes,
        selectedFile,
        selectedCommit: selectedCommit?.hash
      }
      void api.storePatch(project.path, { [`repo:${repo.path}`]: payload }).catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(persistRef.current)
  }, [hydrated, project?.path, repo.path, treeExpanded, sizes, selectedFile, selectedCommit])

  const refreshBranches = async () => {
    try {
      setBranches(await api.branches(repo.path))
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const refreshStatus = async () => {
    try {
      const list = await api.tasks(`status-${repo.path}`, '刷新状态', () => api.status(repo.path))
      setStatus(list)
      setFiles(await api.listFiles(repo.path))
      onChanged(await api.repoInfo(repo.path))
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const refreshLog = async () => {
    try {
      setCommits(await api.log(repo.path, 50, 0))
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const refreshUnpushed = async () => {
    try {
      const list = await api.unpushed(repo.path)
      setUnpushedCount(list.length)
    } catch {
      setUnpushedCount(0)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([refreshBranches(), refreshStatus(), refreshLog(), refreshUnpushed()])
      } finally {
        setReady(true)
      }
    })()
  }, [repo.path])

  const loadPatch = async (filePath: string, force = false): Promise<string> => {
    const abs = repo.path.replace(/\\/g, '/') + '/' + filePath
    // Always unified compare: worktree/HEAD or commit range patch
    void abs
    void force
    try {
      return await api.diffFilePatch(repo.path, filePath)
    } catch (e) {
      throw e as Error
    }
  }

  const openFromCommit = (file: DiffFileInfo) => {
    setSelectedFile(file.path)
    setOpened({
      path: file.path,
      label: file.path.split('/').pop() ?? file.path,
      status: mapDiffStatus(file),
      patch: file.patch || ''
    })
    if (!file.patch) {
      void api
        .diffFilePatch(
          repo.path,
          file.path,
          selectedCommit ? `${selectedCommit.hash}^..${selectedCommit.hash}` : undefined
        )
        .then((patch) => {
          setOpened((prev) =>
            prev && prev.path === file.path ? { ...prev, patch } : prev
          )
        })
        .catch((e) => onToast((e as Error).message, true))
    }
  }

  const openFile = async (filePath: string, silent = false, force = false) => {
    setSelectedFile(filePath)
    try {
      const openedFile = await api.tasks(`open-${filePath}`, `打开 ${filePath.split('/').pop()}`, async () => {
        const abs = repo.path.replace(/\\/g, '/') + '/' + filePath
        const st = statusByPath.get(filePath)
        const probe = await api.probeFile(abs)
        if (!probe.exists) {
          return {
            path: filePath,
            label: filePath.split('/').pop() ?? filePath,
            status: st,
            patch: '',
            block: { kind: 'error' as const, message: '文件不存在或不可读' }
          }
        }
        if (!force) {
          if (probe.binary) {
            return {
              path: filePath,
              label: filePath.split('/').pop() ?? filePath,
              status: st,
              patch: '',
              block: {
                kind: 'binary' as const,
                size: probe.size,
                message: '检测到二进制内容',
                ext: probe.ext
              }
            }
          }
          if (!probe.whitelisted) {
            return {
              path: filePath,
              label: filePath.split('/').pop() ?? filePath,
              status: st,
              patch: '',
              block: {
                kind: 'whitelist' as const,
                size: probe.size,
                ext: probe.ext,
                message: '不在文本打开白名单中'
              }
            }
          }
          if (probe.tooLarge) {
            return {
              path: filePath,
              label: filePath.split('/').pop() ?? filePath,
              status: st,
              patch: '',
              block: {
                kind: 'size' as const,
                size: probe.size,
                message: `超过 ${probe.maxFileSizeMb} MB 限制`,
                ext: probe.ext
              }
            }
          }
        }
        const patch = await loadPatch(filePath)
        return {
          path: filePath,
          label: filePath.split('/').pop() ?? filePath,
          status: st,
          patch
        }
      })
      setOpened(openedFile)
    } catch (e) {
      if (!silent) onToast((e as Error).message, true)
      setOpened({
        path: filePath,
        label: filePath.split('/').pop() ?? filePath,
        patch: '',
        block: { kind: 'error', message: (e as Error).message }
      })
    }
  }

  const forceOpen = async (addToWhitelist: boolean) => {
    if (!opened) return
    const filePath = opened.path
    if (addToWhitelist) {
      // Prefer extension; for dotfiles use full basename (gitignore / .gitignore)
      const base = filePath.split('/').pop() ?? filePath
      const ext = base.includes('.') && !base.startsWith('.') ? (base.split('.').pop() || '') : base.replace(/^\./, '')
      if (ext) {
        try {
          await api.settingsAddExt(ext)
          onToast(`已加入白名单：${ext.toLowerCase()}`)
        } catch (e) {
          onToast(`加入白名单失败：${(e as Error).message}`, true)
        }
      }
    }
    await api.tasks(`force-${filePath}`, `强制打开 ${opened.label}`, () =>
      openFile(filePath, false, true)
    )
  }



  const openCommit = async (commit: CommitInfo) => {
    setSelectedCommit(commit)
    try {
      const files = await api.tasks(`commit-${commit.hash}`, `加载提交变更 ${commit.shortHash}`, () =>
        api.commitFiles(repo.path, commit.hash)
      )
      setCommitFiles(files)
    } catch (e) {
      setCommitFiles([])
      onToast((e as Error).message, true)
    }
  }

  const switchBranch = async (name: string) => {
    try {
      await api.tasks(`checkout-${name}`, `切换分支 ${name}`, () => api.checkout(repo.path, name))
      setBranchOpen(false)
      await refreshBranches()
      await refreshStatus()
      onToast(`已切换到 ${name}`)
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const commitableFiles = useMemo(() => {
    return files.filter((f) => {
      const st = statusByPath.get(f)
      return st && st !== 'clean' && st !== 'ignored'
    })
  }, [files, statusByPath])

  const allChecked =
    commitableFiles.length > 0 && commitableFiles.every((f) => commitChecked.has(f))

  const toggleCommit = (path: string) => {
    setCommitChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleAllCommit = () => {
    setCommitChecked(allChecked ? new Set() : new Set(commitableFiles))
  }

  const runCommit = async (opts?: { thenPush?: boolean }): Promise<boolean> => {
    const paths = commitableFiles.filter((f) => commitChecked.has(f))
    if (!commitMsg.trim()) {
      onToast('请输入 commit message', true)
      return false
    }
    if (paths.length === 0) {
      onToast('请勾选要提交的文件', true)
      return false
    }
    setCommitting(true)
    try {
      await api.tasks('commit', '提交变更', () => api.commit(repo.path, commitMsg.trim(), paths))
      onToast('提交成功')
      setCommitMsg('')
      setCommitChecked(new Set())
      setCommitMode(false)
      await refreshStatus()
      await refreshLog()
      await refreshUnpushed()
      if (opts?.thenPush) setPushOpen(true)
      return true
    } catch (e) {
      onToast((e as Error).message, true)
      return false
    } finally {
      setCommitting(false)
    }
  }

  return (
    <>
      {!ready && (
        <div className="gm-repo-loading" aria-live="polite">
          <div className="gm-repo-loading-card">加载中…</div>
        </div>
      )}
      <header className="gm-titlebar">
        <div className="gm-title">{repo.name}</div>
        <div className="gm-rel">
          <button className="gm-btn icon" title={repo.branch || 'detached'} onClick={() => setBranchOpen((v) => !v)}>
            <IconBranch />
            <span>{repo.branch || 'HEAD'}</span>
            <span style={{ opacity: 0.5, fontSize: 10 }}>▾</span>
          </button>
          {branchOpen && (
            <div className="gm-dropdown">
              {branches.map((b) => (
                <button
                  key={b.name}
                  className={cx(b.name === repo.branch && 'active')}
                  onClick={() => void switchBranch(b.name)}
                >
                  {b.current ? '✓ ' : ''}
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="gm-seg">
          <button className={cx(view === 'files' && 'active')} onClick={() => setView('files')}>
            文件
          </button>
          <button className={cx(view === 'history' && 'active')} onClick={() => setView('history')}>
            历史
          </button>
          <button className={cx(view === 'settings' && 'active')} onClick={() => setView('settings')}>
            设置
          </button>
        </div>
        <div className="gm-spacer" />
        <button
          className="gm-btn icon primary"
          title="一键 MR"
          aria-label="一键 MR"
          onClick={() => setMrOpen(true)}
        >
          <IconMr />
        </button>
      </header>

      {view === 'settings' ? (
        <ToolSettingsPage repoPath={repo.path} onToast={onToast} />
      ) : (
      <div
        className="gm-body"
        style={{ gridTemplateColumns: `${sizes.leftWidth}px 5px minmax(0, 1fr)` }}
      >
        <div className="gm-panel">
          {view === 'files' ? (
            <>
              <div className="gm-panel-header gm-panel-header-row">
                <span>文件目录</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="gm-btn icon"
                    title="拉取 Pull"
                    aria-label="Pull"
                    onClick={() => {
                      void api
                        .tasks('pull', 'git pull', () => api.pull(repo.path))
                        .then(() => {
                          onToast('拉取成功')
                          return Promise.all([refreshStatus(), refreshBranches(), refreshLog(), refreshUnpushed()])
                        })
                        .catch((e: Error) => onToast(e.message, true))
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                      <path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 3h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className={cx('gm-btn icon', unpushedCount > 0 && 'primary')}
                    title={unpushedCount > 0 ? `推送 Push · ${unpushedCount} 条未推送` : '推送 Push'}
                    aria-label="Push"
                    onClick={() => setPushOpen(true)}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                      <path d="M8 12V3M4.5 6.5L8 3l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {unpushedCount > 0 && <span className="gm-badge">{unpushedCount}</span>}
                  </button>
                  <button
                    className={cx('gm-btn icon', commitMode && 'primary')}
                    title="提交模式"
                    aria-label="Commit"
                    onClick={() => {
                      setCommitMode((v) => !v)
                      if (!commitMode) {
                        // default-check all changeable files
                        setCommitChecked(
                          new Set(
                            files.filter((f) => {
                              const st = statusByPath.get(f)
                              return st && st !== 'clean' && st !== 'ignored'
                            })
                          )
                        )
                      } else {
                        setCommitChecked(new Set())
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
                      <path d="M8 2v3.2M8 10.8V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className="gm-btn icon"
                    title="刷新 Git 状态"
                    aria-label="刷新"
                    onClick={() => {
                      void refreshStatus()
                      void refreshBranches()
                      void refreshLog()
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                      <path
                        d="M13 8a5 5 0 1 1-1.5-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path d="M13 2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              {commitMode ? (
                <div className="gm-commit-panel">
                  <label className="gm-commit-all">
                    <input type="checkbox" checked={allChecked} onChange={toggleAllCommit} />
                    <span>全选</span>
                    <span className="muted">
                      {commitChecked.size}/{commitableFiles.length}
                    </span>
                  </label>
                  <div className="gm-scroll">
                    {commitableFiles.length === 0 && (
                      <div className="gm-empty">无变更文件</div>
                    )}
                    {commitableFiles.map((f) => {
                      const st = statusByPath.get(f)
                      const name = f.split('/').pop() ?? f
                      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''
                      return (
                        <label key={f} className="gm-commit-row" title={f}>
                          <input
                            type="checkbox"
                            checked={commitChecked.has(f)}
                            onChange={() => toggleCommit(f)}
                          />
                          <span className={cx('gm-file-name', st ? statusClass(st) : '')}>{name}</span>
                          {dir && <span className="gm-commit-dir">{dir}</span>}
                        </label>
                      )
                    })}
                  </div>
                  <div className="gm-commit-form">
                    <textarea
                      placeholder="commit message"
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      rows={5}
                    />
                    <div className="gm-commit-actions">
                      <button
                        className="gm-btn primary"
                        disabled={committing || !commitMsg.trim() || commitChecked.size === 0}
                        onClick={() => void runCommit()}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                          <path d="M3 8.5l3.5 3.5L13 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>commit</span>
                      </button>
                      <button
                        className="gm-btn"
                        disabled={committing || !commitMsg.trim() || commitChecked.size === 0}
                        onClick={() => void runCommit({ thenPush: true })}
                        title="commit 后打开 push"
                      >
                        <span>commit and push</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="gm-scroll">
                  <FileTree
                    files={files}
                    statusByPath={statusByPath}
                    selected={selectedFile}
                    expanded={treeExpanded}
                    onToggleDir={(dir) =>
                      setTreeExpanded((prev) => ({ ...prev, [dir]: !(prev[dir] ?? false) }))
                    }
                    onSelect={(p) => void openFile(p)}
                    onAdd={(p) => {
                      void api
                        .addPaths(repo.path, [p])
                        .then(() => {
                          onToast(`已 add ${p}`)
                          return refreshStatus()
                        })
                        .catch((e: Error) => onToast(e.message, true))
                    }}
                    onIgnore={(p) => {
                      void (async () => {
                        try {
                          await api.ignorePaths(repo.path, [p])
                          onToast(`已忽略 ${p}`)
                        } catch (e) {
                          onToast((e as Error).message, true)
                        } finally {
                          await refreshStatus()
                        }
                      })()
                    }}
                    onRevert={(p) => {
                      if (!window.confirm(`回滚将丢弃「${p}」的未提交更改（含已 add 未 commit、未跟踪文件），不可恢复。继续？`)) {
                        return
                      }
                      void (async () => {
                        try {
                          await api.tasks(`revert-${p}`, `回滚 ${p}`, () => api.revertPaths(repo.path, [p]))
                          onToast(`已回滚 ${p}`)
                          if (selectedFile === p || selectedFile?.startsWith(`${p}/`)) {
                            setSelectedFile(null)
                          }
                        } catch (e) {
                          onToast((e as Error).message, true)
                        } finally {
                          await refreshStatus()
                        }
                      })()
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="gm-panel-header">提交历史</div>
              <div className="gm-scroll" style={{ maxHeight: sizes.historyHeight }}>
                {commits.map((c) => (
                  <button
                    key={c.hash}
                    className={cx('gm-commit', selectedCommit?.hash === c.hash && 'active')}
                    onClick={() => void openCommit(c)}
                    title="单击选中并加载变更文件"
                  >
                    <div className="subject">{c.subject}</div>
                    <div className="meta">
                      {c.shortHash} · {c.authorName} · {formatTime(c.date)}
                    </div>
                  </button>
                ))}
                {commits.length === 0 && <div className="gm-empty">暂无提交</div>}
              </div>
              <Splitter vertical onDelta={(_dx, dy) => setSizes((s) => ({
                ...s,
                historyHeight: Math.min(480, Math.max(120, s.historyHeight + dy))
              }))} />
              <div className="gm-panel-header">
                变更文件{selectedCommit ? ` · ${selectedCommit.shortHash}` : ''}
              </div>
              <div className="gm-scroll">
                <FileTree
                  files={commitFiles.map((f) => f.path)}
                  statusByPath={new Map(commitFiles.map((f) => [f.path, mapDiffStatus(f)]))}
                  selected={selectedFile}
                  expanded={commitTreeExpanded}
                  onToggleDir={(dir) =>
                    setCommitTreeExpanded((prev) => ({ ...prev, [dir]: !(prev[dir] ?? false) }))
                  }
                  onSelect={(p) => {
                    const f = commitFiles.find((c) => c.path === p)
                    if (f) openFromCommit(f)
                  }}
                  showStatusLabel
                  defaultOpen
                />
              </div>
            </>
          )}
        </div>

        <Splitter
          onDelta={(dx) =>
            setSizes((s) => ({ ...s, leftWidth: Math.min(480, Math.max(180, s.leftWidth + dx)) }))
          }
        />

        <div className="gm-panel">
          <div className="gm-panel-header">
            {opened ? `变更比对 · ${opened.path}` : '文件变更'}
          </div>
          <div className="gm-scroll" style={{ height: '100%' }}>
            {opened?.block ? (
              <FileBlocked tab={opened} onForce={(add) => void forceOpen(add)} />
            ) : opened ? (
              <UnifiedDiff patch={opened.patch || ''} />
            ) : (
              <div className="gm-empty">
                {view === 'files'
                  ? '点击左侧文件查看变更比对'
                  : '单击提交加载变更文件，再点击文件查看'}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {mrOpen && (
        <MrPanel repo={repo} branches={branches} onClose={() => setMrOpen(false)} onToast={onToast} />
      )}
      {pushOpen && (
        <PushPanel
          repo={repo}
          defaultBranch={repo.branch || 'master'}
          onClose={() => setPushOpen(false)}
          onToast={onToast}
          onPushed={() => {
            void refreshStatus()
            void refreshLog()
            void refreshUnpushed()
          }}
        />
      )}
    </>
  )
}

function PushPanel({
  repo,
  defaultBranch,
  onClose,
  onToast,
  onPushed
}: {
  repo: RepoInfo
  defaultBranch: string
  onClose: () => void
  onToast: (t: string, e?: boolean) => void
  onPushed?: () => void
}): JSX.Element {
  const [branch, setBranch] = useState(defaultBranch)
  const [remote, setRemote] = useState('origin')
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [pushing, setPushing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        setCommits(await api.unpushed(repo.path))
      } catch {
        setCommits([])
      } finally {
        setLoading(false)
      }
    })()
  }, [repo.path])

  const doPush = async () => {
    if (!branch.trim()) {
      onToast('请填写目标分支', true)
      return
    }
    setPushing(true)
    try {
      await api.tasks('push', `push → ${branch}`, () =>
        api.push(repo.path, remote.trim() || 'origin', `HEAD:refs/heads/${branch.trim()}`)
      )
      onToast('推送成功')
      onPushed?.()
      onClose()
    } catch (e) {
      onToast((e as Error).message, true)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="gm-modal-backdrop" onClick={onClose}>
      <div className="gm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-modal-header">Push · {repo.name}</div>
        <div className="gm-modal-body">
          <div className="gm-field">
            <label>待推送 commit</label>
            <div className="gm-push-list">
              {loading && <div className="muted">加载中…</div>}
              {!loading && commits.length === 0 && (
                <div className="muted">没有待推送的提交（或无远程跟踪）</div>
              )}
              {commits.map((c) => (
                <div key={c.hash} className="gm-push-item">
                  <code>{c.shortHash}</code>
                  <span>{c.subject}</span>
                  <span className="muted">{c.authorName}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="gm-field">
            <label>Remote</label>
            <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="origin" />
          </div>
          <div className="gm-field">
            <label>目标分支</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="默认当前分支"
            />
          </div>
        </div>
        <div className="gm-modal-footer">
          <button className="gm-btn" onClick={onClose}>
            取消
          </button>
          <button className="gm-btn primary" disabled={pushing} onClick={() => void doPush()}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 12V3M4.5 6.5L8 3l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{pushing ? '推送中…' : 'Push'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FileBlocked({
  tab,
  onForce
}: {
  tab: OpenedFile
  onForce: (addToWhitelist: boolean) => void
}): JSX.Element {
  const [addWl, setAddWl] = useState(true)
  const block = tab.block!
  const canForce = block.kind === 'whitelist' || block.kind === 'size' || block.kind === 'binary'

  return (
    <div className="gm-empty" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {block.kind === 'whitelist' && '无法直接打开'}
          {block.kind === 'size' && '文件过大'}
          {block.kind === 'binary' && '二进制文件'}
          {block.kind === 'error' && '打开失败'}
        </div>
        <div style={{ color: 'var(--fg-secondary)', marginBottom: 12, wordBreak: 'break-all' }}>
          {tab.path}
        </div>
        {typeof block.size === 'number' && (
          <div style={{ marginBottom: 8, fontFamily: 'var(--font-mono, monospace)' }}>
            文件大小：{formatBytes(block.size)}
            {block.kind === 'size' ? `（${block.message}）` : ''}
          </div>
        )}
        {block.kind === 'whitelist' && (
          <div style={{ color: 'var(--fg-secondary)', marginBottom: 12 }}>
            {block.message}
            {block.ext ? `（.${block.ext}）` : ''}
          </div>
        )}
        {block.kind === 'error' && (
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{block.message}</div>
        )}
        {canForce && (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 14,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              <input type="checkbox" checked={addWl} onChange={(e) => setAddWl(e.target.checked)} />
              并加入白名单
            </label>
            <button className="gm-btn primary" title="以文本强制打开" onClick={() => onForce(addWl)}>
              <IconCompare />
              <span>强制打开</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ToolSettingsPage({
  repoPath,
  onToast
}: {
  repoPath: string
  onToast: (t: string, e?: boolean) => void
}): JSX.Element {
  const [saved, setSaved] = useState(false)
  const [defaults, setDefaults] = useState<GitLabDefaults>({
    baseUrl: '',
    token: '',
    projectPath: '',
    assignees: [],
    reviewers: [],
    assigneeNames: [],
    reviewerNames: []
  })
  const [cfg, setCfg] = useState<GitLabRepoConfig>({})
  const [resolved, setResolved] = useState<GitLabSettings | null>(null)
  const [members, setMembers] = useState<GitLabMember[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<number[]>([])
  const [reviewers, setReviewers] = useState<number[]>([])
  const [dirtyPeople, setDirtyPeople] = useState(false)

  const effective = resolved ?? {
    baseUrl: cfg.baseUrl || defaults.baseUrl,
    token: cfg.token || defaults.token,
    projectPath: cfg.projectPath || defaults.projectPath,
    assignees: [],
    reviewers: [],
    assigneeNames: [],
    reviewerNames: [],
    overrides: []
  }

  const loadMembers = async (s: GitLabSettings) => {
    if (s.baseUrl && s.token && s.projectPath) {
      try {
        setMembers(await api.gitlabMembers(s))
        setMembersError(null)
        return
      } catch (e) {
        setMembers([])
        setMembersError((e as Error).message)
        return
      }
    }
    setMembers([])
    setMembersError(null)
  }

  const detectFromRemote = async () => {
    try {
      const url = await api.remoteUrl(repoPath, 'origin')
      if (!url) {
        onToast('未找到 origin remote', true)
        return
      }
      const id = await api.normalizeProject(url)
      if (!id) {
        onToast(`无法从 remote 识别项目: ${url}`, true)
        return
      }
      setCfg((s) => ({ ...s, projectPath: id }))
      onToast(`已识别为 ${id}`)
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [d, c, r] = await Promise.all([
          api.gitlabDefaults(),
          api.gitlabRepoConfig(repoPath),
          api.gitlabSettings(repoPath)
        ])
        setDefaults(d)
        setCfg(c)
        setResolved(r)
        setAssignees(r.assignees)
        setReviewers(r.reviewers)
        setDirtyPeople(false)
        await loadMembers(r)
      } catch (e) {
        onToast((e as Error).message, true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath])

  const refreshResolved = async () => {
    const r = await api.gitlabSettings(repoPath)
    setResolved(r)
    return r
  }

  const save = async () => {
    try {
      const payload: GitLabRepoConfig = {
        projectPath: cfg.projectPath?.trim() || undefined,
        baseUrl: cfg.baseUrl?.trim() || undefined,
        token: cfg.token?.trim() || undefined
      }
      if (dirtyPeople) {
        if (assignees.length) {
          payload.assignees = assignees
          payload.assigneeNames = members
            .filter((m) => assignees.includes(m.id))
            .map((m) => m.username)
        }
        if (reviewers.length) {
          payload.reviewers = reviewers
          payload.reviewerNames = members
            .filter((m) => reviewers.includes(m.id))
            .map((m) => m.username)
        }
      } else {
        if (cfg.assignees?.length) {
          payload.assignees = cfg.assignees
          payload.assigneeNames = cfg.assigneeNames
        }
        if (cfg.reviewers?.length) {
          payload.reviewers = cfg.reviewers
          payload.reviewerNames = cfg.reviewerNames
        }
      }
      const next = await api.saveGitlabRepoConfig(repoPath, payload)
      setCfg(next)
      const r = await refreshResolved()
      setDirtyPeople(false)
      await loadMembers(r)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
      onToast('仓库 GitLab 配置已保存')
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const clearOverrides = async () => {
    try {
      const next = await api.saveGitlabRepoConfig(repoPath, {})
      setCfg(next)
      const r = await refreshResolved()
      setAssignees(r.assignees)
      setReviewers(r.reviewers)
      setDirtyPeople(false)
      await loadMembers(r)
      onToast('已清除仓库覆盖，改用全局默认')
    } catch (e) {
      onToast((e as Error).message, true)
    }
  }

  const hint = (value: string) => (value ? `全局默认：${value}` : '未配置全局默认')

  return (
    <div className="gm-settings-page">
      <div className="gm-settings-card">
        <h2>仓库 GitLab 配置</h2>
        <p className="gm-settings-desc">
          留空的字段会自动使用左下角「全局设置」中的默认值。项目路径按仓库填写；baseUrl / token / Assignee /
          Reviewer 仅在需要覆盖默认时填写。
        </p>

        <div className="gm-field">
          <label>GitLab 项目（本仓库）</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ flex: 1, minWidth: 0 }}
              value={cfg.projectPath ?? ''}
              onChange={(e) => setCfg((s) => ({ ...s, projectPath: e.target.value }))}
              placeholder={
                hint(defaults.projectPath) === '未配置全局默认'
                  ? '粘贴仓库链接 / 数字 projectId / group/repo'
                  : hint(defaults.projectPath)
              }
            />
            <button className="gm-btn" type="button" onClick={() => void detectFromRemote()}>
              从 git remote 识别
            </button>
          </div>
          <div className="gm-settings-hint">
            支持粘贴仓库链接、数字 projectId 或 group/repo；保存时自动识别。
          </div>
          {!cfg.projectPath?.trim() && defaults.projectPath && (
            <div style={{ color: 'var(--fg-secondary)', fontSize: 11, marginTop: 4 }}>
              当前使用全局默认项目：{defaults.projectPath}
            </div>
          )}
        </div>
        <div className="gm-field">
          <label>baseUrl（覆盖，可选）</label>
          <input
            value={cfg.baseUrl ?? ''}
            onChange={(e) => setCfg((s) => ({ ...s, baseUrl: e.target.value }))}
            placeholder={defaults.baseUrl || 'https://gitlab.com'}
          />
          {!cfg.baseUrl?.trim() && (
            <div style={{ color: 'var(--fg-secondary)', fontSize: 11, marginTop: 4 }}>
              使用全局默认：{defaults.baseUrl || '未配置'}
            </div>
          )}
        </div>
        <div className="gm-field">
          <label>token（覆盖，可选）</label>
          <input
            type="password"
            value={cfg.token ?? ''}
            onChange={(e) => setCfg((s) => ({ ...s, token: e.target.value }))}
            placeholder={defaults.token ? '••••••（全局默认）' : 'personal access token'}
          />
          {!cfg.token?.trim() && (
            <div style={{ color: 'var(--fg-secondary)', fontSize: 11, marginTop: 4 }}>
              使用全局默认 token{defaults.token ? '（已配置）' : '（未配置）'}
            </div>
          )}
        </div>
        <div className="gm-field">
          <label>
            Assignee
            {!cfg.assignees?.length && defaults.assignees.length > 0 && (
              <span style={{ color: 'var(--fg-secondary)', fontWeight: 400 }}>
                {' '}
                · 使用全局默认 {defaults.assignees.length} 人
              </span>
            )}
          </label>
          <div className="gm-chips">
            <MembersError message={membersError} />
            {!membersError && members.length === 0 && (
              <span style={{ color: 'var(--fg-secondary)', fontSize: 12 }}>
                {effective.baseUrl && effective.token && effective.projectPath
                  ? '无法拉取成员'
                  : '配置连接后可选择成员'}
              </span>
            )}
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cx('gm-chip', assignees.includes(m.id) && 'on')}
                onClick={() => {
                  setDirtyPeople(true)
                  setAssignees((prev) =>
                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                  )
                }}
              >
                {m.name || m.username}
              </button>
            ))}
          </div>
          {dirtyPeople && (
            <button
              type="button"
              className="gm-btn ghost"
              style={{ marginTop: 6, fontSize: 12 }}
              onClick={() => {
                setAssignees(defaults.assignees)
                setReviewers(defaults.reviewers)
                setDirtyPeople(false)
              }}
            >
              恢复全局默认人员
            </button>
          )}
        </div>
        <div className="gm-field">
          <label>
            Reviewer
            {!cfg.reviewers?.length && defaults.reviewers.length > 0 && (
              <span style={{ color: 'var(--fg-secondary)', fontWeight: 400 }}>
                {' '}
                · 使用全局默认 {defaults.reviewers.length} 人
              </span>
            )}
          </label>
          <div className="gm-chips">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cx('gm-chip', reviewers.includes(m.id) && 'on')}
                onClick={() => {
                  setDirtyPeople(true)
                  setReviewers((prev) =>
                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                  )
                }}
              >
                {m.name || m.username}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button className="gm-btn primary" onClick={() => void save()}>
            保存
          </button>
          <button className="gm-btn" onClick={() => void clearOverrides()}>
            清除覆盖
          </button>
          {saved && <span style={{ color: 'var(--success)', fontSize: 12 }}>OK</span>}
        </div>
        {resolved && resolved.overrides.length > 0 && (
          <div style={{ color: 'var(--fg-secondary)', fontSize: 11, marginTop: 8 }}>
            本仓库已覆盖：{resolved.overrides.join(' / ')}；其余字段使用全局默认。
          </div>
        )}
      </div>
    </div>
  )
}
function mapDiffStatus(f: DiffFileInfo): StatusEntry['status'] {
  if (f.patch.includes('new file')) return 'added'
  if (f.patch.includes('deleted file')) return 'deleted'
  if (f.additions > 0 && f.deletions === 0 && !f.patch.includes('new file')) return 'added-dirty'
  return 'added-dirty'
}

function FileContent({ path: filePath, content }: { path: string; content: string }): JSX.Element {
  const lines = content.split('\n')
  return (
    <div className="gm-file-content">
      <div className="gm-path">{filePath}</div>
      {lines.map((line, i) => (
        <div key={i} className="gm-line">
          <span className="ln">{i + 1}</span>
          <span className="sign" />
          <span>{line}</span>
        </div>
      ))}
    </div>
  )
}

type TreeDir = {
  name: string
  path: string
  dirs: TreeDir[]
  files: string[]
}

/** Fold pure directory chains: src/main/java/org/sunyaxing → one row. */
function foldDirChain(d: TreeDir): TreeDir {
  let cur = d
  while (cur.dirs.length === 1 && cur.files.length === 0) {
    const child = cur.dirs[0]
    cur = {
      name: `${cur.name}/${child.name}`,
      path: child.path,
      dirs: child.dirs,
      files: child.files
    }
  }
  return {
    ...cur,
    dirs: cur.dirs.map(foldDirChain)
  }
}

function buildTree(filePaths: string[]): TreeDir {
  const root: TreeDir = { name: '', path: '', dirs: [], files: [] }
  for (const file of filePaths) {
    const parts = file.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      const rel = parts.slice(0, i + 1).join('/')
      let next = node.dirs.find((d) => d.name === name)
      if (!next) {
        next = { name, path: rel, dirs: [], files: [] }
        node.dirs.push(next)
      }
      node = next
    }
    node.files.push(file)
  }
  const sortNode = (n: TreeDir) => {
    n.dirs.sort((a, b) => a.name.localeCompare(b.name))
    n.files.sort((a, b) => a.localeCompare(b))
    n.dirs.forEach(sortNode)
  }
  sortNode(root)
  // Fold each top-level branch
  return {
    ...root,
    dirs: root.dirs.map(foldDirChain)
  }
}

function FileTree({
  files,
  statusByPath,
  selected,
  expanded,
  onToggleDir,
  onSelect,
  showStatusLabel,
  defaultOpen,
  onAdd,
  onIgnore,
  onRevert
}: {
  files: string[]
  statusByPath: Map<string, StatusEntry['status']>
  selected: string | null
  expanded: Record<string, boolean>
  onToggleDir: (dir: string) => void
  onSelect: (path: string) => void
  showStatusLabel?: boolean
  defaultOpen?: boolean
  onAdd?: (path: string) => void
  onIgnore?: (path: string) => void
  onRevert?: (path: string) => void
}): JSX.Element {
  const tree = useMemo(() => buildTree(files), [files])
  const [menu, setMenu] = useState<{ path: string; x: number; y: number; isDir: boolean } | null>(null)
  const canAdd = (st?: StatusEntry['status']) =>
    st === 'untracked' || st === 'not-added' || st === 'deleted'
  const dirHasAddable = (dir: TreeDir, dirSt?: StatusEntry['status']): boolean => {
    if (canAdd(dirSt)) return true
    const walk = (d: TreeDir): boolean => {
      if (d.files.some((f) => canAdd(statusByPath.get(f)))) return true
      return d.dirs.some(walk)
    }
    return walk(dir)
  }

  const renderDir = (dir: TreeDir, depth: number, isRoot = false): JSX.Element => {
    const open = isRoot ? true : (expanded[dir.path] ?? defaultOpen ?? false)
    const pad = 4 + depth * 14
    return (
      <div key={dir.path || '__root__'}>
        {dir.name ? (() => {
          const dirSt = statusByPath.get(dir.path)
          return (
            <button
              className={cx(
                'gm-file-row gm-dir-row',
                dirSt === 'ignored' && 'st-ignored'
              )}
              style={{ paddingLeft: pad }}
              onClick={() => onToggleDir(dir.path)}
              onContextMenu={(e) => {
                e.preventDefault?.()
                e.stopPropagation?.()
                setMenu({
                  path: dir.path,
                  x: (e as { clientX?: number }).clientX ?? 0,
                  y: (e as { clientY?: number }).clientY ?? 0,
                  isDir: true
                })
              }}
              title={dir.path}
            >
              <span className="gm-tree-gutter">
                <IconChevron open={open} />
              </span>
              <IconFolder open={open} />
              <span
                className={cx(
                  'gm-dir-name',
                  dirSt ? statusClass(dirSt) : ''
                )}
              >
                {dir.name}
              </span>
              {onAdd && dirHasAddable(dir, dirSt) && (
                <button
                  className="gm-row-add"
                  title="git add"
                  onClick={(e) => {
                    e.stopPropagation?.()
                    onAdd(dir.path)
                  }}
                >
                  <IconPlus />
                </button>
              )}
            </button>
          )
        })() : null}
        {open && (
          <>
            {dir.dirs.map((d) => renderDir(d, dir.name ? depth + 1 : 0, false))}
            {dir.files.map((f) => {
              const base = f.split('/').pop() ?? f
              const st = statusByPath.get(f)
              return (
                <button
                  key={f}
                  className={cx('gm-file-row', selected === f && 'active')}
                  style={{ paddingLeft: pad + (dir.name ? 14 : 0) }}
                  onClick={() => onSelect(f)}
                  onContextMenu={(e) => {
                    e.preventDefault?.()
                    e.stopPropagation?.()
                    setMenu({
                      path: f,
                      x: (e as { clientX?: number }).clientX ?? 0,
                      y: (e as { clientY?: number }).clientY ?? 0,
                      isDir: false
                    })
                  }}
                  title={f}
                >
                  <span className="gm-tree-gutter" aria-hidden>
                    {' '}
                  </span>
                  <IconFile />
                  <span className={cx('gm-file-name', st ? statusClass(st) : '')}>{base}</span>
                  {onAdd && canAdd(st) && (
                    <button
                      className="gm-row-add"
                      title="git add"
                      onClick={(e) => {
                        e.stopPropagation?.()
                        onAdd(f)
                      }}
                    >
                      <IconPlus />
                    </button>
                  )}
                  {showStatusLabel && st && st !== 'clean' && (
                    <span className="gm-file-st-label">{statusLabel(st)}</span>
                  )}
                </button>
              )
            })}
          </>
        )}
      </div>
    )
  }

  if (files.length === 0) return <div className="gm-empty">暂无文件</div>
  return (
    <div className="gm-file-tree">
      {renderDir(tree, 0, true)}
      {menu && (onIgnore || onRevert) && (
        <>
          <div
            className="gm-menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault?.()
              setMenu(null)
            }}
          />
          <div
            className="gm-dropdown gm-context-menu"
            style={{ left: menu.x, top: menu.y, minWidth: 120 }}
          >
            {onIgnore && (
              <MenuItem
                icon={<IconMenuIgnore />}
                onClick={() => {
                  onIgnore(menu.path)
                  setMenu(null)
                }}
              >
                忽略
              </MenuItem>
            )}
            {onRevert && (
              <MenuItem
                icon={<IconMenuRevert />}
                danger
                onClick={() => {
                  onRevert(menu.path)
                  setMenu(null)
                }}
              >
                回滚
              </MenuItem>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function statusLabel(s: StatusEntry['status']): string {
  switch (s) {
    case 'not-added':
    case 'untracked':
      return '未add'
    case 'added-dirty':
      return '已add·变更'
    case 'added':
      return '已add'
    case 'deleted':
      return '删除'
    case 'ignored':
      return '忽略'
    case 'renamed':
      return 'R'
    case 'conflict':
      return 'C'
    default:
      return ''
  }
}

/** Single-column unified diff (GitHub-style), hides VCS metadata headers. */
function UnifiedDiff({ patch }: { patch: string }): JSX.Element {
  const rows = useMemo(() => splitPatchRows(patch), [patch])
  return (
    <div className="gm-unified">
      {rows.length === 0 && <div className="gm-empty">无变更内容</div>}
      {rows.map((row, i) => (
        <div key={i} className={cx('gm-line', row.kind)}>
          <span className="ln">{row.ln ?? ''}</span>
          <span className="sign">{row.sign}</span>
          <span>{row.text}</span>
        </div>
      ))}
    </div>
  )
}

type DiffRow = {
  kind: 'add' | 'del' | 'meta' | ''
  sign: string
  text: string
  ln: number | null
}

/** Unified diff rows; hide `diff --git` / `index` headers. */
function splitPatchRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  if (!patch) return rows
  const lines = patch.split('\n')
  let lnL = 0
  let lnR = 0
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('index ')) {
      continue
    }
    if (line.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line)
      lnL = Number(m?.[1] ?? 1)
      lnR = Number(m?.[2] ?? 1)
      rows.push({ kind: 'meta', sign: '', text: line, ln: null })
      continue
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      rows.push({ kind: 'meta', sign: '', text: line.slice(4), ln: null })
      continue
    }
    if (
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('rename ')
    ) {
      rows.push({ kind: 'meta', sign: '', text: line, ln: null })
      continue
    }
    if (line.startsWith('+')) {
      rows.push({ kind: 'add', sign: '+', text: line.slice(1), ln: lnR++ })
      continue
    }
    if (line.startsWith('-')) {
      rows.push({ kind: 'del', sign: '−', text: line.slice(1), ln: lnL++ })
      continue
    }
    if (line.startsWith('\\')) {
      rows.push({ kind: 'meta', sign: '', text: line, ln: null })
      continue
    }
    const text = line.startsWith(' ') ? line.slice(1) : line
    rows.push({ kind: '', sign: '', text, ln: lnR++ })
  }
  return rows
}

function MrPanel({
  repo,
  branches,
  onClose,
  onToast
}: {
  repo: RepoInfo
  branches: BranchInfo[]
  onClose: () => void
  onToast: (text: string, error?: boolean) => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [newBranch, setNewBranch] = useState(() => newBranchName(repo.path))
  const [description, setDescription] = useState('')
  const [toBranch, setToBranch] = useState(repo.branch || 'main')
  const [settings, setSettings] = useState<GitLabSettings | null>(null)
  const [members, setMembers] = useState<GitLabMember[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<number[]>([])
  const [reviewers, setReviewers] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdMr, setCreatedMr] = useState<{ iid: number; web_url: string; title: string } | null>(null)
  const [pushNote, setPushNote] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const s = await api.gitlabSettings(repo.path)
      setSettings(s)
      const cache = await api.getMrCache(repo.path)
      if (cache) {
        setTitle(cache.title ?? '')
        setNewBranch(cache.newBranch ?? newBranchName(repo.path))
        setDescription(cache.description ?? '')
        setToBranch(cache.toBranch ?? repo.branch ?? 'main')
        setAssignees(cache.assignees ?? [])
        setReviewers(cache.reviewers ?? [])
      } else {
        setTitle(`feature/${repo.name}`)
        // No repo form cache → use resolved defaults (repo override or global).
        setAssignees(s.assignees)
        setReviewers(s.reviewers)
      }
      try {
        if (s.baseUrl && s.token && s.projectPath) {
          const list = await api.gitlabMembers(s)
          setMembers(list)
          setMembersError(null)
          if (cache?.assigneeNames?.length) {
            setAssignees((prev) =>
              prev.length
                ? prev
                : list.filter((m) => cache.assigneeNames!.includes(m.username)).map((m) => m.id)
            )
          }
          if (cache?.reviewerNames?.length) {
            setReviewers((prev) =>
              prev.length
                ? prev
                : list.filter((m) => cache.reviewerNames!.includes(m.username)).map((m) => m.id)
            )
          }
        } else {
          setMembers([])
          setMembersError(null)
        }
      } catch (e) {
        setMembers([])
        setMembersError((e as Error).message)
      }
    })()
  }, [repo.path])

  const persistCache = async () => {
    await api.saveMrCache(repo.path, {
      title,
      newBranch,
      description,
      toBranch,
      assignees,
      reviewers,
      assigneeNames: members.filter((m) => assignees.includes(m.id)).map((m) => m.username),
      reviewerNames: members.filter((m) => reviewers.includes(m.id)).map((m) => m.username)
    })
  }

  const submit = async () => {
    if (!title.trim()) {
      onToast('请填写 MR 标题', true)
      return
    }
    if (!newBranch.trim()) {
      onToast('请填写新分支名', true)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setCreatedMr(null)
    setPushNote(null)
    try {
      await persistCache()
      const s = settings
      if (!s || !s.baseUrl || !s.token || !s.projectPath) {
        const msg = '请先在「全局设置」或仓库「设置」中配置 GitLab 连接'
        setSubmitError(msg)
        onToast(msg, true)
        return
      }
      // 1) Push current HEAD to the configured source branch
      setPushNote(`正在推送 HEAD → ${newBranch}…`)
      await api.tasks('mr-push', `推送 → ${newBranch}`, () =>
        api.push(repo.path, 'origin', `HEAD:refs/heads/${newBranch.trim()}`)
      )
      setPushNote(`已推送 ${newBranch}，正在创建 MR…`)
      // 2) Create MR
      const created = await api.tasks('create-mr', '创建 MR', () =>
        api.createMr(s, {
          source_branch: newBranch.trim(),
          target_branch: toBranch,
          title,
          description,
          assignee_ids: assignees,
          reviewer_ids: reviewers
        })
      )
      setCreatedMr({ iid: created.iid, web_url: created.web_url, title: created.title })
      setPushNote(null)
      onToast(`MR 已创建 #${created.iid}`)
    } catch (e) {
      const msg = (e as Error).message || String(e)
      setSubmitError(msg)
      setPushNote(null)
      onToast(msg, true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="gm-modal-backdrop" onClick={onClose}>
      <div className="gm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-modal-header">一键 MR · {repo.name}</div>
        <div className="gm-modal-body">
          {submitError && <div className="gm-settings-error">{submitError}</div>}
          {pushNote && <div className="gm-settings-hint">{pushNote}</div>}
          {createdMr ? (
            <div className="gm-mr-success">
              <div className="gm-mr-success-title">MR 已创建 #{createdMr.iid}</div>
              <div className="gm-mr-success-sub">{createdMr.title}</div>
              <div className="gm-mr-success-url">{createdMr.web_url}</div>
            </div>
          ) : (
            <>
          <div className="gm-field">
            <label>标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MR 标题" />
          </div>
          <div className="gm-field">
            <label>新分支（根据仓库目录生成）</label>
            <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
          </div>
          <div className="gm-field">
            <label>目标分支</label>
            <select value={toBranch ?? ''} onChange={(e) => setToBranch(e.target.value)}>
              {[...new Set([repo.branch, ...branches.map((b) => b.name), 'main', 'master', 'develop'])]
                .filter((n): n is string => Boolean(n))
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
          <div className="gm-field">
            <label>描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="变更说明、测试方式…"
            />
          </div>
          <div className="gm-field">
            <label>Assignee</label>
            <div className="gm-chips">
              <MembersError message={membersError} />
              {!membersError && members.length === 0 && (
                <span style={{ color: 'var(--fg-secondary)' }}>配置 GitLab 后可选择成员</span>
              )}
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cx('gm-chip', assignees.includes(m.id) && 'on')}
                  onClick={() =>
                    setAssignees((prev) =>
                      prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                    )
                  }
                >
                  {m.name || m.username}
                </button>
              ))}
            </div>
          </div>
          <div className="gm-field">
            <label>Reviewer</label>
            <div className="gm-chips">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cx('gm-chip', reviewers.includes(m.id) && 'on')}
                  onClick={() =>
                    setReviewers((prev) =>
                      prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                    )
                  }
                >
                  {m.name || m.username}
                </button>
              ))}
            </div>
          </div>
            </>
          )}
        </div>
        <div className="gm-modal-footer">
          {createdMr ? (
            <>
              <button className="gm-btn" onClick={onClose}>
                关闭
              </button>
              <button
                className="gm-btn primary"
                onClick={() => {
                  void api.openExternal(createdMr.web_url).catch((e: Error) => onToast(e.message, true))
                }}
              >
                打开 MR
              </button>
            </>
          ) : (
            <>
              <button className="gm-btn" onClick={onClose}>
                取消
              </button>
              <button className="gm-btn primary" disabled={submitting} onClick={() => void submit()}>
                {submitting ? '提交中…' : '创建 MR'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default GitManagerApp
