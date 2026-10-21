/**
 * Accept numeric project id, `group/repo` path, or a git clone / browse URL
 * (https / ssh / scp-like). Returns the id string for `/projects/:id`.
 */
export function normalizeProjectRef(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw

  let p = raw
  // https://host/group/repo(.git)?(/-/…)?  or  ssh://git@host/group/repo.git
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
    try {
      const u = new URL(p)
      p = u.pathname
    } catch {
      /* keep raw */
    }
  } else if (!/^[a-z]:[\\/]/i.test(p)) {
    // scp-like: git@host:group/repo.git (not a Windows path like C:/Users/…)
    const m = /^(?:[^@/]+@)?[^:/]+:(.+)$/.exec(p)
    if (m?.[1]) p = m[1]
  }

  p = p.replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/-\/.*$/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  return p
}
