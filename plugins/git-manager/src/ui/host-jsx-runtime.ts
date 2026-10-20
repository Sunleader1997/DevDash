const host = (globalThis as unknown as { DevDashHost: { React: typeof import('react') } }).DevDashHost
const React = host.React

export const Fragment = React.Fragment

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: unknown): unknown {
  const p = props ?? {}
  const finalProps = key !== undefined ? { ...p, key } : p
  return React.createElement(type as never, finalProps as never)
}

export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: unknown): unknown {
  return jsx(type, props, key)
}

export function jsxDEV(type: unknown, props: Record<string, unknown> | null, key?: unknown): unknown {
  return jsx(type, props, key)
}
