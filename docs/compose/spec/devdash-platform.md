---
feature: devdash-platform
status: delivered
updated: 2026-10-20
branch: main
commits: 
---

# DevDash 插件化开发平台 + Git 管理示例插件

## Report

**What was built** — 在 `D:\workspace\DevDash` 交付了可运行的 Electron 跨平台骨架 DevDash：左侧 Apple 风格半透明插件侧栏，通过 `package.json` 的 `devdash` 清单从 `plugins/` 发现 npm 插件并动态加载 UI（`devdash-plugin://` 协议 + `globalThis.DevDashHost` 注入 React）。示例插件 `@devdash/git-manager` 覆盖：项目添加/扫描 Git 仓库、文件树按状态着色、左右 Diff、分支切换、提交历史双击展开变更文件、一键 MR（newBranch 按仓库目录生成、toBranch 默认当前分支、Assignee/Reviewer、GitLab API、按仓库缓存反显）。

**Verification** — `npm run typecheck` PASS；`node scripts/build-plugins.mjs` PASS（git-manager dist/ui.js）；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS（插件发现 + porcelain 解析）；Electron 启动 6s 无崩溃日志后正常退出/终止。GitLab MR 需配置 baseUrl/token/projectPath 后走真实 API，本次无 token 仅验证表单缓存与错误提示路径。

**Journey log** —
1. 用户指令禁止 `.worktree`/新分支，compose-next 的 worktree 门禁被覆盖，全程在当前目录落地。
2. 插件内 `react` 别名需精确匹配 `^react$`，否则 `react/jsx-runtime` 会被错误解析到 shim 路径。
3. `registry.ts` 注释中的 `plugins/*/package.json` 的 `*/` 会提前结束块注释。
4. Windows 下 `spawn('npm.cmd')` 需要 `shell: true`，Node 26 直接 spawn 会 EINVAL。
5. 评审抓出的三类安全坑：`startsWith(dir)` 路径守卫需改 `path.relative`；`git diff HEAD -- untracked` 成功但空输出（不能靠 catch）；`git diff <range>` 的 range 必须白名单校验，否则 `--output=` 可任意写文件。根提交 diff 用 empty-tree SHA。

## [S1] Problem

需要一个跨平台（Windows/macOS）的 Electron 桌面应用 DevDash：

1. 所有子能力以插件形式扩展，插件通过 npm 安装到应用侧；宿主左侧展示插件列表，点击进入对应插件界面。
2. 交付示例插件「Git 管理」：管理项目 → 扫描并展开目录下被 Git 管理的仓库 → 选中仓库后进入类 VS Code 工作台（标题栏 / 文件树 / Diff / 历史 / 一键 MR）。

当前工作目录为空 greenfield，无既有代码与约定。

## [S2] Design

### [S2.1] 技术栈与进程模型

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Electron（`electron` + `electron-vite`） |
| 渲染 | React 18 + TypeScript + Vite |
| 状态 | React hooks（宿主与插件） |
| Git | 本地 `git` CLI（`child_process` 封装，不引入 native 模块） |
| MR | GitLab REST API v4（`fetch`），host/token 可配置 |
| Diff | `git diff` 统一补丁 → 自研左右分栏视图 |
| 样式 | CSS 变量 + Apple HIG 风格（半透明材质、system-ui、临界阻尼弹簧动效） |

进程边界：

- **main**：窗口、插件发现与加载、Git 服务、GitLab 客户端、MR 配置缓存、文件系统对话框。
- **preload**：仅暴露白名单 IPC（`contextIsolation: true`，`sandbox: false` 以便插件 main 可选加载）。
- **renderer**：宿主壳（插件导航）+ 当前插件 UI。

### [S2.2] 目录布局

```
DevDash/
├── package.json                 # npm workspaces: plugins/*
├── electron.vite.config.ts
├── scripts/build-plugins.mjs    # 构建 plugins/*/dist
├── scripts/smoke.mjs
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc.ts
│   │   ├── plugin/registry.ts
│   │   ├── git/gitService.ts
│   │   └── gitlab/gitlabClient.ts
│   ├── preload/index.ts
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx / App.tsx / hostApi.ts
│           ├── shell/PluginSidebar.tsx
│           └── design/tokens.css
└── plugins/
    └── git-manager/
        ├── package.json         # 含 devdash 清单
        └── src/ui|main.ts
```

### [S2.3] 插件契约

插件是 npm 包。安装到 `plugins/`（workspace 或 npm install）。主应用启动时扫描：

