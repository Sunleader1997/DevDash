---
name: devdash-plugin-dev
description: DevDash 插件应用开发规范与工程约定。Use when adding or modifying DevDash sub-app plugins, implementing npm-installable plugins, scaffolding user plugins with the plugin SDK, wiring Electron IPC, registering Agent tools (ctx.registerTool / 领域 MCP 工具 / mcp__<plugin-id>__), or asking how to "写插件 / 新增子应用 / 改 Git 管理 / 插件清单怎么配 / 贪吃蛇插件 / 给 agent 用的工具 / 插件暴露 tool". Covers plugin manifest, DevDashHost, dual workflows (source repo vs installed app), registerIpc, registerTool, and build scripts.
---

# DevDash 插件应用开发

## Important

- 插件必须可被主应用通过 `package.json` 的 `devdash` 清单发现；不要硬编码插件 UI 到宿主 React 树。
- 禁止创建 `.worktree`、禁止新建功能分支；直接在当前目录修改。
- 主进程侧 Git/路径参数一律 `execFile` 数组传参；用户可控的 rev/range 必须校验后再传给 git。
- **先分清工作区再动手**（见下）。安装版不要去找 DevDash 源码仓库。

## 双工作区

| | 源码仓库（dev / clone） | 安装版 / userData |
| --- | --- | --- |
| 识别 | 工作区有 `package.json` + `src/` + `plugins/` | 工作区是应用数据目录（无 monorepo 根） |
| 新建 | `plugins/<name>` npm workspace | `node "<SDK>/create.mjs" <id> [--title "…"]` |
| 构建 | `npm run build:plugins` | `cd plugins/<id> && node "<SDK>/build.mjs"` |
| 热部署 | `mcp__devdash__reload_plugin_ui` | 新建/集合变化 → `mcp__devdash__refresh_plugins`；改 UI → `reload_plugin_ui` |
| UI 交互 | `mcp__devdash__click` / `fill` / `wait_for` … | 语义 locator（testid 优先）；无需 Playwright |
| 改内置插件 | 改 `plugins/<src>` | **不支持**（`resources/plugins` 仅 dist）；新建用户插件 |

`<SDK>` = 系统提示里写明的 plugin-sdk 路径（开发态 `<repo>/bundled-plugin-sdk`，安装版 `<resources>/plugin-sdk`）。

## 架构速览

```
DevDash/
├── src/main/          # 窗口、插件注册表、plugin protocol、通用 fs/shell/store
├── src/preload/       # IPC 白名单 bridge → window.devdash
├── src/renderer/      # 宿主壳：侧栏、footer 任务、title 栏、插件宿主
├── bundled-plugin-sdk/  # 用户插件 SDK（shims / template / create+build）
└── plugins/<name>/    # npm workspace 子应用（源码仓库内置插件）
    ├── package.json   # 含 devdash 清单（id / ui / main / ipc）
    └── src/
        ├── main.ts    # activate(ctx).registerIpc / registerTool
        └── ui/
```

- **main**：`plugin/registry.ts` 扫描插件根目录（开发态 `app/plugins`；安装版 `resources/plugins`；以及用户插件 `userData/plugins`，均含 `node_modules/**`），加载插件 `main` 并校验 IPC 后缀。
- **renderer**：`App.tsx` 通过 `devdash-plugin://<id>/dist/ui.js` 动态 `import` 插件。
- **React 注入**：构建把 `react` / `react/jsx-runtime` alias 到 host shim，运行时读 `globalThis.DevDashHost.React`。
- **用户插件位置（安装版）**：`<workspace>/plugins/<id>/`（workspace 即 agent 工作目录 / userData）。
- **内置插件打包**：`scripts/stage-plugins.mjs` 只带 manifest + `dist/` 到 `build/plugins/`，经 `extraResources` 落到 `<resources>/plugins/<id>/`，**不进 asar**。

## 插件清单

```json
{
  "name": "devdash-plugin-snake",
  "devdash": {
    "id": "snake",
    "title": "贪吃蛇",
    "icon": "puzzle",
    "ui": "dist/ui.js",
    "main": "dist/main.js",
    "order": 100,
    "ipc": ["score:get"]
  }
}
```

- `id` 全局唯一，`^[a-z0-9][a-z0-9-]*$`；`ui`/`main` 为包内相对路径（构建产物）。
- `ipc` 为插件通道**后缀**白名单；完整通道名为 `plugin:<id>:<suffix>`。

## 插件 UI 入口契约

```ts
// dist/ui.js default export
{
  id: string
  title: string
  icon?: string
  App: ComponentType   // 根组件
}
```

- 通过 `DevDashHost.ipc.invoke(channel, ...args)` 调主进程；插件领域通道必须是 `plugin:<id>:<suffix>`，后缀在清单 `devdash.ipc` 中声明，并在 `main.ts` 的 `activate(ctx)` 里 `ctx.registerIpc(suffix, handler)`。
- 宿主平台通道（不经前缀）：`plugin:list`、`fs:*`、`shell:*`、`store:*`、`window:*`。
- 长任务用 `DevDashHost.tasks.run(id, label, fn)`，底部任务条可见。
- 项目级持久化用 `store:read` / `store:patch`（写入 `<project>/.devDash/ui-state.json` 并维护 `.gitignore`）。

