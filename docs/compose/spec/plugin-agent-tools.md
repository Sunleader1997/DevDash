---
feature: plugin-agent-tools
status: delivered
updated: 2026-10-24
source: main
---

# 插件自定义 Agent Tool（领域 MCP 入口）

## Report

**What was built** — 插件可在 `main.activate(ctx)` 里用 `ctx.registerTool(def, handler)` 暴露领域 MCP 工具，agent 直接调用 `mcp__<plugin-id>__<tool>`，与 UI IPC 共用领域模块。新增 `src/main/plugin/toolRegistry.ts`（`ToolParam` DSL 校验、zod 转换、`toCallToolResult`、`getByMcpName`）与 `src/main/agent/pluginToolServers.ts`（每插件一个 `createSdkMcpServer`、`buildAllToolServers`、热更新整表 `setMcpServers`）。`permissionBridge` 按注解分流：`readOnlyHint` 自动放行，`destructiveHint` 标 dangerous，其余弹窗可会话记住。`refresh_plugins` 后推送到活跃会话；`discover()` 会清掉消失插件的 tool，`activate` 失败会 `clearPluginTools` 以便重试。保留 id `devdash` 在 `toMeta` 拒绝。git-manager 注册 `git_status`/`git_log`/`git_commit` 三个交付 tool。skill 双份 + SYSTEM_APPEND + SDK template 四面同步「Agent 领域 Tool（registerTool）」。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` 前半（bundles / ipc suffixes / skills / sdk 文件）PASS，SDK `build.mjs` 因环境 `ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK` 失败（PRE-EXISTING，esbuild-wasm/OpenSSL 熵源，与本特性无关）。

**Journey log** — 1) `setMcpServers` 整表替换动态 server，热更新必须带上宿主 `devdash`，否则宿主工具会被拆掉。2) skill/SYSTEM_APPEND 与代码同级：`registerTool` 只活在运行时 API，不写说明书 agent 永远不会主动挂 tool。3) 评审补出三条：保留 id `devdash` 防 shadow 宿主 server；`discover` 清消失插件的 tool；`activate` 失败清 tool 防 duplicate 砖死重试。

## [S1] Problem

DevDash 的产品闭环是「用户让 agent 写插件，插件成为应用」。今天的验证与操作路径偏 **UI 模拟**：

- agent 用 `mcp__devdash__click` / `fill` / `wait_for` 去点插件界面；
- 领域能力只暴露给插件自己的 UI（`plugin:<id>:<suffix>` IPC），agent **够不着**。

领域语义不能只活在 UI 上。用户要的是「看看仓库状态 / 提交这些文件 / 看看最近提交」，而不是「点一下提交按钮」。UI 点按既慢又脆，且无法表达领域语义（仓库路径、提交范围、日志分页）。

需要一条 **插件自定义 MCP tool** 通路：插件在 `main` 里声明领域工具，agent 直接调用，像原生 `mcp__devdash__*` 一样自然。

```text
今天:  Agent ──click/fill──▶ git-manager UI ──IPC──▶ 插件 main ──▶ git status
目标:  Agent ──mcp__git-manager__git_status──▶ 插件 main ──▶ git status
                 （UI 工具仍保留，用于视觉验收）
```

## [S2] Design

### 2.1 总体

```text
Claude Agent SDK
  │
  ├─ mcp__devdash__*            宿主工具（截图 / DOM / UI 交互 / refresh）
  ├─ mcp__<plugin-id>__<tool>   插件领域工具（本特性）
  │
  ▼
Electron 主进程
  ├─ plugin/registry            发现清单、activate(ctx)
  ├─ plugin/toolRegistry        NEW：registerTool 账本 + schema→zod + 校验
  ├─ agent/devTools             宿主 MCP（现状）
  ├─ agent/pluginToolServers    NEW：按插件聚合 SdkMcpServer
  └─ agent/permissionBridge     按 annotations 分流只读 / 需审批
        │
        ▼
  插件 main handler（与 UI IPC 共用领域模块）