- `plugins/<name>/package.json`
- `plugins/node_modules/**/package.json`

`package.json` 字段：

```json
{
  "name": "@devdash/git-manager",
  "devdash": {
    "id": "git-manager",
    "title": "Git 管理",
    "icon": "git-branch",
    "ui": "dist/ui.js",
    "main": "dist/main.js",
    "order": 10
  }
}
```

**渲染端模块**（`ui` 入口默认导出）：

```ts
export interface DevDashPluginModule {
  id: string
  title: string
  icon?: string
  App: React.ComponentType
  onActivate?: () => void | Promise<void>
}
```

插件构建为 ESM，`react`/`react/jsx-runtime` 别名到 host shim，运行时读取 `globalThis.DevDashHost.React`。

**main 端模块**（可选）：`activate/deactivate`。

**IPC 白名单（preload `devdash` API）**：`plugin:list`、`fs:pick-directory`、`git:*`（find-repos/repo-info/status/list-files/branches/checkout/log/diff-files/working-diff-files/diff-file-patch/commit-files/file-at-ref）、`gitlab:*`、`mr-config:get|save`。

### [S2.4] 宿主壳（Apple Design）

- 左侧 Translucent Sidebar（`backdrop-filter: blur(20px) saturate(180%)`），约 220px，插件列表选中强调底。
- 右侧工作区渲染当前插件 `App`。
- 按下即时 `scale(0.97)`；`prefers-reduced-motion` / `prefers-reduced-transparency` 降级。
- 字体 `system-ui`；暗/亮色 CSS 变量。

### [S2.5] Git 管理插件

**项目与仓库树**：添加项目 → `fs:pick-directory` → 递归扫描 `.git`（深度 3）→ 展开仓库列表 → 点击进入工作台。

**仓库工作台**

- 标题栏：当前分支下拉切换、文件|历史视图、一键 MR。
- 文件视图：左侧完整文件树（目录可折叠），Git 状态色点（M 琥珀 / A|U 绿 / D 红 / 冲突紫 / R 蓝）；点击文件 → 左右分栏 Diff（工作区 vs HEAD）。
- 历史视图：commit 列表；**双击**展开变更文件；点击文件 → Diff。
- 一键 MR：title / newBranch（`feature/<repo-basename>-<yyyyMMdd>`）/ description / toBranch（默认当前分支）/ Assignee·Reviewer（GitLab 成员 chips）/ 设置面板写入 baseUrl·token·projectPath。提交调 GitLab Create MR；表单按 `repoPath` 缓存至 `userData/gitlab-mr-cache.json` 并反显。

### [S2.6] 错误与边界

- Git 失败 toast，不崩溃；非 Git/空仓库友好空态。
- 无 token：本地 Git 可用，MR 引导配置。
- 路径经 `execFile` 数组参数，避免 shell 注入。

### [S2.7] 测试与验证边界

- `tsc --noEmit`（node+web）+ `electron-vite build` + `build:plugins`。
- `scripts/smoke.mjs`：插件清单发现 + porcelain 状态解析 + ui bundle 存在。
- Electron 进程可启动。

## [S3] Out of Scope

- 插件商店、权限沙箱、自动更新、GitHub Provider、冲突解决器、安装包签名分发、多窗口。

## Tasks

- [x] T1: 脚手架与依赖 — electron-vite React-TS 工程可在 Windows 启动空白壳 (covers: S2.1, S2.2)
- [x] T2: 插件注册表与宿主侧栏 — 发现 plugins 清单、加载示例插件入口、Apple 风格侧栏切换 (covers: S2.3, S2.4)
- [x] T3: Git 服务与 IPC — 扫描仓库、status、分支切换、log、diff 文本 (covers: S2.3, S2.5, S2.6)
- [x] T4: Git 管理插件 · 项目/仓库树 — 添加项目、扫描、展开、选中仓库 (covers: S2.5)
- [x] T5: Git 管理插件 · 文件树与 Diff — 状态高亮、左右分栏比对 (covers: S2.5)
- [x] T6: Git 管理插件 · 分支与历史 — 分支下拉切换、历史列表、双击变更文件 Diff (covers: S2.5)
- [x] T7: 一键 MR — 表单、newBranch 生成、成员下拉、GitLab 提交、按仓库缓存反显 (covers: S2.5)
- [x] T8: 构建与验证 — typecheck/build 通过，关键路径冒烟 (covers: S2.7)
