// Temporary verification: load the built plugin bundle with the host bridge shim.
import React from 'react'
import { renderToString } from 'react-dom/server'

const calls = []
globalThis.DevDashHost = {
  React,
  ReactDOM: {},
  ipc: {
    invoke: async (channel, ...args) => {
      calls.push([channel, ...args])
      if (channel === 'plugin:screensaver:settings:get') {
        return { idleSeconds: 45, scene: 'stars', showDate: false }
      }
      if (channel === 'plugin:screensaver:settings:save') {
        return { idleSeconds: 45, scene: 'stars', showDate: false }
      }
      return null
    }
  },
  tasks: { run: async (_id, _l, fn) => fn(), list: () => [], subscribe: () => () => {}, clearFinished: () => {} },
  platform: 'darwin'
}

const mod = await import('./plugins/screensaver/dist/ui.js')
const plugin = mod.default
console.log('default export:', JSON.stringify({ id: plugin.id, title: plugin.title, icon: plugin.icon, hasApp: typeof plugin.App === 'function' }))
console.log('named App export:', typeof mod.App)

const html = renderToString(React.createElement(plugin.App))
console.log('rendered html (trimmed):')
console.log(html.replace(/></g, '>\n<'))

const styles = document?.getElementById?.('devdash-screensaver-css')
console.log('style injected:', Boolean(styles))