```

**原则**

| 原则 | 含义 |
| --- | --- |
| 领域能力在插件 | status / commit / log 等逻辑写在插件 main，不进宿主 |
| 宿主只做通道 | 注册、校验、命名空间、权限、MCP 桥接 |
| 与 IPC 同源 | 一个 handler 可同时 `registerIpc`（给 UI）和 `registerTool`（给 agent） |
| 默认需审批 | 非只读工具不因「插件声明」而静默放行 |

### 2.2 命名

| 层 | 形态 | 示例 |
| --- | --- | --- |
| 插件 id | `^[a-z0-9][a-z0-9-]*$`（现状） | `git-manager` |
| 工具名 | `^[A-Za-z][A-Za-z0-9_]*$`，长度 ≤ 64 | `git_status` / `git_commit` |
| MCP server | **每插件一个**，name = 插件 id | `git-manager` |
| Agent 全名 | `mcp__<plugin-id>__<tool>` | `mcp__git-manager__git_status` |

保留字：插件 id 不得为 `devdash`（宿主 server）。

**为何每插件一个 server 而不是塞进 `devdash`：**

1. 工具名不必再拼前缀，agent 看到 `git_status` 就是看状态，不是 `git_manager_git_status`。
2. 权限前缀干净：`mcp__git-manager__*`。
3. 插件卸载/刷新时按 server 整组热替换，不搅宿主工具。
4. 工具膨胀后可按 server 做 `alwaysLoad` / defer，不把宿主 prompt 撑爆。

### 2.3 插件侧 API

扩展 `PluginMainContext`（`registry.ts` + SDK template 同步）：

```ts
export type ToolParam = {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object'
  description?: string
  required?: boolean          // 默认 false
  values?: string[]           // type='enum' 必填
  items?: ToolParam           // type='array' 必填
  properties?: Record<string, ToolParam> // type='object' 可选
}

export type PluginToolDef = {
  name: string
  description: string         // 给模型看，写清楚何时用、返回什么
  params?: Record<string, ToolParam>
  annotations?: {
    readOnlyHint?: boolean      // 默认 false；true 且非 destructive 才可能 auto-allow
    destructiveHint?: boolean   // 默认 false；true 一律 dangerous
    idempotentHint?: boolean    // 默认 false；仅语义标注，不单独触发 auto-allow
    openWorldHint?: boolean     // 默认 false；调外部世界时建议 true
  }
}

export interface PluginMainContext {
  appPath: string
  userDataPath: string
  registerIpc(suffix: string, handler: (...args: unknown[]) => Promise<unknown>): void
  registerTool(
    def: PluginToolDef,
    handler: (args: Record<string, unknown>) => Promise<unknown>
  ): void
}
```

**Handler 约定**

- 入参已经过 schema 校验，失败不进 handler。
- 返回值必须是 JSON 可序列化；宿主包成 MCP `content:[{type:'text',text:JSON.stringify(...)}]`。
- 抛错 → `{ isError: true, content: [{ type:'text', text: 'error: …' }] }`。
- **长任务不要阻塞**：耗时 handler（如后续的 push/pull）应快速返回 `operationId`，另给查询 tool 轮询；或复用 `DevDashHost.tasks` 让 UI 可见。MCP 单次调用超时由 SDK `MCP_TOOL_TIMEOUT` / server `timeout` 控制。

**示例：git-manager main（本特性交付载体，与 UI IPC 共用 `gitService`）**

```ts
import type { PluginMainContext } from '@devdash/host' // 或本地 interface
import { gitService } from './git/gitService'

