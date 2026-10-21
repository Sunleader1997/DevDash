---
feature: claude-agent-integration
status: delivered
updated: 2026-10-26
branch: main
commits: 9c9ea08..9c9ea08
---

# Claude Agent SDK 集成：对话式插件开发

## Report

**What was built** — 在 DevDash 宿主内集成 `@anthropic-ai/claude-agent-sdk`（非插件）。左上角「新建任务」打开对话工作区，左下角「设置」配置模型：名称 / 接口地址 / 接口协议（Anthropic Messages）/ API Key，支持测试连通、拉取模型列表选型，输入/输出上下文长度可配（默认 1M / 64k）。对话输入框下方 footer 控制条仿 MiMo Desktop：审批模式 ↔ 完全访问切换、模型切换、`/` 引用 skill、`#` 引用插件。Agent 在仓库内自治开发 `plugins/*`，危险操作经 UI 确认（完全访问则跳过）。会话/消息/设置持久化在 userData。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS（git-manager）；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS。敏感路径匹配器对绝对/相对路径用例 6/6 OK。真实模型对话需在设置中配置 API Key / 订阅登录后验证。

**Journey log** —
1. 用户指令禁止 `.worktree`/新分支，compose-next worktree 门禁被覆盖，全程在 cwd/main 落地。
2. `npm install @anthropic-ai/claude-agent-sdk` 直连卡住，开代理后装上 v0.3.306。
3. SDK `options.env` 是替换而非合并，必须 `{...process.env, ...mapped}`；streaming input 的队列必须建在 generator 外，否则首条消息在子进程 initialize 前被丢。
4. 一轮对话会有多条 `type:'assistant'`，必须 append 而非 replace；`result.result` 不能覆盖助手正文。
5. 敏感路径守卫必须 `path.resolve` + `path.relative` 后再匹配，原始字符串前缀会漏掉绝对 `file_path`。

## [S1] Problem

DevDash 目前只能人工开发插件。需要像 MiMo Desktop 一样，在应用内通过对话让 Agent 自主新建/修改 `plugins/*` 插件应用，形成「用对话开发插件」的核心闭环。

用户可见目标：

1. 左下角「设置」弹窗配置模型（Anthropic 官方 + 自定义兼容端点）。
2. 左上角「新建任务」打开新对话；任务可列表切换、可续聊。
3. 对话中可切换模型。
4. 输入框用 `#` 引用插件应用，注入清单/路径/改动指引上下文。
5. Agent 在仓库内自治开发插件；危险操作（删文件、强制 git 等）需 UI 确认。

## [S2] Design

### [S2.1] 技术选型与进程边界

| 层 | 选型 |
| --- | --- |
| Agent 运行时 | `@anthropic-ai/claude-agent-sdk`（`query()` 流式 + streaming input） |
| 模型配置 | 设置存 userData；按预设注入 `env`（`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`）与 `options.model` |
| 会话 | SDK session（`resume` / `listSessions` / `getSessionMessages`）+ 本地任务索引 |
| 权限 | `canUseTool` → IPC 弹确认；自动放行只读与工作区内常规读写；危险模式需确认 |
| UI | 宿主壳内建 Agent 工作区（**非插件**） |

进程边界：

- **main**：`src/main/agent/*` 封装 SDK、会话生命周期、权限桥、模型配置读写。
- **preload**：在既有 invoke 白名单上增加 `agent:*` 通道，并新增 `on` 事件订阅（流式推送）。
- **renderer**：侧栏（新建任务 / 任务列表 / 插件列表 / 设置入口）+ 对话工作区（消息流、composer、`#` 引用、模型切换、权限确认）。

与插件边界：Agent 能力属平台层，不进入 `plugins/*`。插件开发是 Agent 的工作目标，不是宿主 UI 插件。

### [S2.2] 目录与模块

```
src/main/agent/
  modelConfig.ts      # 模型预设 CRUD、env 映射
  sessionStore.ts     # 任务索引（title、sessionId、updatedAt、model）
  agentRuntime.ts     # query() 启停、流转发、setModel、resume
  permissionBridge.ts # canUseTool → renderer 确认 → PermissionResult
  ipc.ts              # agent:* 通道注册

src/renderer/src/agent/
  AgentWorkspace.tsx  # 对话主界面
  TaskList.tsx        # 任务列表
  MessageList.tsx     # 用户/助手/工具事件
  Composer.tsx        # 输入、# mention、发送
  MentionMenu.tsx     # 插件选择器
  SettingsModal.tsx   # 模型配置
  PermissionDialog.tsx
  agentApi.ts         # invoke/on 封装
```

