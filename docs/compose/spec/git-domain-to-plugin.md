---
feature: git-domain-to-plugin
status: delivered
updated: 2026-10-21
branch: main
commits: 13239f6
---

# Git 领域能力下沉插件边界

## Report

**What was built** — 将 `gitService`、`gitlabClient`、`settingsStore`（Git Manager 打开策略）从宿主 `src/main` 整包迁入 `plugins/git-manager`。插件经清单 `devdash.ipc` 声明通道后缀，在 `main.ts` 的 `activate(ctx).registerIpc` 注册；完整通道名为 `plugin:<id>:<suffix>`（如 `plugin:git-manager:git:status`）。宿主只保留窗口、插件注册表、`devdash-plugin://` 协议、通用 `fs`/`shell`/`store`。`fs:probe-file` / `fs:read-text-file` 改为接收调用方策略参数，宿主保留 200MB 硬上限。preload 白名单 = 宿主静态通道 ∪ 启动时 `additionalArguments` 注入的已声明插件通道。

**Verification** — `npm run typecheck` PASS；`npx tsc --noEmit -p plugins/git-manager/tsconfig.json` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS（31 个 ipc 后缀、main/ui bundle 存在、porcelain 解析）。独立 review：spec T1–T6 全部满足，无 critical；已修死守卫/文档漂移/`readFile` 策略默认，并复跑全量命令 PASS。工作树另有本特性之前未提交的 App/types/打包改动，未纳入本特性验收。

**Journey log** —
1. AGENTS.md 禁止 worktree/新分支，compose-next 的 worktree 门禁被覆盖，全程在 main 当前目录落地。
2. 插件 main 原是 stub bundle；迁入 `node:*` 后需 `vite` `external: ['electron', /^node:/]`，且 `gitlabClient`/`settingsStore` 改 `setUserDataDir` 注入，避免插件直接依赖 electron。
3. preload 无法在运行时读清单，采用 `additionalArguments --devdash-ipc=` 在 `createWindow` 前注入；故 `discover+loadAllMains` 必须先于建窗。
4. 评审指出 `registerIpc` 的宿主冲突检查曾是恒真式；已改为对照 `HOST_CHANNEL_NAMES` 并先 `handle` 再记账，避免半注册卡死重试。
5. 打开策略参数化后，`api.probeFile`/`api.readFile` 在未传 `maxFileSizeMb` 时会先取 `settings:get`，否则会静默回落 10MB 默认值。

## [S1] Problem

Git 管理是插件（`plugins/git-manager`），但 `gitService`、`gitlabClient`、MR/仓库配置缓存、以及 `settingsStore`（实为 `GitManagerSettings`）都住在宿主 `src/main`，并由宿主 `ipc.ts` + preload 白名单挂载。

后果：宿主被单一插件的领域绑死；换 VCS / 加第二个 Git 类插件 / 卸掉 git-manager 时，宿主仍拖着整套 GitLab·MR·打开策略代码；插件清单里的 `main` 入口形同虚设；IPC 审计点把平台能力与插件业务搅在一起。

## [S2] Design

### [S2.1] 目标边界

**宿主保留（平台能力）** — `src/main` 只含：

| 模块 | 职责 |
| --- | --- |
| `index.ts` | 窗口、生命周期 |
| `plugin/registry.ts` | 插件发现、`main` 加载、IPC 注册器 |
| `ipc.ts` | **仅**宿主通道 handler |
| plugin protocol | `devdash-plugin://` 安全读文件 |
| `store/projectStore.ts` | 通用项目 UI 状态（`<project>/.devDash/ui-state.json`） |

宿主通道（preload 静态白名单）：

- `plugin:list`
- `fs:pick-directory`
- `shell:open-path` / `shell:show-in-folder`
- `fs:read-text-file` / `fs:probe-file`（见 S2.3 策略参数化）
- `store:read` / `store:write` / `store:patch`

**插件持有（领域能力）** — 迁入 `plugins/git-manager`：

| 现位置 | 去向 |
| --- | --- |
| `src/main/git/gitService.ts` | `plugins/git-manager/src/git/gitService.ts` |
| `src/main/gitlab/gitlabClient.ts` | `plugins/git-manager/src/gitlab/gitlabClient.ts` |
| `src/main/store/settingsStore.ts` | `plugins/git-manager/src/store/settingsStore.ts` |

插件入口为 `plugins/git-manager/src/main.ts`（`activate`/`registerIpc`），领域目录与 `ui/` 平级。

同步迁走的 IPC 后缀：全部 `git:*`、`gitlab:*`、`mr-config:*`、`settings:*`。

`src/preload` 不再出现上述通道名。

### [S2.2] 插件 IPC 契约

**通道命名**：`plugin:<id>:<suffix>`，例：`plugin:git-manager:git:status`、`plugin:git-manager:gitlab:create-mr`。

后缀保留现有名（`git:status` 等），只加前缀，UI 语义不变。

**清单声明**（`plugins/git-manager/package.json`）：

```json
"devdash": {
  "id": "git-manager",
  "ui": "dist/ui.js",
  "main": "dist/main.js",
  "ipc": [
    "git:find-repos", "git:repo-info", "git:status", "git:list-files",
    "git:add", "git:ignore", "git:commit", "git:push", "git:pull",
    "git:unpushed", "git:branches", "git:checkout", "git:log",
    "git:diff-files", "git:working-diff-files", "git:diff-file-patch",
    "git:commit-files", "git:file-at-ref",
    "gitlab:defaults:get", "gitlab:defaults:save",
    "gitlab:repo-config:get", "gitlab:repo-config:save",
    "gitlab:settings:get", "gitlab:settings:save",
    "gitlab:members", "gitlab:create-mr",
    "mr-config:get", "mr-config:save",
    "settings:get", "settings:save", "settings:add-whitelist-ext"
  ]
}
```