export default {
  id: 'git-manager',
  async activate(ctx: PluginMainContext) {
    // UI 用 IPC（现状）
    ctx.registerIpc('git:status', async (repoPath) => gitService.status(String(repoPath)))

    // Agent 用 Tool（本特性）——与 IPC 共用 gitService
    ctx.registerTool(
      {
        name: 'git_status',
        description: '查看仓库工作区状态（porcelain），返回变更文件列表与状态分类。',
        params: {
          repoPath: { type: 'string', description: '仓库根路径', required: true }
        },
        annotations: { readOnlyHint: true }
      },
      async (args) => gitService.status(String(args.repoPath))
    )

    ctx.registerTool(
      {
        name: 'git_log',
        description: '查看提交历史，返回 hash/author/date/message 列表。',
        params: {
          repoPath: { type: 'string', description: '仓库根路径', required: true },
          limit: { type: 'number', description: '最多返回条数，默认 50' },
          skip: { type: 'number', description: '跳过条数，默认 0' }
        },
        annotations: { readOnlyHint: true }
      },
      async (args) =>
        gitService.log(String(args.repoPath), Number(args.limit ?? 50), Number(args.skip ?? 0))
    )

    ctx.registerTool(
      {
        name: 'git_commit',
        description: '提交指定路径的变更。message 必填；paths 省略表示提交全部已暂存。',
        params: {
          repoPath: { type: 'string', description: '仓库根路径', required: true },
          message: { type: 'string', description: '提交说明', required: true },
          paths: {
            type: 'array',
            description: '相对仓库的文件路径列表',
            items: { type: 'string' }
          }
        },
        annotations: { idempotentHint: true }
      },
      async (args) =>
        gitService.commit(
          String(args.repoPath),
          String(args.message),
          Array.isArray(args.paths) ? args.paths.map(String) : undefined
        )
    )
  }
}
```

> 长任务约定仍适用：若后续挂 `git_push` / `git_pull` 等耗时操作，handler 应快速返回 `operation_id`，另注册查询 tool 轮询，禁止在 handler 里同步跑完整网络传输。

### 2.4 宿主：toolRegistry

新增 `src/main/plugin/toolRegistry.ts`：

```ts
export type RegisteredTool = {
  pluginId: string
  def: PluginToolDef
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

class ToolRegistry {
  register(pluginId: string, def: PluginToolDef, handler: Handler): void
  listByPlugin(): Map<string, RegisteredTool[]>
  clearPluginTools(pluginId: string): void   // 预留 reload / deactivate
  get(pluginId: string, name: string): RegisteredTool | undefined
  toSdkTools(pluginId: string): SdkMcpToolDefinition[]
}
export const toolRegistry = new ToolRegistry()
```

**校验（`register` 时即失败，不进账本）**

- `name` 匹配 `^[A-Za-z][A-Za-z0-9_]*$`，长度 ≤ 64。
- `description` 非空字符串。
- 同 `(pluginId, name)` 禁止重复。
- `params` 类型树合法：
  - `enum` 必须有非空 `values`；
  - `array` 必须有 `items`；
  - `object` 的 `properties` 递归合法；
  - 未知 `type` 拒绝。
- `annotations` 字段仅接受 boolean；缺失视为 `false`。

**schema → zod（宿主已有依赖 `zod@^4`）**

| ToolParam.type | zod |
| --- | --- |
| string | `z.string()` |
| number | `z.number()` |
| boolean | `z.boolean()` |
| enum | `z.enum(values)`（zod v4：`z.enum([...])`） |
| array | `z.array(itemsSchema)` |
| object | `z.object(propsSchema)` |

- `required === true` → 字段无 `.optional()`；否则 `.optional()`。
- `description` → `.describe(description)`。
- 插件 **不依赖 zod**；宿主写最小转换器。不支持的 JSON Schema 深度特性（unions、refinements）不进 v1。

**Handler 打包**

```ts
async function toCallToolResult(fn, args): Promise<CallToolResult> {
  try {
    const out = await fn(args)
    return { content: [{ type: 'text', text: JSON.stringify(out ?? null) }] }
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `error: ${msg(e)}` }] }
  }
}
```

### 2.5 宿主：MCP 挂载与热更新

`agentRuntime` 创建 query 时：

```ts
mcpServers: {
  devdash: createDevDashMcpServer(),
  ...buildPluginToolServers()   // { 'git-manager': createSdkMcpServer({...}), … }
},
allowedTools: ['mcp__devdash__*', ...pluginAllowPrefixes()]  // mcp__<id>__*
```

`agent/pluginToolServers.ts` 读 `toolRegistry`，每插件：

```ts
createSdkMcpServer({
  name: pluginId,
  version: '1.0.0',
  instructions: `Plugin ${pluginId} domain tools. Prefer these over UI click tools for domain operations.`,
  tools: toolRegistry.toSdkTools(pluginId),
  alwaysLoad: true   // v1；工具多了再按插件关
})
```

`pluginAllowPrefixes()` = 已注册 tool 的插件 id 列表 → `mcp__<id>__*`。

**热更新（`refresh_plugins` 之后）**

SDK `query.setMcpServers(map)` **整表替换动态 server**（省略的名字会被移除）。因此更新时必须带上宿主 `devdash` + 全部插件 server：

```ts
async function pushToolServers(session: ActiveSession) {
  await session.query.setMcpServers({
    devdash: createDevDashMcpServer(),
    ...buildPluginToolServers()
  })
}

