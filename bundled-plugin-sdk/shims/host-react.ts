/** Host-injected React bridge (no npm react runtime inside the plugin bundle). */
const host = (globalThis as unknown as { DevDashHost: { React: typeof import('react') } }).DevDashHost
const React = host.React

export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
export const Fragment = React.Fragment
export const createElement = React.createElement
export const StrictMode = React.StrictMode
export const Children = React.Children
export const cloneElement = React.cloneElement
export const isValidElement = React.isValidElement