### [S2.3] 模型配置

存储：`app.getPath('userData')/agent-settings.json`（不进 git）。

```ts
type ModelPreset = {
  id: string
  label: string
  provider: 'anthropic' | 'custom'
  model: string                 // 传给 options.model
  baseUrl?: string              // → ANTHROPIC_BASE_URL
  apiKey?: string               // → ANTHROPIC_API_KEY（custom）或 ANTHROPIC_AUTH_TOKEN
  authMode?: 'api-key' | 'subscription'  // anthropic 时使用
}

type AgentSettings = {
  presets: ModelPreset[]
  activePresetId: string
}
```

映射规则：

| provider/auth | env |
| --- | --- |
| anthropic + api-key | `ANTHROPIC_API_KEY` |
| anthropic + subscription | 不注入 key，依赖本机 `claude` 登录态（SDK 子进程继承） |
| custom | `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`） |

`options.env` 必须 `{ ...process.env, ...mapped }`，避免丢掉 `PATH`。

对话内切换模型：streaming input 会话上调用 `query.setModel(modelId)`；切换后在任务索引记录 `lastModel`。若 preset 的 baseUrl/key 变化，下一轮新建 query 时生效（当前进程 env 不可热替换 base url）。

### [S2.4] 任务与会话

- 「新建任务」→ 创建本地 task 记录（UUID）+ 空对话；首次发送时 `query({ prompt: stream, options: { cwd: repoRoot, title, model, systemPrompt, canUseTool, permissionMode: 'default', includePartialMessages: true } })`。
- 多轮：streaming input（`AsyncIterable<SDKUserMessage>`）保持进程，`setModel` 可用；断线/重启后用 `resume: sessionId` 恢复（SDK persist 默认开启）。
- 任务列表数据源：本地 `sessionStore` 索引 ∪ `listSessions({ dir: repoRoot })`；标题优先自定义，否则首条用户消息截断。
- 删除任务：删本地索引；SDK transcript 保留（不主动 `deleteSession`，避免误删历史）。

持久化路径：

- 设置：`userData/agent-settings.json`
- 任务索引：`userData/agent-tasks.json`
- SDK 会话：SDK 默认（Claude Code 会话目录），`cwd` 固定为 DevDash 仓库根

### [S2.5] 对话 UI 与 `#` 引用

布局（对齐现有 Apple HIG 侧栏）：

```
┌ sidebar ─────────────┐ ┌ workspace ─────────────────┐
│ [+ 新建任务]          │ │ 任务标题 · 模型切换器        │
│ 任务列表…             │ │ ────────────────────────   │
│ 插件应用…（现有列表）   │ │ 消息流（user/assistant/tool）│
│                      │ │ ────────────────────────   │
│ [⚙ 设置]  ← 左下角   │ │ [# 引用 chips] [输入框] [发送]│
└──────────────────────┘ └────────────────────────────┘
```

- 点「新建任务」或任务项 → `activeView = 'agent'`，主区渲染 `AgentWorkspace`；点插件项 → 现有插件 UI。
- Composer 输入 `#` 弹出 `MentionMenu`（来自 `plugin:list`）；选中后插入 chip（`#git-manager`）。
- 发送时将 chips 解析为上下文前缀，拼进用户消息（或 system append）：

```
【插件上下文】
- id: git-manager
- title: Git 管理
- package: plugins/git-manager
- 可读关键入口: package.json (devdash 清单), src/main.ts, src/ui/
- 任务指引: 可新建或修改该插件；改完需 npm run build:plugins；IPC 三处同步（清单 devdash.ipc / main registerIpc / ui api.ts）。
```

- 模型切换器列出 `settings.presets`；切换即 `agent:model:switch`。

### [S2.6] Agent 权限

`permissionMode: 'default'` + `canUseTool`：

