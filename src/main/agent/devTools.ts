import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import {
  captureDomSnapshot,
  captureScreenshot,
  getCdpInfo,
  refreshPluginsUi,
  reloadPluginUi
} from '../uiDev/uiDevService'
import * as drive from '../uiDev/uiDrive'
import type { Locator } from '../uiDev/uiDrive'
import { INTERACTIVE_DRIVE_TOOLS } from '../uiDev/interactiveTools'

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image'; data: string; mimeType: string }
type ToolContent = TextPart | ImagePart

function textResult(text: string): { content: ToolContent[] } {
  return { content: [{ type: 'text', text }] }
}

function jsonResult(value: unknown): { content: ToolContent[] } {
  return textResult(JSON.stringify(value, null, 2))
}

function errorResult(err: unknown): { content: ToolContent[]; isError: true } {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true }
}

const locatorSchema = z.object({
  testid: z.string().optional().describe('data-testid / data-test-id（优先）'),
  role: z.string().optional().describe('ARIA role，如 button / textbox / checkbox'),
  name: z.string().optional().describe('accessible name（配合 role）'),
  label: z.string().optional().describe('表单 label 文本'),
  text: z.string().optional().describe('可见文本'),
  exact: z.boolean().optional().describe('text/name 精确匹配，默认 true'),
  css: z.string().optional().describe('CSS selector 兜底'),
  index: z.number().int().optional().describe('多匹配时取第 N 个（0-based）；默认要求唯一')
})

function toLocator(args: z.infer<typeof locatorSchema>): Locator {
  return {
    testid: args.testid,
    role: args.role,
    name: args.name,
    label: args.label,
    text: args.text,
    exact: args.exact,
    css: args.css,
    index: args.index
  }
}

const RO = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
  },
  alwaysLoad: true
} as const

const RW = {
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  },
  alwaysLoad: true
} as const

const RW_IDEM = {
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  alwaysLoad: true
} as const

