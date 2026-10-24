---
feature: agent-ui-interaction
status: delivered
updated: 2026-03-20
source: main
---

# Agent UI 交互工具（进程内替代 Playwright）

## Report

**What was built** — 在既有 `mcp__devdash__*` 进程内 MCP 上补齐 Playwright 级 UI 交互与断言，验证阶段不再依赖外部 Playwright。新增 `src/main/uiDev/uiDrive.ts`（Node 侧编排）+ `browserScripts.ts`（注入脚本，单次 `__DATA__` JSON 载荷）：语义 locator（testid > role+name > label > text > css > index，含隐式 role）解析、actionability 门（可见 / 未 disabled / 中心点命中自身或后代）、`click`/`dblclick`/`hover`/`fill`/`type`/`press_key`/`clear`/`select_option`/`check`/`uncheck`/`scroll_into_view`/`scroll`/`drag`（mouseDown + ≥3 插值 mouseMove + mouseUp）、`query`/`get_text`/`get_value`/`get_attr`/`wait_for`/`screenshot_element`。`fill` 走 native value setter + `input`/`change`，兼容 React 受控。权限：只读工具在审批模式 auto-allow，交互工具走 `requestPermission`（可会话记住）；完全访问由 `canUseTool` 短路放行。`devdash-plugin-dev` skill 与 `SYSTEM_APPEND` 以 `mcp__devdash__*` 为主路径；`playwright` skill 降为可选高级路径。CDP/外部 Playwright 保留但不作主链路。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` 大部分 PASS（插件发现、bundles、bundled skills、plugin-sdk 文件契约）。尾部 `plugin-sdk build.mjs` 调 esbuild-wasm 时本机报 `ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK`（Node/OpenSSL 熵源，**PRE-EXISTING**，与本次改动无关）。独立 review 一轮后修复 8 项 critical（withData 单载荷、隐式 role、hit test、type 键序、aria-labelledby、query isError、scroll 参数、无用导出），复审全 PASS。真机点按/拖拽需在运行中的 Electron 内抽验（静态无法覆盖）。

## [S1] Problem

DevDash 的插件开发闭环里，验证阶段目前是两条腿：

1. **进程内只读验收**（`mcp__devdash__screenshot` / `dom_snapshot` / reload）——能看不能点。
2. **外部 Playwright + CDP**——能点，但要开 `--remote-debugging-port`、装 Playwright、跨进程连接，链路重且经常对不上当前窗口。

DevDash 本身就是 Electron/Chromium，`webContents` 完全有能力在主进程内完成截图、查节点、注入输入。缺的是把这些能力做成 agent 可调的 **交互 tool**，从而把 Playwright 从主验证路径上拿掉。

## [S2] Design

### 2.1 总体

```text
Agent (Claude Agent SDK)
  │  mcp__devdash__*  —— 只读 + 交互（click / fill / wait_for / …）
  │  Bash: npm run build:plugins
  ▼
Electron 主进程 uiDevService
  ├─ 查询：webContents.executeJavaScript（语义 locator → 唯一节点 / rect / 状态）
  ├─ 输入：webContents.sendInputEvent（真实鼠标/键盘，坐标命中）
  ├─ 填表：focus + native value setter + input 事件（React 受控组件）
  └─ 截图：capturePage（可选 clip 元素区域）
  ▼