export async function pushToolServersToAllSessions(): Promise<void> {
  for (const s of active.values()) {
    await pushToolServers(s).catch((e) => console.warn('[agent] setMcpServers failed', e))
  }
}
```

挂钩：

1. `refreshPlugins()` 在 `loadAllMains()` 后调用 `pushToolServersToAllSessions()`。
2. 新工具立即出现在下一轮对话工具列表，无需重启。
3. 移除的插件 tool 随 `buildPluginToolServers()` 结果消失（`setMcpServers` 会报 `removed`）。

**限制（v1 接受）**：`loadMain` 只 `activate` 一次（`loadedMain` Set）。改 **已加载** 插件的 tool 定义需重启，或后续做 `deactivate` + `clearPluginTools` + 重载。新建插件 / 首次 `registerTool` 走 refresh 即可。`git-manager` 虽导出 `deactivate()`，registry 现状不调用——本特性不改该生命周期。

### 2.6 权限

`permissionBridge.classifyTool` 扩展（输入 `toolName`，另需能查到 tool 注解）：

```text
mcp__<server>__<tool>
  server === 'devdash'          → 现行逻辑（只读 auto / 交互需审批）
  server 是已注册插件 id
      tool.annotations.destructiveHint  → { autoAllow: false, dangerous: true }
      tool.annotations.readOnlyHint && !destructiveHint
                                    → { autoAllow: true,  dangerous: false }
      其他（含 idempotentHint-only）   → { autoAllow: false, dangerous: false }
  未知 server                        → { autoAllow: false, dangerous: true }
```

`classifyTool` 需访问 `toolRegistry.get(server, tool)`；建议加可选参数或模块级引用，避免把整个账本传进 permissionBridge。

| 场景 | 行为 |
| --- | --- |
| 完全访问 | `canUseTool` 短路放行（与现有 agent 工具一致） |
| 审批 + `git_status` / `git_log`（readOnly） | auto-allow |
| 审批 + `git_commit`（无 readOnly） | 弹窗（可「允许并记住本会话」） |
| 审批 + 后续 destructive tool | 弹窗，标 dangerous |
| 会话记住 + 后续 `git_commit` | 由 `sessionAllowedTools` 放行（现状） |

**已定**：`git_commit` 等「改状态但可重试」的工具 **需审批，可会话记住**；不因 `idempotentHint` 自动放行。

`allowedTools` 含 `mcp__<id>__*` 只影响 SDK 装载/免提示候选，**不绕过** `canUseTool`。

### 2.7 与现有能力的关系

| 能力 | 用途 | 本特性后 |
| --- | --- | --- |
| `plugin:<id>:<suffix>` IPC | 插件 UI ↔ main | 保留；可与 tool 共用 handler |
| `mcp__devdash__click/fill/…` | UI 验收 | 保留为主视觉路径 |
| `mcp__devdash__refresh_plugins` | 重发现插件 | 附带 `pushToolServersToAllSessions` |
| 插件 domain tool | agent 直接操作应用 | **新增** |
| 外部 Playwright / CDP | 疑难调试 | 不变 |

### 2.8 安全

| 风险 | 缓解 |
| --- | --- |
| 恶意插件注册危险 tool | 信任模型不变：装进 plugins/ 的代码与宿主同权；tool 只是多一个 agent 入口。审计点 = 清单 + `registerTool` 校验 + main 源码 |
| agent 误触破坏性能力 | 默认需审批；`destructiveHint` 标 dangerous；完全访问才免弹窗 |
| 参数注入 | 入参 schema 校验后进 handler；handler 内自校业务（路径/URL/rev 白名单） |
| 工具名混淆 | 严格 name 正则 + 每插件独立 server 命名空间 |
| prompt 膨胀 | v1 `alwaysLoad: true`；后续按插件关 defer |

不在本特性做：沙箱化插件 main、细粒度 OAuth/能力位、跨插件调用授权。

### 2.9 Agent / Skill 表面（能力被发现的唯一入口）

**为什么必须改 skill**：`registerTool` 是运行时 API，不会出现在工具列表或错误信息里。agent 开发插件时的唯一说明书是 `devdash-plugin-dev` skill + `SYSTEM_APPEND`。这两处不写「插件可以挂领域 MCP tool」，agent 就只会写 UI + IPC，永远不会主动给 agent 挂工具。**skill 更新与代码实现同级，不是文档收尾。**

同步面（四份内容保持一致）：

| 位置 | 作用 |
| --- | --- |
| `bundled-skills/devdash-plugin-dev/SKILL.md` | 安装包分发主副本 |
| `.mimocode/skills/devdash-plugin-dev/SKILL.md` | 仓库内源副本 |
| `src/main/agent/agentRuntime.ts` `buildSystemAppend()` | 无 skill 加载时的硬约束/提示 |
| `bundled-plugin-sdk/template/src/main.ts` | 脚手架里的可运行示例 |

#### S2.9.1 skill frontmatter `description` 增触发词

现有 description 只提 IPC。须追加：`registerTool`、`ctx.registerTool`、`Agent Tool`、`领域 MCP 工具`、`给 agent 用的工具`、`插件暴露 tool`、`mcp__<plugin-id>__`。locales `brief` 同步一句「IPC + Agent Tool」。

#### S2.9.2 新增独立章节 `## Agent 领域 Tool（registerTool）`

