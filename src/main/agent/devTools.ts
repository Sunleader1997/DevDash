import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import {
  captureDomSnapshot,
  captureScreenshot,
  getCdpInfo,
  reloadPluginUi
} from '../uiDev/uiDevService'

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image'; data: string; mimeType: string }
type ToolContent = TextPart | ImagePart

function textResult(text: string): { content: ToolContent[] } {
  return { content: [{ type: 'text', text }] }
}

function errorResult(err: unknown): { content: ToolContent[]; isError: true } {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true }
}

/**
 * In-process SDK MCP tools for UI acceptance: screenshot / DOM snapshot /
 * plugin UI reload / CDP status. Handlers run in the Electron main process.
 */
export function createDevDashMcpServer(): ReturnType<typeof createSdkMcpServer> {
  const screenshotTool = tool(
    'screenshot',
    'Capture the DevDash main window as a PNG and return the image plus save path. Use after UI changes to visually verify.',
    {
      pluginId: z.string().optional().describe('Optional plugin id for the filename only')
    },
    async (args) => {
      try {
        const shot = await captureScreenshot({ pluginId: args.pluginId })
        return {
          content: [
            {
              type: 'image',
              data: shot.base64,
              mimeType: shot.mimeType
            },
            {
              type: 'text',
              text: `Saved ${shot.width}x${shot.height} PNG to ${shot.path}`
            }
          ]
        }
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '界面截图',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  const snapshotTool = tool(
    'dom_snapshot',
    'Return a compact DOM/accessibility-ish tree of the current DevDash UI (tags, roles, testids, short text). Cheaper than screenshot for assertions.',
    {
      maxChars: z.number().int().min(1000).max(80000).optional().describe('Max output characters')
    },
    async (args) => {
      try {
        const text = await captureDomSnapshot(args.maxChars ?? 12000)
        return textResult(text)
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: 'DOM 快照',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  const reloadTool = tool(
    'reload_plugin_ui',
    'Reload DevDash plugin UI modules without restarting the app (clears module cache, cache-busting re-import). Run npm run build:plugins first if sources changed. New plugins or new IPC channels still need an app restart.',
    {
      pluginId: z.string().optional().describe('Plugin id to reload; omit for all loaded plugins')
    },
    async (args) => {
      try {
        const rawId = typeof args.pluginId === 'string' ? args.pluginId.trim() : ''
        const result = await reloadPluginUi(rawId === '' ? undefined : rawId)
        return textResult(JSON.stringify(result, null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '重载插件 UI',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  const cdpTool = tool(
    'cdp_info',
    'Report CDP remote-debugging status (enabled, port, URL). When off, tell the user to enable it in Settings → 开发调试 and restart.',
    {},
    async () => {
      try {
        return textResult(JSON.stringify(getCdpInfo(), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: 'CDP 状态',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    }
  )

  return createSdkMcpServer({
    name: 'devdash',
    version: '0.1.0',
    instructions:
      'DevDash UI acceptance tools. After editing plugins run build:plugins then reload_plugin_ui; verify with dom_snapshot and screenshot. CDP is optional and controlled in app settings.',
    tools: [screenshotTool, snapshotTool, reloadTool, cdpTool],
    alwaysLoad: true
  })
}
