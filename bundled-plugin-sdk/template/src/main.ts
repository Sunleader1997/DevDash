export interface PluginToolParam {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object'
  description?: string
  required?: boolean
  values?: string[]
  items?: PluginToolParam
  properties?: Record<string, PluginToolParam>
}

export interface PluginToolDef {
  name: string
  description: string
  params?: Record<string, PluginToolParam>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export interface PluginMainContext {
  appPath: string
  userDataPath: string
  registerIpc: (suffix: string, handler: (...args: unknown[]) => Promise<unknown>) => void
  registerTool: (
    def: PluginToolDef,
    handler: (args: Record<string, unknown>) => Promise<unknown>
  ) => void
}

export default {
  id: __PLUGIN_ID_JSON__,
  async activate(ctx: PluginMainContext): Promise<void> {
    // IPC（UI ↔ main）：清单 devdash.ipc 声明后缀后
    // ctx.registerIpc('ping', async () => ({ ok: true }))

    // Agent Tool（agent ↔ main）：无需写入 devdash.ipc
    // ctx.registerTool(
    //   {
    //     name: 'ping',
    //     description: '返回 { ok: true }。用于验证 agent 可调用本插件工具。',
    //     annotations: { readOnlyHint: true }
    //   },
    //   async () => ({ ok: true })
    // )
    void ctx
  }
}