放在「IPC 与安全」之后，建议文案骨架（实现时可润色，语义不得删）：

```markdown
## Agent 领域 Tool（registerTool）

插件不仅服务自己的 UI，还可以把领域能力暴露给 agent。
例如 git-manager：agent 应能调 `git_status` / `git_log` / `git_commit`，
而不是用 click/fill 去点侧栏和提交按钮。UI 工具仍保留，仅用于视觉验收。

### 何时挂 tool

- 有清晰领域语义的操作（查状态、看日志、提交、分支、任务状态…）→ **必须** `registerTool`。
- 纯视图状态、只给 UI 用的读写 → 保持 `registerIpc` 即可，不必挂 tool。
- 同一领域逻辑应 **IPC 与 Tool 共用** 一个 handler/领域模块，禁止写两套业务。

### API

在 `main.ts` 的 `activate(ctx)` 里调用：

```ts
ctx.registerTool(
  {
    name: 'git_commit',              // ^[A-Za-z][A-Za-z0-9_]*$，≤64
    description: '提交指定路径的变更。message 必填；paths 省略表示提交全部已暂存。',
    params: {
      repoPath: { type: 'string', description: '仓库根路径', required: true },
      message: { type: 'string', description: '提交说明', required: true },
      paths: { type: 'array', items: { type: 'string' }, description: '相对仓库的文件路径' }
    },
    annotations: { idempotentHint: true }
  },
  async (args) => gitService.commit(String(args.repoPath), String(args.message), args.paths)
)
```

`params.type` 仅支持：`string` | `number` | `boolean` | `enum` | `array` | `object`。
插件 **不要** 依赖 zod；宿主负责校验与转换。

### 注解与权限

| annotations | 审批模式行为 |
| --- | --- |
| `readOnlyHint: true` 且无 destructive | 自动放行 |
| 无 readOnly（含仅 `idempotentHint`） | 弹窗，可「允许并记住本会话」 |
| `destructiveHint: true` | 弹窗，标 dangerous |

- `description` 写清 **何时用、参数含义、返回什么**，这是模型的唯一文档。
- handler 返回值必须 JSON 可序列化；抛错 → MCP `isError`。
- 长任务（如 push/pull）立即返回 `operation_id`，另注册查询 tool 轮询；禁止在 handler 里同步跑完整网络传输/构建。

### 同步约定

| | 需要改 |
| --- | --- |
| IPC（UI ↔ main） | 三处：清单 `devdash.ipc` → `registerIpc` → `ui/api.ts` |
| **Agent Tool（agent ↔ main）** | **两处：`registerTool(def, handler)` + description/annotations** |

- Tool 走主进程内 MCP，**不需要** 预声明 `devdash.ipc`，也无 preload 白名单问题。
- Agent 全名固定为 `mcp__<plugin-id>__<tool>`；每插件一个 MCP server（name = 插件 id）。

### 验收路径

1. 构建（仓库 `npm run build:plugins` / 用户插件 `node <sdk>/build.mjs`）。
2. `mcp__devdash__refresh_plugins`（注册 tool 并热更新到会话）。
3. **直接调用** `mcp__<plugin-id>__<tool>` 验证领域行为。
4. 必要时再用 click/fill + screenshot 做视觉断言——领域正确性以 tool 调用为准，不要靠点 UI 模拟。
```

#### S2.9.3 现有章节的定点替换

