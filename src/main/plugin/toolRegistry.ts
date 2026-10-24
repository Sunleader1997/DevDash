import { tool, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/** Lightweight param DSL — plugins do not depend on zod. */
export type ToolParam = {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object'
  description?: string
  required?: boolean
  values?: string[]
  items?: ToolParam
  properties?: Record<string, ToolParam>
}

export type PluginToolAnnotations = {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export type PluginToolDef = {
  name: string
  description: string
  params?: Record<string, ToolParam>
  annotations?: PluginToolAnnotations
}

export type PluginToolHandler = (args: Record<string, unknown>) => Promise<unknown>

export type RegisteredTool = {
  pluginId: string
  def: PluginToolDef
  handler: PluginToolHandler
}

const TOOL_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/
const MAX_TOOL_NAME = 64

function fail(msg: string): never {
  throw new Error(`[toolRegistry] ${msg}`)
}

function validateParam(name: string, param: ToolParam, path: string): void {
  if (!param || typeof param !== 'object') fail(`${path}: param must be an object`)
  const t = param.type
  if (t === 'string' || t === 'number' || t === 'boolean') return
  if (t === 'enum') {
    if (!Array.isArray(param.values) || param.values.length === 0) {
      fail(`${path}: enum requires non-empty values`)
    }
    for (const v of param.values) {
      if (typeof v !== 'string') fail(`${path}: enum values must be strings`)
    }
    return
  }
  if (t === 'array') {
    if (!param.items) fail(`${path}: array requires items`)
    validateParam(name, param.items, `${path}.items`)
    return
  }
  if (t === 'object') {
    if (param.properties) {
      for (const [k, v] of Object.entries(param.properties)) {
        validateParam(k, v, `${path}.properties.${k}`)
      }
    }
    return
  }
  fail(`${path}: unknown type ${String(t)}`)
}

export function validateToolDef(pluginId: string, def: PluginToolDef): void {
  if (!def || typeof def !== 'object') fail(`[${pluginId}] tool def must be an object`)
  const name = def.name
  if (typeof name !== 'string' || !TOOL_NAME_RE.test(name) || name.length > MAX_TOOL_NAME) {
    fail(`[${pluginId}] invalid tool name: ${String(name)}`)
  }
  if (typeof def.description !== 'string' || def.description.trim() === '') {
    fail(`[${pluginId}:${name}] description is required`)
  }
  if (def.params) {
    for (const [k, v] of Object.entries(def.params)) {
      validateParam(k, v, `params.${k}`)
    }
  }
  if (def.annotations) {
    for (const [k, v] of Object.entries(def.annotations)) {
      if (typeof v !== 'boolean') fail(`[${pluginId}:${name}] annotations.${k} must be boolean`)
    }
  }
}

export function toolParamToZod(param: ToolParam): z.ZodType {
  let base: z.ZodType
  switch (param.type) {
    case 'string':
      base = z.string()
      break
    case 'number':
      base = z.number()
      break
    case 'boolean':
      base = z.boolean()
      break
    case 'enum':
      base = z.enum(param.values as [string, ...string[]])
      break
    case 'array':
      base = z.array(toolParamToZod(param.items as ToolParam))
      break
    case 'object': {
      const shape: Record<string, z.ZodType> = {}
      for (const [k, v] of Object.entries(param.properties ?? {})) {
        // toolParamToZod already applies .optional() when required !== true
        shape[k] = toolParamToZod(v)
      }
      base = z.object(shape)
      break
    }
    default:
      fail(`unknown type ${String(param.type)}`)
  }
  if (param.description) base = base.describe(param.description)
  return param.required === true ? base : base.optional()
}

function paramsToRawShape(params?: Record<string, ToolParam>): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {}
  if (!params) return shape
  for (const [k, v] of Object.entries(params)) {
    shape[k] = toolParamToZod(v)
  }
  return shape
}

function toAnnotations(def: PluginToolDef): {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
} {
  const a = def.annotations ?? {}
  return {
    readOnlyHint: a.readOnlyHint === true,
    destructiveHint: a.destructiveHint === true,
    idempotentHint: a.idempotentHint === true,
    openWorldHint: a.openWorldHint === true
  }
}

export type ToolContent = { type: 'text'; text: string }

export function toCallToolResult(
  fn: PluginToolHandler,
  args: Record<string, unknown>
): Promise<{ content: ToolContent[]; isError?: boolean }> {
  return Promise.resolve()
    .then(() => fn(args))
    .then((out) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(out ?? null) }]
    }))
    .catch((err: unknown) => ({
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: `error: ${err instanceof Error ? err.message : String(err)}`
        }
      ]
    }))
}

class ToolRegistry {
  private byPlugin = new Map<string, Map<string, RegisteredTool>>()

  register(pluginId: string, def: PluginToolDef, handler: PluginToolHandler): void {
    if (typeof pluginId !== 'string' || pluginId === '') fail('pluginId is required')
    if (typeof handler !== 'function') fail(`[${pluginId}:${def?.name}] handler must be a function`)
    validateToolDef(pluginId, def)
    let m = this.byPlugin.get(pluginId)
    if (!m) {
      m = new Map()
      this.byPlugin.set(pluginId, m)
    }
    if (m.has(def.name)) fail(`[${pluginId}] duplicate tool: ${def.name}`)
    m.set(def.name, { pluginId, def, handler })
  }

  listByPlugin(): Map<string, RegisteredTool[]> {
    const out = new Map<string, RegisteredTool[]>()
    for (const [id, m] of this.byPlugin) out.set(id, [...m.values()])
    return out
  }

  get(pluginId: string, name: string): RegisteredTool | undefined {
    return this.byPlugin.get(pluginId)?.get(name)
  }

  /** Parse `mcp__<plugin-id>__<tool>` and look up registration. */
  getByMcpName(toolName: string): RegisteredTool | undefined {
    if (!toolName.startsWith('mcp__')) return undefined
    const rest = toolName.slice('mcp__'.length)
    const idx = rest.indexOf('__')
    if (idx <= 0) return undefined
    const pluginId = rest.slice(0, idx)
    const name = rest.slice(idx + 2)
    return this.get(pluginId, name)
  }

  clearPluginTools(pluginId: string): void {
    this.byPlugin.delete(pluginId)
  }

  /** Plugin ids that have at least one tool (for allowedTools prefixes). */
  pluginIds(): string[] {
    return [...this.byPlugin.keys()]
  }

  toSdkTools(pluginId: string): SdkMcpToolDefinition[] {
    const tools: SdkMcpToolDefinition[] = []
    const m = this.byPlugin.get(pluginId)
    if (!m) return tools
    for (const entry of m.values()) {
      const shape = paramsToRawShape(entry.def.params)
      const t = tool(
        entry.def.name,
        entry.def.description,
        // zod raw shape is intentionally loose; plugin params are validated at register.
        shape as Record<string, z.ZodType>,
        async (args) =>
          toCallToolResult(entry.handler, (args ?? {}) as Record<string, unknown>),
        {
          annotations: toAnnotations(entry.def),
          alwaysLoad: true
        }
      )
      tools.push(t as unknown as SdkMcpToolDefinition)
    }
    return tools
  }
}

export const toolRegistry = new ToolRegistry()
