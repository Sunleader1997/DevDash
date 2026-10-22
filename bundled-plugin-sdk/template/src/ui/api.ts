const host = (globalThis as unknown as {
  DevDashHost: { ipc: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }
}).DevDashHost

const P = 'plugin:__PLUGIN_ID__:'

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return host.ipc.invoke(channel, ...args) as Promise<T>
}

export function invokeDomain<T>(suffix: string, ...args: unknown[]): Promise<T> {
  return invoke<T>(P + suffix, ...args)
}

export const api = {
  openPath: (p: string) => invoke<void>('shell:open-path', p),
  showInFolder: (p: string) => invoke<void>('shell:show-in-folder', p),
  pickDirectory: () => invoke<string | null>('fs:pick-directory')
}