| 位置 | 改法 |
| --- | --- |
| 架构速览 `main.ts` 注释 | `activate(ctx).registerIpc / registerTool` |
| 「IPC 与安全」标题 | 可改为「IPC / Tool 与安全」，同步表两行（IPC 三处 / Tool 两处） |
| 安装版贪吃蛇示例 step 2 注释 | `需要 IPC 则三处同步；需要 agent 操作则 registerTool` |
| Examples | 增一条：「让 agent 能直接看状态 / 提交」→ UI + `registerTool(git_status/git_log/git_commit)`，验收直接调 tool |
| `buildSystemAppend` 硬约束 | 增一行：`插件可在 main activate() 里 ctx.registerTool 暴露领域工具（mcp__<id>__<tool>）；领域操作优先走 tool，UI 工具仅视觉验收。` |
| `buildSystemAppend` 模板要点 | 增：`Tool 两处同步（registerTool + description/annotations），无需写入 devdash.ipc。` |
| template `main.ts` | 保留 `registerIpc` 示例旁增加 1 个带 annotations 的 `registerTool` 注释/示例 |

#### S2.9.4 不变的部分

- UI 验收工具表（`mcp__devdash__click/fill/…`）保留，但明确降级为 **视觉断言路径**。
- 领域优先原则写进 skill：`领域操作优先调用 mcp__<plugin-id>__*，不要用 UI 点按模拟业务。`

### 2.10 git-manager 交付 tool（示例即交付物）

API 完整示例见 S2.3。落地时在 `plugins/git-manager/src/main.ts` 激活时注册这 3 个 tool，与现有 UI IPC 共用 `gitService`：

| tool | 注解 | 对应 gitService | 参数 |
| --- | --- | --- | --- |
| `git_status` | `readOnlyHint: true` | `status(repoPath)` | `repoPath` 必填 string |
| `git_log` | `readOnlyHint: true` | `log(repoPath, limit, skip)` | `repoPath` 必填；`limit`/`skip` 可选 number |
| `git_commit` | `idempotentHint: true`（无 readOnly） | `commit(repoPath, message, paths?)` | `repoPath`、`message` 必填；`paths` 可选 string[] |

- 权限预期：`mcp__git-manager__git_status` / `git_log` auto-allow；`mcp__git-manager__git_commit` 弹窗（可会话记住）。
- `repoPath` 仍由 handler / gitService 做路径守卫（`path.relative` + 拒 `..`），与 IPC 同一约束。
- 不为 tool 另写业务；`registerIpc` 与 `registerTool` 调同一 `gitService` 方法。

### 2.11 落地文件面（实现备忘）

| 文件 | 变更 |
| --- | --- |
| `src/main/plugin/toolRegistry.ts` | **新建**：账本、校验、`toSdkTools` |
| `src/main/plugin/registry.ts` | `PluginMainContext.registerTool`；`createContext` 注入 |
| `src/main/agent/pluginToolServers.ts` | **新建**：`buildPluginToolServers` / `pushToolServersToAllSessions` |
| `src/main/agent/agentRuntime.ts` | 初始 `mcpServers` 合并插件 server；`allowedTools` 扩展 |
| `src/main/agent/permissionBridge.ts` | `classifyTool` 按插件 tool 注解分流 |
| `src/main/uiDev/refreshPlugins.ts` | `loadAllMains` 后 `pushToolServersToAllSessions` |
| `plugins/git-manager/src/main.ts` | 注册 `git_status` / `git_log` / `git_commit` |
| `bundled-plugin-sdk/template/src/main.ts` | 加 `registerTool` 示例 |
| `bundled-skills/devdash-plugin-dev/SKILL.md` + `.mimocode` 副本 | Tool 两处同步、领域优先 |
| `src/main/agent/agentRuntime.ts` SYSTEM_APPEND | 同 skill 内容 |
| `scripts/smoke.mjs` | 覆盖 toolRegistry 校验契约（可选） |

## [S3] Work Breakdown