## IPC 与安全

新增插件 IPC 通道时同步修改：

1. `package.json` — `devdash.ipc` 后缀
2. 插件 `main.ts` — `registerIpc(suffix, handler)`
3. 插件 `api.ts` — 封装（`plugin:<id>:` 前缀）

宿主静态通道才改 `src/main/ipc.ts` + `src/preload/index.ts`。

安全约定：

- 自定义协议读插件文件：用 `path.relative(root, target)` 防 `..`，勿用 `startsWith`。
- `git diff` 的 `range` 白名单字符且禁止以 `-` 开头（防 `--output=`）。
- 未跟踪文件：`git diff HEAD -- path` 可能成功且空，用 `ls-files --error-unmatch` 判断。
- 根提交 diff 用 empty-tree：`4b825dc642cb6eb9a060e54bf8d69288fbee4904`。
- `fs:probe-file` / `fs:read-text-file` 的打开策略由调用方传入；宿主保留 200MB 硬上限。
- 插件 `main` 与宿主同进程；装进 `plugins/` 即与宿主同权。

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
  async (args) => gitService.commit(String(args.repoPath), String(args.message), args.paths as string[] | undefined)
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

## 安装版用户插件流程（示例：贪吃蛇）

```bash
# 1. 脚手架（在 agent 工作区根执行）
node "<SDK>/create.mjs" snake --title "贪吃蛇"

# 2. 在 plugins/snake/src/ 写玩法与 UI；需要 IPC 则三处同步；需要 agent 操作则 registerTool
# 3. 构建（esbuild-wasm，无需安装 vite）
cd plugins/snake && node "<SDK>/build.mjs"
```

然后调用 `mcp__devdash__refresh_plugins`（新插件进侧栏 + 注册 IPC/Tool，无需重启），
必要时 `mcp__devdash__reload_plugin_ui`，领域行为用 tool 验证，视觉再用交互工具断言。

## UI 交互与定位（无需 Playwright）

定位器字段可组合，按优先级解析**唯一**元素；多匹配请传 `index`。

| 优先级 | 字段 | 示例 |
| --- | --- | --- |
| 1 | `testid` | `{ "testid": "add-repo" }` |
| 2 | `role` + `name` | `{ "role": "button", "name": "添加" }` |
| 3 | `label` | `{ "label": "仓库路径" }` |
| 4 | `text` | `{ "text": "提交" }` |
| 5 | `css` | `{ "css": ".sidebar [data-active]" }` |

常用工具：

| 类别 | 工具 |
| --- | --- |
| 交互 | `click` `dblclick` `hover` `fill` `type` `press_key` `clear` `select_option` `check` `uncheck` `scroll_into_view` `scroll` `drag` |
| 断言 | `query` `get_text` `get_value` `get_attr` `wait_for` `screenshot` `screenshot_element` `dom_snapshot` |

约定：

- 交互前自动 scrollIntoView + 可操作性检查（可见、未 disabled、中心点命中目标）。
- 表单用 `fill`（触发 React 受控 onChange）；逐键用 `type`；提交用 `press_key` + `Enter`。
- **拖拽交互请用 pointer/mouse 事件实现，不要用原生 HTML5 `draggable`**（合成输入下 DataTransfer 不可靠）。
- 插件 UI 建议带 `data-testid`，与 `dom_snapshot` 输出对齐，定位最稳。
- 审批模式下交互类工具会请求授权；完全访问下自动放行。
- 外部 Playwright + CDP 仅作疑难/跨应用调试的高级路径（见 playwright skill）。

## 源码仓库内置插件

- 新插件放入 `plugins/<name>`，workspaces 自动被扫描；用 `npm run build:plugins` 构建。
- React alias 用**精确正则**（`/^react$/`），裸字符串会让 `react/jsx-runtime` 解析错 shim。
- `plugins/*/dist` 不提交 git；clone / CI 后必须先 `npm install` 或 `npm run build:plugins`。
- 打包：`npm run stage:plugins` 把 manifest + dist 拷到 `build/plugins/`，`electron-builder` 以 `extraResources` 装进 `<resources>/plugins/`（示例插件 git-manager 同理），不进主程序 asar。

```bash
npm run typecheck
npm run build:plugins
npx electron-vite build
node scripts/smoke.mjs
npm run dev
```

## Examples

- 「开发一个贪吃蛇的小游戏」→ 安装版走用户插件流程（create → 写 src → build → refresh_plugins）；源码仓库则 `plugins/snake` + `build:plugins`。
- 「让 agent 能直接看 Git 状态 / 提交」→ 在插件 main 里 `registerTool(git_status/git_log/git_commit)`，与 UI IPC 共用 gitService；验收直接调 `mcp__<plugin-id>__*`。
- 「Git 树颜色不对」→ 仅源码仓库：改 `plugins/git-manager/src/git/gitService.ts` 与 `styles.ts`；安装版请新建用户插件补充能力。
- 「提交历史点文件没 Diff」→ 用 commit 的 patch（`openFromCommit`），不要走工作区 `diff HEAD`。
