import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './shell/ErrorBoundary'
import './design/tokens.css'
import './design/cursors.css'
import type { DevDashHostGlobals } from './hostApi'
import { taskBus } from './shell/taskBus'

const host: DevDashHostGlobals = {
  React,
  ReactDOM: { createRoot } as unknown as typeof import('react-dom'),
  ipc: {
    invoke: (channel: string, ...args: unknown[]) => window.devdash.invoke(channel, ...args)
  },
  tasks: {
    run: (id, label, fn) => taskBus.run(id, label, fn),
    list: () => taskBus.list(),
    subscribe: (cb) => taskBus.subscribe(cb),
    clearFinished: () => taskBus.clearFinished()
  },
  platform: window.devdash.platform
}
;(globalThis as unknown as { DevDashHost: DevDashHostGlobals }).DevDashHost = host

const el = document.getElementById('root')
document.documentElement.dataset.platform = window.devdash.platform
if (!el) {
  document.body.innerHTML = '<pre style="padding:24px">missing #root</pre>'
} else {
  createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
