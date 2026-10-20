---
name: devdash-plugin-dev
description: DevDash 插件应用开发规范与工程约定。Use when adding or modifying DevDash sub-app plugins, implementing npm-installable plugins under plugins/, wiring Electron IPC for git/GitLab features, building the Git Manager plugin UI, or asking how to "写插件 / 新增子应用 / 改 Git 管理 / 插件清单怎么配". Covers plugin manifest, DevDashHost, build scripts, and UI rules used in this repo.
---

# DevDash 插件应用开发

## Important

- 插件必须可被主应用通过 `package.json` 的 `devdash` 清单发现；不要硬编码插件 UI 到宿主 React 树。
- 禁止创建 `.worktree`、禁止新建功能分支；直接在当前目录修改。
- 主进程侧 Git/路径参数一律 `execFile` 数组传参；用户可控的 rev/range 必须校验后再传给 git。

## 架构速览

```
DevDash/
├── src/main/          # 窗口、插件注册表、gitService、gitlabClient、store
├── src/preload/       # IPC 白名单 bridge → window.devdash
├── src/renderer/      # 宿主壳：侧栏、footer 任务、title 栏、插件宿主
└── plugins/<name>/    # npm workspace 子应用
    ├── package.json   # 含 devdash 清单
    ├── vite.config.ts # 构建 ui.js / main.js
    └── src/ui|main
```

- **main**：`plugin/registry.ts` 扫描 `plugins/*/package.json` 与 `plugins/node_modules/**`。
- **renderer**：`App.tsx` 通过 `devdash-plugin://<id>/dist/ui.js` 动态 `import` 插件。
- **React 注入**：插件构建把 `react` / `react/jsx-runtime` alias 到 `src/ui/host-react.ts`、`host-jsx-runtime.ts`，运行时读 `globalThis.DevDashHost.React`（宿主 `main.tsx` 注入）。

## 插件清单

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

- `id` 全局唯一；`ui`/`main` 为包内相对路径（构建产物）。
- 新插件放入 `plugins/<name>`，并在 `plugins` workspaces 自动被扫描；用 `npm run build:plugins` 构建。

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

- 通过 `DevDashHost.ipc.invoke(channel, ...args)` 调主进程；通道必须在 `src/preload/index.ts` 白名单。
- 长任务用 `DevDashHost.tasks.run(id, label, fn)`，底部任务条可见。
- 项目级持久化用 `store:read` / `store:patch`（写入 `<project>/.devDash/ui-state.json` 并维护 `.gitignore`）。

## IPC 与安全

新增通道时同步修改：

1. `src/main/ipc.ts` — handler  
2. `src/preload/index.ts` — allowed 列表  
3. 插件 `api.ts` — 封装  

安全约定：

- 自定义协议读插件文件：用 `path.relative(root, target)` 防 `..`，勿用 `startsWith`。
- `git diff` 的 `range` 白名单字符且禁止以 `-` 开头（防 `--output=`）。
- 未跟踪文件：`git diff HEAD -- path` 可能成功且空，用 `ls-files --error-unmatch` 判断。
- 根提交 diff 用 empty-tree：`4b825dc642cb6eb9a060e54bf8d69288fbee4904`。

## Git 管理插件 UI 约定

- 文件树：单行 nowrap；同级目录/文件同缩进 + 独立箭头列；目录链折叠为 `a/b/c`。
- 状态色（文件名着色，禁止整行色块背景）：未跟踪/删除=红，已跟踪又改=蓝，新建已 add=绿，忽略=棕。
- 打开文件：单列 unified Diff（隐藏 `diff --git`）；白名单/大小不满足时出「强制打开 + 并加入白名单」。
- 全局打开策略在侧栏 footer「全局设置」；GitLab/Assignee/Reviewer 在「设置」视图。
- Commit 模式：扁平勾选变更文件 + 大 message 框 + commit / commit and push；Push 弹窗展示待推 commit 与目标分支。

## 构建与验证

```bash
npm run typecheck
npm run build:plugins
npx electron-vite build
# 仓库根目录 smoke：node scripts 下的 smoke.mjs
npm run dev
```

- Windows 若报 `Electron uninstall`：跑 `npm run ensure:electron`（补 `path.txt`）。
- 插件改完必须 `build:plugins` 再进 Electron，否则 UI 仍是旧 bundle。

## Examples

- 「给 DevDash 加个新的 xx 插件」→ 在 `plugins/xx` 建清单 + vite lib 构建 ui/main，宿主侧栏自动出现。
- 「Git 树颜色不对」→ 改 `gitService.classifyPorcelain` 与插件 `styles.ts` 的 `st-*` 仅作用于文字。
- 「提交历史点文件没 Diff」→ 用 commit 的 patch（`openFromCommit`），不要走工作区 `diff HEAD`。
