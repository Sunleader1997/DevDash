import type { ComponentType, ReactNode } from 'react'

export interface DevDashPluginMeta {
  id: string
  title: string
  icon?: string
  order?: number
  /** Landing view declared by the plugin manifest (`devdash.home`). */
  home?: boolean
  packageName: string
  rootDir: string
  uiEntry: string
  mainEntry?: string
  /** Declared `devdash.ipc` suffixes → full channels `plugin:<id>:<suffix>`. */
  ipcSuffixes?: string[]
}

export interface HostTask {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
  detail?: string
  startedAt: number
  endedAt?: number
}

export interface DevDashHostGlobals {
  React: typeof import('react')
  ReactDOM: typeof import('react-dom')
  ipc: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }
  tasks: {
    run: <T>(id: string, label: string, fn: () => Promise<T>) => Promise<T>
    list: () => HostTask[]
    subscribe: (cb: () => void) => () => void
    clearFinished: () => void
  }
  platform: NodeJS.Platform
}

export interface DevDashPluginModule {
  id: string
  title: string
  icon?: string
  App: ComponentType
  onActivate?: () => void | Promise<void>
  onDeactivate?: () => void | Promise<void>
}

declare global {
  // eslint-disable-next-line no-var
  var DevDashHost: DevDashHostGlobals
}

export interface PluginShellProps {
  children: ReactNode
}

export type { ReactNode }