**注册 API**（`registry` 在 `activate` 注入）：

```ts
interface PluginMainContext {
  appPath: string
  userDataPath: string
  registerIpc(suffix: string, handler: (...args: unknown[]) => Promise<unknown>): void
}
```

宿主在 `registerIpc` 内校验：`suffix` 必须在清单 `ipc` 中；字符白名单 `^[A-Za-z0-9:._-]+$`；禁止与宿主通道冲突；同一 `(id, suffix)` 只允许一次。通道全名 = `plugin:${id}:${suffix}`。

**preload**：静态宿主集合 ∪ `{plugin:${id}:${suffix} | suffix ∈ manifest.ipc}`（插件发现 + `loadAllMains` 完成后、`createWindow` 前经 `additionalArguments` 注入）。

**插件 UI**：`api.ts` 内部 `invoke('plugin:git-manager:' + suffix)`；对外导出名不变（`gitStatus`、`createMr`…）。

**插件 main 默认导出**（`dist/main.js`）：

```ts
export default {
  id: 'git-manager',
  activate(ctx: PluginMainContext): Promise<void>,  // 在此 registerIpc
  deactivate(): Promise<void>
}
```

### [S2.3] 打开策略（settings）归属

`settingsStore`（`GitManagerSettings`、`git-manager-settings.json`）随插件走。宿主 `fs:probe-file` / `fs:read-text-file` **不再读 settingsStore**，改为收策略参数：

```ts
fs:probe-file(filePath: string, policy?: {
  textWhitelist?: string[]
  maxFileSizeMb?: number
})
fs:read-text-file(filePath: string, opts?: {
  force?: boolean
  maxFileSizeMb?: number
})
```

- 白名单命中（ext / basename / dockerfile / gitignore…）由宿主按传入 `textWhitelist` 计算。
- 硬上限 200MB、`stat`/二进制嗅探留在宿主。
- 插件 `api.probeFile` / `api.readFile` 在未传策略时会先取 `settings:get` 再下发。

### [S2.4] 安全不变式（迁移后仍成立）

- git/路径参数一律 `execFile` 数组传参；用户可控 rev/range 白名单且禁止 `-` 开头。
- 路径守卫 `path.relative` + 拒 `..`/绝对路径（plugin protocol 仍在宿主）。
- 未跟踪：`ls-files --error-unmatch`；根提交 empty-tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`。
- 插件 main 与宿主同进程（维持现状，不在本轮改 utilityProcess）；信任模型 =「安装到 `plugins/` 的代码与宿主同权」，审计点 = 清单 `ipc` + `registerIpc` 校验 + 插件 main 源码。

### [S2.5] 数据文件

插件 `userData` 缓存路径改为 `path.join(ctx.userDataPath, …)`（经 `setUserDataDir` 注入）：

- `gitlab-defaults.json` / `gitlab-settings.json`（legacy 迁移保留）
- `gitlab-repo-config.json`
- `gitlab-mr-cache.json`
- `git-manager-settings.json`

文件名不变，避免丢用户配置。

### [S2.6] 验证边界

- `npm run typecheck`（宿主 node+web）
- `npx tsc --noEmit -p plugins/git-manager/tsconfig.json`
- `npm run build:plugins`
- `npx electron-vite build`
- `node scripts/smoke.mjs`（清单 `ipc` 非空 + `dist/main.js` 存在 + porcelain 解析）
- 不引入单测框架；不改 UI 视觉/交互。

## [S3] Out of Scope

- 不把插件 main 改为 utilityProcess / 独立进程。
- 不新增第二插件，不抽象通用 VCS SDK。
- 不改 Git Manager UI 布局与交互（仅 api 前缀与必要 import）。
- 不动 `src/renderer` 宿主壳视觉；不引入 lint/CI。
- 不清理工作区既有未提交改动（以当前工作树为基线叠加）。
- 不保留 `git:*` / `gitlab:*` 旧通道兼容别名。

## Tasks

- [x] T1: 宿主插件 IPC 注册器 — acceptance: `registry`/`package.json` 支持 `devdash.ipc`；`activate(ctx).registerIpc` 按清单挂 `plugin:<id>:<suffix>`，非法 suffix/重复被拒；preload 白名单含声明通道 (covers: S2.2)
- [x] T2: 领域模块迁入插件 — acceptance: `src/main` 下无 `git/`、`gitlab/`、`settingsStore`；`plugins/git-manager/src/{git,gitlab,store}/` 含实现，`src/main.ts` 的 `activate` 注册全部清单后缀 (covers: S2.1, S2.5; depends: T1)
- [x] T3: 宿主 ipc 收缩 + fs 策略参数化 — acceptance: `ipc.ts` 仅宿主通道；`fs:probe-file`/`fs:read-text-file` 接受 policy 参数且不再 import settingsStore；200MB 硬上限仍在 (covers: S2.1, S2.3; depends: T2)
- [x] T4: 插件 UI api 前缀化 — acceptance: `api.ts` 全部领域调用走 `plugin:git-manager:` 前缀；宿主通用通道名不变；`App.tsx` 无编译错误 (covers: S2.2; depends: T2, T3)
- [x] T5: 文档与冒烟对齐 — acceptance: AGENTS.md / skill 中 IPC 三处同步改为「清单+registerIpc+api」；`smoke.mjs` 仍 PASS (covers: S2.2, S2.6; depends: T4)
- [x] T6: 全量验证 — acceptance: `typecheck`、`build:plugins`、`electron-vite build`、`node scripts/smoke.mjs` 均 PASS，命令与结果记入 Report (covers: S2.6; depends: T5)
