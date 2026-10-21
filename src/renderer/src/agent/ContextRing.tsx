/** Circular progress ring for context-token occupancy. */
export function ContextRing({
  used,
  total
}: {
  used: number
  total: number
}): JSX.Element {
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0
  const r = 9
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const color = pct >= 90 ? '#ff453a' : pct >= 70 ? '#ff9f0a' : '#0a84ff'
  return (
    <div
      className="ctx-ring"
      title={`上下文 ${Math.round(pct)}%（${fmt(used)} / ${fmt(total)}）`}
      role="img"
      aria-label={`上下文占用 ${Math.round(pct)}%`}
    >
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--separator)" strokeWidth="2.5" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 11 11)"
        />
      </svg>
      <span className="ctx-ring-label">{Math.round(pct)}</span>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}
