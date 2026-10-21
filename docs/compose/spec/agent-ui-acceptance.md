---
feature: agent-ui-acceptance
status: delivered
updated: 2026-03-20
branch: main
commits: 8e92cc6..8e92cc6
---

# Agent UI 验收闭环（截图 / CDP / 插件热加载）

## Report

**What was built** — 为 DevDash 打通「agent 改完插件 → 当前应用热重载 UI → 看得见、点得动」的验收闭环。主进程新增 `uiDevService`（截图 `capturePage`、DOM 快照、插件 UI 重载、CDP 状态探测），并以 Claude Agent SDK 自定义 tool（`tool()` + `createSdkMcpServer('devdash')`）暴露 `mcp__devdash__screenshot` / `dom_snapshot` / `reload_plugin_ui` / `cdp_info`，随每个 agent 会话挂载，`allowedTools` 自动放行。插件 UI 支持热替换：`devdash-plugin://` 响应 `Cache-Control: no-store`，renderer 监听 `devdash:reload-plugin-ui` 清模块缓存并以 `?t=` 重载（含 in-flight import 代次保护）；agent 流程为 `npm run build:plugins` → `reload_plugin_ui` → 截图/快照验收。CDP 为设置开关（`AgentSettings.uiDev.enableCdp` / `cdpPort`，默认关），启动前 `appendSwitch('remote-debugging-port')`，ready 后写 `userData/cdp.json` 并探测 `/json/version` 确认可连。新建插件 / 新 IPC 仍需重启（preload 白名单建窗冻结），符合本轮范围。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS（git-manager）；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS。独立 review：S2 验收项除文档 Report 全部 met，无 critical 代码缺陷；已修 empty `pluginId`、reload-during-import 代次竞争、`enableCdp` 严格布尔、CDP 端口探测后写 `active`。CDP 真机连通与 `capturePage` 出图需在运行中的 Electron 内点验（静态无法覆盖）。

**Journey log** — 1) 热加载刻意不做 main/IPC 热替换：preload 白名单 `additionalArguments` 建窗冻结，全量热加载要动窗口生命周期，本轮只做 UI 热替换。2) 工具走 SDK `createSdkMcpServer`（用户指定），比 MCP 独立进程或 Bash 脚本更贴身，且天然跑在 Electron 主进程里可调 `webContents`。3) 重载用 `executeJavaScript` 派发 CustomEvent，避免为 UI-only 能力扩 preload 事件白名单。4) 自定义协议解析只用 `url.pathname`，`?t=` cache-bust 不会破坏文件路径。5) CDP 必须在 `app.ready` 前 `appendSwitch`，故设置变更需重启；`cdp_info` + `cdp.json` 供 agent 发现端口。

## [S1] Problem

Agent 在 DevDash 内开发 `plugins/*` 后，无法在当前应用上「看见」或「操作」界面，也难以验收改动：

1. 插件 UI 构建产物需重启才生效，agent 改完只能改源码，当前窗口仍是旧 bundle。
2. 没有截图/DOM 快照 tool，agent 只能靠类型检查与 smoke 间接判断，视觉回归弱。
3. 无法通过 CDP 驱动真实 DOM，不能自己点一遍宿主壳或插件界面做验收。

## [S2] Design

### 2.1 总体

```text
Agent (Claude Agent SDK)
  │  mcp__devdash__*  (SDK 内嵌 MCP：screenshot / snapshot / reload / …)
  │  Bash: npm run build:plugins
  ▼
Electron 主进程 ── capturePage / executeJavaScript / 事件广播
  │
  ▼
Renderer 宿主壳 + plugins/* UI（同一 webContents）
  │
  └─ 可选：--remote-debugging-port（设置开关）→ 外部 Playwright/CDP
```

工具以 **SDK 自定义 tool**（`tool()` + `createSdkMcpServer()`）挂在每个会话的 `mcpServers.devdash` 上，主进程内执行，可调 `BrowserWindow.webContents`。

实现入口：

| 模块 | 路径 |
| --- | --- |
| UI 验收服务 | `src/main/uiDev/uiDevService.ts` |
| SDK MCP 工具 | `src/main/agent/devTools.ts` |
| 会话挂载 | `src/main/agent/agentRuntime.ts`（`mcpServers.devdash` + `allowedTools`） |
| 权限 | `src/main/agent/permissionBridge.ts`（`mcp__devdash__*` auto-allow） |
| 热重载 UI | `src/renderer/src/App.tsx`（`devdash:reload-plugin-ui` + 代次保护） |
| 协议缓存 | `src/main/ipc.ts`（`Cache-Control: no-store`） |
| CDP 开关 | 设置 `uiDev` + `applyCdpSwitchEarly()` / `activateCdpInfo()` |

### 2.2 SDK 工具契约

