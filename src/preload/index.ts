import { contextBridge, ipcRenderer } from 'electron'

/**
 * Allowed channels:
 * 1) host platform channels (static)
 * 2) plugin channels passed via additionalArguments after manifest discovery
 * 3) agent channels (built-in Claude Agent SDK integration)
 */
const HOST_CHANNELS = [
  'plugin:list',
  'fs:pick-directory',
  'shell:open-path',
  'shell:open-external',
  'shell:show-in-folder',
  'fs:read-text-file',
  'fs:probe-file',
  'store:read',
  'store:write',
  'store:patch',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'agent:settings:get',
  'agent:settings:save',
  'agent:models:list',
  'agent:models:test',
  'agent:skills:list',
  'agent:tasks:list',
  'agent:tasks:create',
  'agent:tasks:delete',
  'agent:messages:history',
  'agent:messages:send',
  'agent:model:switch',
  'agent:permission:respond',
  'agent:session:cancel'
]

const EVENT_CHANNELS = new Set(['agent:event'])

const allowed = new Set(HOST_CHANNELS)

for (const arg of process.argv) {
  if (!arg.startsWith('--devdash-ipc=')) continue
  try {
    const list = JSON.parse(arg.slice('--devdash-ipc='.length)) as unknown
    if (Array.isArray(list)) {
      for (const ch of list) {
        if (typeof ch === 'string') allowed.add(ch)
      }
    }
  } catch {
    /* ignore malformed */
  }
}

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => {
  if (!allowed.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

const on = (channel: string, listener: (payload: unknown) => void): (() => void) => {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error(`IPC event channel not allowed: ${channel}`)
  }
  const handler = (_e: Electron.IpcRendererEvent, payload: unknown): void => {
    listener(payload)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

export type DevDashPreload = {
  invoke: typeof invoke
  on: typeof on
  platform: NodeJS.Platform
}

const api: DevDashPreload = {
  invoke,
  on,
  platform: process.platform
}

contextBridge.exposeInMainWorld('devdash', api)
