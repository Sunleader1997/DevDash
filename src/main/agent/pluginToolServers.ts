import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { toolRegistry } from '../plugin/toolRegistry'
import { createDevDashMcpServer } from './devTools'

/* eslint-disable @typescript-eslint/no-explicit-any */
type QueryLike = {
  setMcpServers: (servers: any) => Promise<any>
}

type ActiveSessionLike = {
  query: QueryLike
}

/** One SdkMcpServer per plugin that registered at least one tool. */
export function buildPluginToolServers(): Record<string, ReturnType<typeof createSdkMcpServer>> {
  const out: Record<string, ReturnType<typeof createSdkMcpServer>> = {}
  for (const pluginId of toolRegistry.pluginIds()) {
    const tools = toolRegistry.toSdkTools(pluginId)
    if (tools.length === 0) continue
    out[pluginId] = createSdkMcpServer({
      name: pluginId,
      version: '1.0.0',
      instructions: `Plugin ${pluginId} domain tools. Prefer these over mcp__devdash__* UI tools for domain operations. UI tools are for visual assertion only.`,
      tools,
      alwaysLoad: true
    })
  }
  return out
}

export function pluginAllowPrefixes(): string[] {
  return toolRegistry
    .pluginIds()
    .filter((id) => toolRegistry.toSdkTools(id).length > 0)
    .map((id) => `mcp__${id}__*`)
}

/**
 * Full dynamic MCP table. `setMcpServers` replaces the dynamic set,
 * so every push must include the host `devdash` server plus all plugin servers.
 */
export function buildAllToolServers(): Record<string, unknown> {
  return {
    devdash: createDevDashMcpServer(),
    ...buildPluginToolServers()
  }
}

export async function pushToolServers(session: ActiveSessionLike): Promise<void> {
  await session.query.setMcpServers(buildAllToolServers())
}

export async function pushToolServersToAllSessions(
  sessions: Iterable<ActiveSessionLike>
): Promise<void> {
  for (const s of sessions) {
    try {
      await pushToolServers(s)
    } catch (e) {
      console.warn('[agent] setMcpServers failed', e)
    }
  }
}