服务器名：`devdash`。完整工具名：`mcp__devdash__<name>`。

| Tool | 入参 | 行为 | 权限 |
| --- | --- | --- | --- |
| `screenshot` | `{ pluginId?: string }` | 确保窗口可见后 `capturePage` → PNG；返回 image content + 本地路径 | 只读，auto-allow |
| `dom_snapshot` | `{ maxChars?: number }` | `executeJavaScript` 抽取精简 DOM 树（tag/role/testid/短文本），有界截断 | 只读，auto-allow |
| `reload_plugin_ui` | `{ pluginId?: string }` | 派发 `devdash:reload-plugin-ui`，renderer 清 `loaded` 并 `?t=` 重载；省略/空白 id 则重载全部 | 写 UI 状态，auto-allow |
| `cdp_info` | `{}` | 返回 `userData/cdp.json` 状态（enabled/active/port/url/note） | 只读，auto-allow |

`CallToolResult` 图片：`{ type: 'image', data: <base64>, mimeType: 'image/png' }`，并附文字路径。

`permissionBridge.classifyTool`：名称以 `mcp__devdash__` 开头 → auto-allow。`allowedTools` 含 `mcp__devdash__*`。

### 2.3 插件 UI 热加载（不做 main 热替换）

范围（用户已确认）：**UI 热替换 + 构建后刷新**；新建插件或新 IPC 仍需重启。

1. **协议**：`devdash-plugin://` 响应 `Cache-Control: no-store`。
2. **Renderer**：监听 `devdash:reload-plugin-ui`；按 `pluginId` 清 `loaded`（或全部）；懒加载带 `?t=Date.now()`；刷新 `plugin:list`。用 `reloadGen` 丢弃热重载前未完成的 `import` 结果。
3. **Agent 流程**：改源码 → Bash `npm run build:plugins` → `reload_plugin_ui` → `dom_snapshot` / `screenshot` 验收。
4. **明确不做**：插件 `main` deactivate/IPC 重绑；新 IPC 热注入 preload。

### 2.4 CDP 远程调试

- **仅设置开关**：`AgentSettings.uiDev = { enableCdp?: boolean; cdpPort?: number }`（默认关 / 9222）。
- 变更后需**重启**；设置旁文案注明。
- 启动时 `applyCdpSwitchEarly()` 同步读设置并 `appendSwitch('remote-debugging-port')`；ready 后 `activateCdpInfo` 写 `userData/cdp.json` 并探测 `http://127.0.0.1:<port>/json/version` 置 `active`。
- 仅本机；打包版默认关。外部用 Playwright `connectOverCDP`，本轮不内置驱动脚本。

### 2.5 设置模型

```ts
uiDev?: {
  enableCdp?: boolean
  cdpPort?: number   // default 9222, 1024–65535
}
```

向后兼容：缺省视为关闭。`agent:settings:save` 透传 `uiDev`。`normalizeUiDev` 强制 `enableCdp === true` 才开启。

### 2.6 安全

- CDP = 完整控制该 Electron 进程；默认关、显式开启、仅 localhost。
- 截图/快照/重载 UI 不暴露 shell；snapshot 有 `maxChars` 截断。
- 截图前 `restore()` 最小化窗口。

## [S3] Out of Scope

- 插件 main 进程模块热替换、IPC `removeHandler`/重绑。
- 不重建窗口的情况下为**新**插件注入 preload IPC 白名单。
- 内置 Playwright 测试脚本仓库或 E2E 桌面录制。
- 打包版默认开启 CDP；远程非本机调试。

## Tasks

- [x] T1: UI 热加载链路 — acceptance: `devdash-plugin://` no-store；renderer 处理 `devdash:reload-plugin-ui` 清缓存并 `?t=` 重载；`reload_plugin_ui` 可在构建后无需重启看到插件 UI 变更 (covers: S2.3)
- [x] T2: 截图与 DOM 快照主进程服务 — acceptance: `capturePage` 输出 PNG 路径 + image content；`dom_snapshot` 返回有界文本树 (covers: S2.2, S2.6)
- [x] T3: SDK 自定义 tool 挂载 — acceptance: `createSdkMcpServer('devdash')` 注册 screenshot/dom_snapshot/reload_plugin_ui/cdp_info；`allowedTools` 含 `mcp__devdash__*`；permissionBridge 自动放行 (covers: S2.2)
- [x] T4: CDP 设置与启动开关 — acceptance: 设置可开关与端口；开启后重启，`userData/cdp.json` 存在且调试端口可连；`cdp_info` 返回状态 (covers: S2.4, S2.5)
- [x] T5: 验证与收尾 — acceptance: typecheck、build:plugins、electron-vite build、smoke 全 PASS；更新本文档 Report (covers: 全部)