/**
 * In-process SDK MCP tools for UI acceptance: screenshot / DOM snapshot /
 * plugin UI reload / CDP status, plus Playwright-class interaction tools.
 * Handlers run in the Electron main process.
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
    'Reload DevDash plugin UI modules without restarting the app (clears module cache, cache-busting re-import). Run the plugin build first if sources changed (repo: npm run build:plugins; user plugin: node <plugin-sdk>/build.mjs). For brand-new plugins call refresh_plugins after building.',
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

  const refreshPluginsTool = tool(
    'refresh_plugins',
    'Re-discover DevDash plugins from plugin roots (including new user plugins under userData/plugins) and refresh the sidebar. Call after create.mjs + build.mjs. New plugin IPC works without an app restart.',
    {},
    async () => {
      try {
        const result = await refreshPluginsUi()
        return jsonResult(result)
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '重发现插件',
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
    'Report CDP remote-debugging status (enabled, port, URL). Optional advanced path for external Playwright; prefer mcp__devdash__* interaction tools for DevDash self-verification.',
    {},
    async () => {
      try {
        return jsonResult(getCdpInfo())
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

  // ---- read-only query / assertion ----

  const queryTool = tool(
    'query',
    'Resolve a semantic locator and return matching node summary (tag/testid/role/text/value/disabled/rect). Errors when not found or when multiple match and index is omitted.',
    { locator: locatorSchema },
    async (args) => {
      try {
        const res = await drive.resolveLocator(toLocator(args.locator))
        if (!res.ok) {
          return errorResult(new Error(`定位失败: ${res.reason}${res.candidates ? ` | 候选: ${JSON.stringify(res.candidates)}` : ''}`))
        }
        return jsonResult(res)
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '查询节点' }, alwaysLoad: true }
  )

  const getTextTool = tool(
    'get_text',
    'Get innerText of the resolved element (trimmed, whitespace-collapsed).',
    { locator: locatorSchema },
    async (args) => {
      try {
        return textResult(await drive.getText(toLocator(args.locator)))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '取文本' }, alwaysLoad: true }
  )

  const getValueTool = tool(
    'get_value',
    'Get form value of input/textarea/select (or contentEditable text).',
    { locator: locatorSchema },
    async (args) => {
      try {
        return textResult(await drive.getValue(toLocator(args.locator)))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '取值' }, alwaysLoad: true }
  )

  const getAttrTool = tool(
    'get_attr',
    'Get one attribute value from the resolved element.',
    {
      locator: locatorSchema,
      name: z.string().min(1).describe('Attribute name, e.g. href / data-state')
    },
    async (args) => {
      try {
        const v = await drive.getAttr(toLocator(args.locator), args.name)
        return textResult(v == null ? 'null' : v)
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '取属性' }, alwaysLoad: true }
  )

  const waitForTool = tool(
    'wait_for',
    'Poll until locator reaches a state. state: visible|hidden|enabled|disabled|attached|text|value. For text/value pass the expected text (exact unless locator.exact=false).',
    {
      locator: locatorSchema,
      state: z.enum(['visible', 'hidden', 'enabled', 'disabled', 'attached', 'text', 'value']),
      text: z.string().optional().describe('Expected text/value for state=text|value'),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.waitFor(toLocator(args.locator), args.state, {
            text: args.text,
            timeoutMs: args.timeoutMs
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '等待状态' }, alwaysLoad: true }
  )

  const screenshotElementTool = tool(
    'screenshot_element',
    'Capture only the resolved element as a PNG (cropped from the window capture).',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        const shot = await drive.screenshotElement(toLocator(args.locator), { timeoutMs: args.timeoutMs })
        return {
          content: [
            { type: 'image', data: shot.base64, mimeType: 'image/png' },
            { type: 'text', text: `Saved ${shot.width}x${shot.height} PNG to ${shot.path}` }
          ]
        }
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RO.annotations, title: '元素截图' }, alwaysLoad: true }
  )

  // ---- interaction (permission-gated in approve mode) ----

  const clickTool = tool(
    'click',
    'Click an element (semantic locator). Scrolls into view and waits for actionability first. button: left|right|middle.',
    {
      locator: locatorSchema,
      button: z.enum(['left', 'right', 'middle']).optional(),
      clickCount: z.number().int().min(1).max(2).optional(),
      modifiers: z.array(z.string()).optional().describe('shift/ctrl/alt/meta'),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.click(toLocator(args.locator), {
            button: args.button,
            clickCount: args.clickCount,
            modifiers: args.modifiers,
            timeoutMs: args.timeoutMs
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '点击元素',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  const dblclickTool = tool(
    'dblclick',
    'Double-click an element.',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.dblclick(toLocator(args.locator), { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '双击元素',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  const hoverTool = tool(
    'hover',
    'Move the mouse over an element (triggers hover styles/tooltips).',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.hover(toLocator(args.locator), { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '悬停元素' }, alwaysLoad: true }
  )

  const fillTool = tool(
    'fill',
    'Set an input/textarea value in one shot (fires input+change so React controlled components update). Clears existing value first.',
    {
      locator: locatorSchema,
      value: z.string(),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.fill(toLocator(args.locator), args.value, { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW.annotations, title: '填入内容' }, alwaysLoad: true }
  )

  const clearTool = tool(
    'clear',
    'Clear an input/textarea (fill with empty string).',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.clear(toLocator(args.locator), { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '清空输入' }, alwaysLoad: true }
  )

  const typeTool = tool(
    'type',
    'Type text key-by-key into a focused/located element (real keyboard events). Prefer fill for whole-value sets.',
    {
      locator: locatorSchema,
      text: z.string(),
      delayMs: z.number().int().min(0).max(200).optional(),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.typeText(toLocator(args.locator), args.text, {
            delayMs: args.delayMs,
            timeoutMs: args.timeoutMs
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW.annotations, title: '键入文本' }, alwaysLoad: true }
  )

  const pressKeyTool = tool(
    'press_key',
    'Press a key or combo (e.g. Enter, Escape, Tab, Control+a). Omit locator to send to current focus.',
    {
      key: z.string().min(1).describe('Key name: Enter / Escape / Tab / Backspace / Delete / Up / a …'),
      locator: locatorSchema.optional(),
      modifiers: z.array(z.string()).optional(),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.pressKey(args.key, {
            locator: args.locator ? toLocator(args.locator) : undefined,
            modifiers: args.modifiers,
            timeoutMs: args.timeoutMs
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW.annotations, title: '按键' }, alwaysLoad: true }
  )

  const selectTool = tool(
    'select_option',
    'Select a <select> option by value or label.',
    {
      locator: locatorSchema,
      value: z.string().optional(),
      label: z.string().optional(),
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.selectOption(toLocator(args.locator), {
            value: args.value,
            label: args.label,
            timeoutMs: args.timeoutMs
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW.annotations, title: '下拉选择' }, alwaysLoad: true }
  )

  const checkTool = tool(
    'check',
    'Check a checkbox/radio (idempotent if already checked).',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.setChecked(toLocator(args.locator), true, { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '勾选' }, alwaysLoad: true }
  )

  const uncheckTool = tool(
    'uncheck',
    'Uncheck a checkbox (idempotent if already unchecked).',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.setChecked(toLocator(args.locator), false, { timeoutMs: args.timeoutMs }))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '取消勾选' }, alwaysLoad: true }
  )

  const scrollIntoViewTool = tool(
    'scroll_into_view',
    'Scroll an element into the viewport center.',
    {
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional()
    },
    async (args) => {
      try {
        return jsonResult(await drive.scrollIntoView(toLocator(args.locator)))
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '滚动到元素' }, alwaysLoad: true }
  )

  const scrollTool = tool(
    'scroll',
    'Scroll the window, or an element when locator is given. Use deltaX/deltaY for relative, x/y for absolute.',
    {
      locator: locatorSchema.optional().describe('Element to scroll; omit for window'),
      deltaX: z.number().optional(),
      deltaY: z.number().optional(),
      x: z.number().optional().describe('Absolute scrollLeft / scrollX'),
      y: z.number().optional().describe('Absolute scrollTop / scrollY')
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.scrollBy(args.deltaX ?? 0, args.deltaY ?? 0, {
            x: args.x,
            y: args.y,
            locator: args.locator ? toLocator(args.locator) : undefined
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    { annotations: { ...RW_IDEM.annotations, title: '滚动页面' }, alwaysLoad: true }
  )

  const dragTool = tool(
    'drag',
    'Drag from one element to another (mouseDown + interpolated mouseMove + mouseUp). Implement plugin drags with pointer/mouse events — native HTML5 draggable is not reliable with synthetic input.',
    {
      from: locatorSchema,
      to: locatorSchema,
      timeoutMs: z.number().int().min(100).max(30000).optional(),
      steps: z.number().int().min(3).max(24).optional()
    },
    async (args) => {
      try {
        return jsonResult(
          await drive.drag(toLocator(args.from), toLocator(args.to), {
            timeoutMs: args.timeoutMs,
            steps: args.steps
          })
        )
      } catch (err) {
        return errorResult(err)
      }
    },
    {
      annotations: {
        title: '拖拽',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      },
      alwaysLoad: true
    }
  )

  return createSdkMcpServer({
    name: 'devdash',
    version: '0.2.0',
    instructions:
      'DevDash UI acceptance + interaction tools (in-process; no Playwright needed). ' +
      'Flow: build plugin (npm run build:plugins or node <plugin-sdk>/build.mjs) → refresh_plugins (new) or reload_plugin_ui (UI-only) → interact (click/fill/…) → assert (dom_snapshot/screenshot/get_text/wait_for). ' +
      'Locator is semantic-first: testid > role+name > label > text > css; require unique match or pass index. ' +
      'CDP is optional advanced path for external Playwright only.',
    tools: [
      screenshotTool,
      snapshotTool,
      reloadTool,
      refreshPluginsTool,
      cdpTool,
      queryTool,
      getTextTool,
      getValueTool,
      getAttrTool,
      waitForTool,
      screenshotElementTool,
      clickTool,
      dblclickTool,
      hoverTool,
      fillTool,
      clearTool,
      typeTool,
      pressKeyTool,
      selectTool,
      checkTool,
      uncheckTool,
      scrollIntoViewTool,
      scrollTool,
      dragTool
    ],
    alwaysLoad: true
  })
}

export { INTERACTIVE_DRIVE_TOOLS }
