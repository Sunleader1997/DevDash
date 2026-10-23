---
name: devdash-plugin-dev
description: DevDash 插件应用开发规范与工程约定。Use when adding or modifying DevDash sub-app plugins, implementing npm-installable plugins, scaffolding user plugins with the plugin SDK, wiring Electron IPC, or asking how to "写插件 / 新增子应用 / 改 Git 管理 / 插件清单怎么配 / 贪吃蛇插件". Covers plugin manifest, DevDashHost, dual workflows (source repo vs installed app), and build scripts.
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
        ├── main.ts    # activate(ctx).registerIpc — 领域 IPC
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

新增插件通道时同步修改：

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
- 插件 `main` 与宿主同进程；装进 plugins/ 即与宿主同权。

## 安装版用户插件流程（示例：贪吃蛇）

```bash
# 1. 脚手架（在 agent 工作区根执行）
node "<SDK>/create.mjs" snake --title "贪吃蛇"

# 2. 在 plugins/snake/src/ 写玩法与 UI；需要 IPC 则三处同步
# 3. 构建（esbuild-wasm，无需安装 vite）
cd plugins/snake && node "<SDK>/build.mjs"
```

然后调用 `mcp__devdash__refresh_plugins`（新插件进侧栏 + 注册 IPC，无需重启），
必要时 `mcp__devdash__reload_plugin_ui`，再用 `dom_snapshot` / `screenshot` 验收。

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
- 「Git 树颜色不对」→ 仅源码仓库：改 `plugins/git-manager/src/git/gitService.ts` 与 `styles.ts`；安装版请新建用户插件补充能力。
- 「提交历史点文件没 Diff」→ 用 commit 的 patch（`openFromCommit`），不要走工作区 `diff HEAD`。