| 类别 | 策略 |
| --- | --- |
| 只读（Read/Glob/Grep 等） | 自动 allow |
| 工作区内常规写（Edit/Write 于 repo 内非破坏路径） | 自动 allow |
| Bash：`npm run typecheck` / `build:plugins` / `node scripts/smoke.mjs` 等白名单 | 自动 allow |
| 删除文件、`rm`、`git push --force`、`git reset --hard`、改 `src/main` 安全敏感路径、仓库外路径 | `canUseTool` 发 IPC 确认 |

确认流：main 发 `agent:permission:request`（webContents.send）→ renderer 弹窗 → `agent:permission:respond` → `PermissionResult`（allow/deny + message）。

### [S2.7] System Prompt（自定义 append）

在 SDK `systemPrompt` 使用 `{ type: 'preset', preset: 'claude_code', append: DEV_DASH_AGENT_APPEND }`：

- 角色：DevDash 插件开发助手，目标是通过新建/修改 `plugins/*` 交付可加载插件。
- 硬约束：遵守 `AGENTS.md`（禁止 worktree/新分支；typecheck/build:plugins/smoke）；插件清单与 IPC 三处同步；`plugins/*/dist` 不提交。
- 交付后建议用户运行 `npm run build:plugins` 并刷新插件列表。

### [S2.8] IPC 契约（host 静态通道）

| 通道 | 方向 | 载荷 |
| --- | --- | --- |
| `agent:settings:get` | invoke | → `AgentSettings` |
| `agent:settings:save` | invoke | `AgentSettings` → ok |
| `agent:tasks:list` | invoke | → `AgentTask[]` |
| `agent:tasks:create` | invoke | `{ title? }` → `AgentTask` |
| `agent:tasks:delete` | invoke | `taskId` |
| `agent:messages:history` | invoke | `taskId` → `ChatMessage[]` |
| `agent:messages:send` | invoke | `{ taskId, text, pluginRefs[], modelId? }` → `{ ok }` |
| `agent:model:switch` | invoke | `{ taskId, modelId }` |
| `agent:permission:respond` | invoke | `{ requestId, allow, reason? }` |
| `agent:session:cancel` | invoke | `taskId` |
| `agent:event` | on | `{ type: 'message' \| 'permission' \| 'status' \| 'error', ... }` |

preload：`HOST_CHANNELS` 加入上列 invoke；新增 `on(channel, listener)` 仅允许 `agent:event`。`window.devdash.on('agent:event', cb)` 返回退订函数。

### [S2.9] 错误行为

- SDK 启动失败（缺 native binary / 未配置 key）：任务内显示可操作错误文案（检查设置 / `npm i @anthropic-ai/claude-agent-sdk` / 登录）。
- 发送时无 activePreset：打开设置弹窗并提示。
- 权限确认超时（120s）：deny，文案说明。
- 流式中断：保留已收消息，状态标 `error`，可再次发送。

## [S3] Out of Scope

- 不把 Agent 做成 `plugins/*` 插件。
- 不做多仓库/多 workspace 的 Agent；`cwd` 固定 DevDash 仓库根。
- 不做语音、多模态附件、Agent 子代理编排 UI。
- 不做 OpenAI Chat Completions 协议适配层（仅 Anthropic 兼容 baseURL）。
- 不做会话云同步/多设备。

## Tasks

- [x] T1: 依赖与模型配置模块 — acceptance: 安装 `@anthropic-ai/claude-agent-sdk`；`modelConfig` 读写 `agent-settings.json` 并映射 env（covers: S2.1, S2.3）
- [x] T2: Agent 运行时与会话 — acceptance: `agentRuntime` 能起 streaming query、转发消息、resume、setModel、cancel（covers: S2.1, S2.4, S2.8）
- [x] T3: 权限桥 — acceptance: `canUseTool` 危险操作走 UI 确认，只读/白名单自动放行（covers: S2.6）
- [x] T4: IPC + preload — acceptance: `agent:*` 通道白名单 + `agent:event` 事件可订阅（covers: S2.8）
- [x] T5: 设置弹窗与模型切换 — acceptance: 左下角打开设置，可增删改预设；对话内可切换模型（covers: S2.3, S2.5）
- [x] T6: 对话 UI + `#` 引用 — acceptance: 新建任务/任务列表/消息流/composer；`#` 选插件并注入上下文（covers: S2.5, S2.7）
- [x] T7: 验证与收尾 — acceptance: `typecheck` + `build:plugins` + `electron-vite build` + smoke 通过；更新本文档 Report（covers: 全部）
