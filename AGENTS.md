# DevDash

Electron 插件化开发面板：React 18 + TypeScript + electron-vite。npm workspaces 为 `plugins/*`。

插件开发约定、Git 管理 UI 规则、安全细节见 [`.mimocode/skills/devdash-plugin-dev/SKILL.md`](.mimocode/skills/devdash-plugin-dev/SKILL.md)。交付记录见 [`docs/compose/spec/devdash-platform.md`](docs/compose/spec/devdash-platform.md)。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 唯一自动化门禁（node + web 两个 tsc 工程） |
| `npm run build:plugins` | 按 `devdash` 清单构建 `plugins/*` → 各自 `dist/` |
| `npm run stage:plugins` | 把内置插件 manifest + `dist/` 拷到 `build/plugins/`（打包用） |
| `npm run build` | `build:plugins` 然后 `electron-vite build` |
| `npm run dev` | electron-vite 开发 |
| `node scripts/smoke.mjs` | 插件发现 + `devdash.ipc` + `dist/main.js` 存在 + porcelain 解析 |
| `npm run ensure:electron` | 修复 Electron “uninstall”（补 `path.txt`） |
| `npm run pack:linux` | 构建 Linux x64 安装包（AppImage + deb） |

改完插件源码后：先 `build:plugins` 再起 Electron，否则加载的是旧 bundle。完整验证顺序：`typecheck` → `build:plugins` → `npx electron-vite build` → `node scripts/smoke.mjs`。

无 ESLint / Prettier / 单测 / CI。`postinstall` 会跑 `build:plugins` + `ensure:electron`。

## 架构

```
src/main/       窗口、plugin/registry、plugin protocol、通用 fs/shell/store
src/preload/    IPC 白名单 → window.devdash
src/renderer/   宿主壳（侧栏 / 任务 footer）；alias `@` → src/renderer/src
plugins/<name>/ npm workspace 子应用，package.json 含 `devdash` 清单（id/ui/main/ipc）
```

- 宿主在 `src/main/plugin/registry.ts` 扫描插件根：开发态 `plugins/*` 与 `plugins/node_modules/**`；安装版 `resources/plugins`（extraResources，不进 asar）与 `userData/plugins`。**不要**把插件 UI 硬编码进宿主 React 树。
- 插件 UI 经 `devdash-plugin://<id>/dist/ui.js` 动态 `import`。默认导出：`{ id, title, icon?, App }`。
- 插件与宿主共享一份 React：插件 vite 把 `react` / `react/jsx-runtime` / `react-dom` alias 到 `src/ui/host-react.ts` / `host-jsx-runtime.ts`，运行时读 `globalThis.DevDashHost.React`。alias 的 `find` 必须是精确正则（`/^react$/`），用裸字符串会让 `react/jsx-runtime` 解析错 shim。
- **领域能力在插件，平台能力在宿主**：`git`/`gitlab`/`settings`（打开策略）在 `plugins/git-manager/src/`，经插件 `main` 的 `activate(ctx).registerIpc` 挂通道；宿主 `src/main` 只留窗口、注册表、plugin protocol、通用 `fs`/`shell`/`store`。

## IPC（插件通道）

- 通道名：`plugin:<id>:<suffix>`（例：`plugin:git-manager:git:status`）。
- 后缀必须写在清单 `devdash.ipc` 数组里；`registerIpc` 只接受清单内后缀。
- 新增通道三处同步：清单 `devdash.ipc` → 插件 `main.ts` 的 `registerIpc` → 插件 `ui/api.ts`（前缀）。
- preload 白名单 = 宿主静态通道 ∪ 启动时 `additionalArguments` 注入的已声明插件通道。

## 容易踩的坑

- `plugins/*/dist/` **不进 git**。clone / CI 后必须 `npm install` 或 `npm run build:plugins`，否则宿主加载 `dist/ui.js` 失败。
- 内置插件（含 git-manager）打包进 `<resources>/plugins/`（`extraResources`），**不进 app.asar**；`pack:*` 前会跑 `stage:plugins`。
- `npm run typecheck` **不覆盖** `plugins/*`（各自有 `tsconfig.json`，但没有 typecheck script）。
- 根 `tsconfig.json` 是 solution 风格（`files: []` + project refs），不要直接 `tsc -p tsconfig.json`；用 `npm run typecheck`。
- `package-lock.json` 与 `plugins/*/dist/` 同在 `.gitignore`，不要提交。
- 新增 IPC 通道要改三处（见上「IPC（插件通道）」）：清单 `devdash.ipc`、插件 `registerIpc`、插件 `api.ts`。
- Windows：`spawn('npm.cmd')` 需要 `shell: true`（见 `scripts/build-plugins.mjs`）；Electron 报 uninstall 跑 `ensure:electron`。

## Git / 文件系统安全

- git/路径参数一律 `execFile` 数组传参，禁止 shell 拼接。
- 路径守卫用 `path.relative` + 拒绝 `..`/绝对路径，**不要**用 `startsWith(dir)`（见 `ipc.ts`、`gitService.ts`）。
- 用户可控 rev/range 必须白名单字符且禁止以 `-` 开头（防 `--output=`）。
- 未跟踪文件：`git diff HEAD -- path` 可能成功且空输出，用 `ls-files --error-unmatch` 判断。
- 根提交 diff 用 empty-tree：`4b825dc642cb6eb9a060e54bf8d69288fbee4904`。

## 工作流约束

- 禁止创建 `.worktree`、禁止新建功能分支；直接在当前工作目录修改。
