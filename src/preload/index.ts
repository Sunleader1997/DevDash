import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => {
  const allowed = new Set([
    'plugin:list',
    'fs:pick-directory',
    'shell:open-path',
    'shell:show-in-folder',
    'fs:read-text-file',
    'fs:probe-file',
    'settings:get',
    'settings:save',
    'settings:add-whitelist-ext',
    'git:find-repos',
    'git:repo-info',
    'git:status',
    'git:list-files',
    'git:add',
    'git:ignore',
    'git:commit',
    'git:push',
    'git:pull',
    'git:unpushed',
    'git:branches',
    'git:checkout',
    'git:log',
    'git:diff-files',
    'git:working-diff-files',
    'git:diff-file-patch',
    'git:commit-files',
    'git:file-at-ref',
    'gitlab:settings:get',
    'gitlab:settings:save',
    'gitlab:members',
    'gitlab:create-mr',
    'mr-config:get',
    'mr-config:save',
    'store:read',
    'store:write',
    'store:patch',
    'window:minimize',
    'window:maximize',
    'window:close',
    'window:is-maximized'
  ])
  if (!allowed.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

export type DevDashPreload = {
  invoke: typeof invoke
  platform: NodeJS.Platform
}

const api: DevDashPreload = {
  invoke,
  platform: process.platform
}

contextBridge.exposeInMainWorld('devdash', api)
