export interface PluginMainContext {
  appPath: string
  userDataPath: string
  registerIpc: (suffix: string, handler: (...args: unknown[]) => Promise<unknown>) => void
}

export default {
  id: __PLUGIN_ID_JSON__,
  async activate(ctx: PluginMainContext): Promise<void> {
    // Declare matching suffixes in package.json → devdash.ipc, then:
    // ctx.registerIpc('ping', async () => ({ ok: true }))
    void ctx
  }
}