- [x] T1: `toolRegistry` + `PluginToolDef`/`ToolParam` 类型 + name/params 校验 — acceptance: 非法 name/重复注册/非法 params 被拒；合法注册可枚举 `listByPlugin` (covers: S2.4)
- [x] T2: `ToolParam` → zod 转换器 + `toCallToolResult` 返回值打包 — acceptance: 六种 type 可转；handler 抛错进 `isError` (covers: S2.4)
- [x] T3: `ctx.registerTool` 注入 `PluginMainContext` + SDK template 示例 — acceptance: template 与 git-manager 可注册；`npm run typecheck` 过 (covers: S2.3, S2.9)
- [x] T4: `buildPluginToolServers` + query 初始 `mcpServers`/`allowedTools` — acceptance: 会话启动后可见 `mcp__<id>__<tool>` (covers: S2.5)
- [x] T5: `permissionBridge` 按 annotations 分流 — acceptance: readOnly auto；idempotent/未知走审批；destructive 标 dangerous；full 短路 (covers: S2.6)
- [x] T6: `refresh_plugins` 后 `setMcpServers` 热更新 — acceptance: 新插件 tool 不需重启即可调用；消失插件 server 被移除；activate 失败可重试 (covers: S2.5; depends: T4)
- [x] T7: git-manager 领域 tool — acceptance: `git_status`/`git_log` auto-allow 可调；`git_commit` 审批弹窗；与 IPC 共用 gitService (covers: S2.10; depends: T3, T5)
- [x] T8: skill / SYSTEM_APPEND / template 四面同步 — acceptance: `bundled-skills` 与 `.mimocode` 副本均含「Agent 领域 Tool（registerTool）」章节；description 含 registerTool 等触发词；`buildSystemAppend` 硬约束含 registerTool；template `main.ts` 有带 annotations 的示例；`typecheck`/`build:plugins`/smoke 不回归 (covers: S2.9; depends: T3)

**建议落地顺序**：T1→T2→T3→T4（最小可用）→ T5→T6→T7→T8。

## [S4] Decisions

1. **每插件一个 MCP server**，名 = 插件 id；不塞进 `devdash`。
2. **register-first**：`ctx.registerTool` 是唯一真源；清单不强制再抄一份 tools（避免 IPC 式双份漂移）。v1 不做 `devdash.tools` 清单回声。
3. **插件不依赖 zod**：用轻量 `ToolParam` DSL，宿主转换（宿主已有 `zod@^4`）。
4. **默认需审批**；仅 `readOnlyHint && !destructiveHint` 才 auto-allow。`idempotentHint` **不**触发 auto-allow；`git_commit` 仍弹窗，可「允许并记住本会话」。
5. **handler 与 UI IPC 共用领域模块**，不为 tool 另写一套业务。
6. **热更新整表 `setMcpServers`**（含宿主 `devdash`），挂 `refresh_plugins`。
7. **v1 不支持**已 activate 插件的 tool 定义热替换（需重启）；新建插件 refresh 即可。
8. **v1 交付以 git-manager 为示例与载体**（`git_status` / `git_log` / `git_commit`），文档与 skill 均用 git-manager，不另造音乐播放器等虚构插件。
9. **skill / SYSTEM_APPEND 与代码同级交付**：`registerTool` 只存在于运行时 API，skill 是 agent 的唯一能力说明书；T8 不是文档收尾，而是「agent 知道并主动挂 tool」的必要条件（见 S2.9）。

## [S5] Non-goals

- 不把外部 stdio/HTTP MCP server 交给插件任意挂载（后续可加受控声明）。
- 不做插件 main 沙箱 / 能力位授权。
- 不替代 UI 验收工具；截图与点按仍是视觉正确性主路径。
- 不另写虚构示例插件（如音乐播放器）；示例、skill、验收一律用 git-manager。
- 不在本特性扩展 git-manager 额外能力（push/pull/分支切换等另开任务）；只挂 `git_status` / `git_log` / `git_commit` 三个 tool。
- 不做清单 `devdash.tools` 静态回声 / 未加载 main 前的能力发现（refresh 后自然可见）。
- 不做宿主侧 `list_plugin_tools` 元工具（`setMcpServers` 后 agent 可直接看到工具列表）。

## [S6] Open

已关闭：

1. ~~清单 `devdash.tools` 回声~~ → v1 不做（见 Decisions 2 / Non-goals）。
2. ~~`git_commit` 类半破坏性权限~~ → 需审批，可会话记住（见 Decisions 4）。
3. ~~`list_plugin_tools` 元工具~~ → 不做（见 Non-goals）。

仍开放（不阻塞实现）：

1. 工具很多后是否按插件关闭 `alwaysLoad`、走 tool search defer？（v1 全开，观察 prompt 体积再定）
2. 已 activate 插件的 tool 热替换：是否值得做 `deactivate` + `clearPluginTools` 生命周期？（v1 重启即可）