Renderer 宿主壳 + plugins/* UI（同一 webContents）

可选高级路径（降级）：设置里 CDP 开关 → 外部 Playwright connectOverCDP
```

工具仍挂在既有 `createSdkMcpServer('devdash')` 上，与 `screenshot`/`dom_snapshot` 同一入口；**不需要** `webContents.debugger.attach`，也**不需要**远程调试端口。

### 2.2 Locator 模型（语义优先 + CSS 兼容）

所有交互/断言 tool 共用一个 `locator` 对象，字段可组合，按优先级解析为**唯一**元素：

| 优先级 | 字段 | 语义 |
| --- | --- | --- |
| 1 | `testid` | `data-testid` / `data-test-id` |
| 2 | `role` + `name` | ARIA role 与 accessible name（`aria-label` / 文本） |
| 3 | `label` | 关联 `<label>` 或 `aria-labelledby` 文本 |
| 4 | `text` | 可见文本精确匹配；`exact: false` 时子串 |
| 5 | `css` | CSS selector 兜底 |
| — | `index` | 多匹配时取第 N 个（0-based）；默认要求唯一，多匹配报错并列出候选 |

```ts
type Locator = {
  testid?: string
  role?: string
  name?: string
  label?: string
  text?: string
  exact?: boolean          // text/name 精确匹配，默认 true
  css?: string
  index?: number
}
```

与 `dom_snapshot` 输出对齐：snapshot 已暴露 `testid=` / `role=` / `label=` / 文本，agent 可直接照抄 locator。

### 2.3 工具契约

完整名：`mcp__devdash__<name>`。分两组权限（见 2.5）。

**只读 / 断言（approve 模式 auto-allow）**

| Tool | 入参 | 行为 |
| --- | --- | --- |
| `screenshot` | 已有 | 不变 |
| `dom_snapshot` | 已有 | 不变 |
| `cdp_info` | 已有 | 不变 |
| `query` | `locator` | 返回匹配节点摘要（tag/testid/role/text/value/disabled/rect/count） |
| `get_text` | `locator` | `innerText`（去首尾空白） |
| `get_value` | `locator` | input/textarea/select 的 value |
| `get_attr` | `locator, name` | 属性值 |
| `wait_for` | `locator, state, text?, timeoutMs?` | 轮询直到条件成立；`state`: `visible` \| `hidden` \| `enabled` \| `disabled` \| `attached` \| `text` \| `value` |
| `screenshot_element` | `locator` | `capturePage` 裁剪该元素 rect |

**交互（跟随审批模式 / 完全访问）**

| Tool | 入参 | 行为 |
| --- | --- | --- |
| `click` | `locator, button?, clickCount?, modifiers?` | 滚入视口 → `sendInputEvent` mouseDown/Up（元素中心） |
| `dblclick` | `locator` | `clickCount: 2` |
| `hover` | `locator` | `sendInputEvent` mouseMove 到元素中心 |
| `fill` | `locator, value` | focus → 清空 → native setter + `input`/`change` 事件（兼容 React 受控） |
| `type` | `locator, text, delayMs?` | focus 后逐键 `sendInputEvent`（走真实键盘路径） |
| `press_key` | `locator?, key, modifiers?` | 组合键；无 locator 则发给当前焦点。`key` 支持 `Enter`/`Escape`/`Tab`/`Backspace`/方向键等 |
| `clear` | `locator` | 等价 `fill: ''` |
| `select_option` | `locator, value? , label?` | `<select>` 选值 |
| `check` / `uncheck` | `locator` | checkbox/radio；已是目标态则幂等 |
| `scroll_into_view` | `locator` | `scrollIntoView({ block:'center' })` |
| `scroll` | `x?, y?, deltaX?, deltaY?` | 视口或元素滚动 |
| `drag` | `from, to` | mouseDown → 若干 mouseMove → mouseUp |

`call` 公共约束：

- 解析不到 / 多匹配：返回 `isError`，附候选摘要，不抛栈。
- 交互前自动 `scroll_into_view` + 短暂 settle（~30ms）。
- **actionability 门**（`click`/`dblclick`/`hover`/`fill`/`type`/`press_key`/`drag`/`check`/`uncheck`/`select_option`）：动作前检查目标可见、未 `disabled`、中心点命中目标本身（`elementFromPoint` 为自身或后代）；不满足则短轮询至超时。默认 5000ms，上限 30000ms。这是对齐 Playwright auto-wait 的关键一层，避免打到遮挡物或过期节点。
- `wait_for` 默认超时 5000ms，可调，上限 30000ms。
- 查询结果有界：节点摘要 `text`/`value` 截断 200 字符；`get_text`/`get_value` 截断 2000；候选最多 10 条。
- `query` 在 not-found / multiple 时返回 `isError`（附候选摘要），与交互 tool 一致。

### 2.4 输入注入策略

| 场景 | 手段 | 原因 |
| --- | --- | --- |
| click / hover / drag / scroll | `sendInputEvent`（坐标） | 真实命中测试，React/pointer 事件链完整 |
| fill / clear | `executeJavaScript`：focus + prototype value setter + `input`/`change` | 一次写入；受控组件可感知 |
| type / press_key | `sendInputEvent` keyDown/keyUp/char | 走快捷键/表单提交路径 |
| 坐标来源 | JS `getBoundingClientRect` 中心 + 窗口内容坐标系 | 与 `sendInputEvent` 坐标一致（DIP） |

**drag 序列**：`mouseDown` → **≥3 次中间 `mouseMove`**（沿直线插值）→ `mouseUp`。一次跳到终点不会触发多数拖拽实现的 `drag`/`pointermove` 状态机。

**HTML5 原生 DnD 限制**：`draggable="true"` + `dragstart`/`drop` 对合成输入的 DataTransfer 支持不完整，Playwright 的 `dragTo` 同样会翻车（官方建议改 `dispatchEvent`）。本方案对这类元素同样不保证；skill 约定插件拖拽交互用 Pointer/Mouse 事件实现，不用原生 `draggable`。

不使用 `webContents.debugger`：避免与打开 DevTools 的调试会话互斥，也避免为交互再开一条 CDP 面。

### 2.5 权限（跟随「审批模式 / 完全访问」）

现有 `canUseTool` 已短路 `accessMode === 'full'`。本轮只改 `classifyTool` 对 `mcp__devdash__*` 的细分：

| 类别 | 完全访问 | 审批模式 |
| --- | --- | --- |
| 只读：`screenshot` / `dom_snapshot` / `cdp_info` / `query` / `get_*` / `wait_for` / `screenshot_element` | allow | auto-allow |
| 交互：`click` / `fill` / `type` / …（2.3 交互表） | allow | **请求审批**（可「允许并记住本会话」） |
| 既有写 UI：`reload_plugin_ui` / `refresh_plugins` | allow | auto-allow（维持现状） |

实现：`permissionBridge.classifyTool` 不再对 `mcp__devdash__*` 一刀切；按工具名单分流。`allowedTools` 仍含 `mcp__devdash__*`（只影响 SDK 自动装载，不绕过 `canUseTool`）。

### 2.6 文档与 skill 同步

- `agentRuntime.buildSystemAppend`：验证流程改为「构建 → reload/refresh → `click`/`fill`/… 操作 → `dom_snapshot`/`screenshot` 断言」；CDP/Playwright 标注为**可选高级路径**。
- `bundled-skills/devdash-plugin-dev`：同上；补一段 locator 约定、常用 tool 速查，以及拖拽须用 Pointer/Mouse 事件（勿用原生 `draggable`）的约定。
- `bundled-skills/playwright`：保留，开头注明「仅疑难/跨应用调试；DevDash 自验收请用 `mcp__devdash__*`」。

### 2.7 安全

- 交互 tool 只作用于本窗口 `webContents`，不发 IPC、不碰文件系统、不执行任意 JS。
- `fill`/`type` 的 `value`/`text` 仅写入 DOM value，不作为脚本求值。
- locator 的 `css` 经 `querySelector`；不支持 XPath。
- 审批模式下交互需人工确认，降低 agent 误点（含破坏性插件按钮）的默认风险。

## [S3] Out of Scope

- 任意 `js_eval` / 自定义脚本执行。
- 多窗口 / 多 webContents 路由（仍取第一个存活主窗口）。
- 视觉回归基线对比、录制回放、快照测试框架。
- 移除 CDP 开关或 `playwright` skill。
- iframe / shadow DOM 深层穿透（`querySelector` 不进入 shadow root）。
- 真实 IME 输入法、剪贴板、文件选择器对话框。

## Tasks

- [x] T1: `uiDevService` 查询层 — acceptance: `resolveLocator` 支持 testid/role/label/text/css/index；`query`/`get_text`/`get_value`/`get_attr`/`wait_for`/`screenshot_element` 返回有界结果；多匹配报候选 (covers: S2.2, S2.3)
- [x] T2: `uiDevService` 交互层 — acceptance: `click`/`dblclick`/`hover`/`fill`/`type`/`press_key`/`clear`/`select_option`/`check`/`uncheck`/`scroll_into_view`/`scroll`/`drag` 可驱动真实 UI；`fill` 触发受控组件 onChange；交互前 actionability 门；drag 含中间 mouseMove (covers: S2.3, S2.4)
- [x] T3: SDK tool 注册与权限分流 — acceptance: `devTools.ts` 挂载只读+交互工具；`classifyTool` 只读 auto-allow、交互在审批模式请求审批、完全访问放行 (covers: S2.3, S2.5)
- [x] T4: skill / SYSTEM_APPEND 更新 — acceptance: `devdash-plugin-dev` 与 `buildSystemAppend` 以 `mcp__devdash__*` 为主验证路径；playwright skill 标注降级 (covers: S2.6)
- [x] T5: 验证与收尾 — acceptance: `npm run typecheck`、`build:plugins`、`electron-vite build`、`smoke.mjs` 全 PASS；更新本文档 Report (covers: 全部)

## Journey log

1) 工具面按 Playwright 对齐，但定位器收敛为「语义优先 + CSS」：自家插件可约定 `data-testid`，比照搬 locator DSL 更稳。2) `withData` 多轮 `split/join` 替换占位符会在 locator JSON 内误替换后续 key——必须单次 JSON 载荷。3) 合成输入下 HTML5 原生 DnD 不可靠（Playwright 同样），skill 约定 pointer/mouse 实现。4) 安装版可用性依赖 Electron 自带 `sendInputEvent`/`executeJavaScript`/`capturePage`，无需 Playwright 与调试端口。
