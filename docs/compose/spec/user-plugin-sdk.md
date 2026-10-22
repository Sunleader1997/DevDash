---
feature: user-plugin-sdk
status: delivered
updated: 2026-02-14
branch: main
commits: 3d99bb5..3d99bb5 # uncommitted on main per AGENTS.md (no worktree/branch); range = working tree vs base
---

# 用户插件 SDK 与安装版热部署

## Report

**What was built** — 打通「安装版 / userData 工作区」下的用户插件闭环：agent 不再需要 DevDash 源码仓库即可创建 → 构建 → 重发现 → 热重载插件。新增 `bundled-plugin-sdk/`（host React shims、模板、`create.mjs` / `build.mjs`），构建器为随安装包分发的 `esbuild-wasm`（`extraResources` → `resources/plugin-sdk/`）。`devdash-plugin-dev` skill 与 agent `SYSTEM_APPEND` 改为双模式（源码仓库 vs 安装版），并注入 SDK 绝对路径。新增 MCP `mcp__devdash__refresh_plugins`：重扫 `userData/plugins`、激活新插件 main、广播侧栏刷新；preload 将 `plugin:<id>:<suffix>` 改为模式放行，新 IPC 无需重启建窗。`buildPluginContext` 区分 workspace / 用户插件 / asar 内置三类路径，不再伪造 `plugins/<id>/src/`。安装版内置插件保持 dist-only。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS（含 user-plugin SDK create→build 与 discovery 契约）。专项探针：SAFE_BASH 链式注入（`&&`/`;`/`|`/`$()`）拒绝；`create.mjs` 恶意 title 经求值验证仅为字符串字面量（无代码执行）；控制字符 title 拒绝；目标目录存在拒绝覆盖。T3 的 Electron 内 live `refresh_plugins` → 侧栏需在运行中的应用里点验（smoke 覆盖离线契约）。

**Journey log** — 1) 根因不是 registry 不支持外置插件，而是 skill/构建链 monorepo 中心 + 安装版裁掉 src。2) preload 白名单建窗冻结是新 IPC 必须重启的真因，改为 `plugin:` 前缀模式 + 主进程 `registerIpc` 授权。3) `SAFE_BASH` 必须先拒 shell 元字符再整串匹配，前缀匹配可被 `&&` 链式利用。4) 往 JS/JSON 模板塞不可信文本只能用 `JSON.stringify`；单引号模板用 `jsString` 会被 `'` 逃逸。5) 路径归属判断用 `path.relative` + 拒 `..`/绝对路径，禁止 `startsWith(dir)`。

## [S1] Problem

DevDash 的关键承诺是：agent 依据 `devdash-plugin-dev` 自己开发插件并热部署。`pack release` 之后该闭环断裂：

1. 打包态 `repoRoot()` 变为 `userData`（asar 不可写），但 skill / `SYSTEM_APPEND` 仍描述 monorepo 布局（`plugins/<name>`、`npm run build:plugins`、`typecheck`、`smoke.mjs`）。
2. `electron-builder.yml` 显式丢弃 `plugins/**/src/**`，安装版内置插件只有 dist，agent 既不能改内置插件源码，也没有可复制的模板。
3. 插件构建工具链（workspace `build:plugins`、vite 配置、React host shim）只存在于源码仓库。
4. `buildPluginContext` 在 rootDir 位于 asar 时回落为假路径 `plugins/<id>`，并提示可读 `src/`，进一步诱导 agent 去找源码库。
5. registry 虽已扫描 `userData/plugins`，但只在启动时 `discover`；preload 插件 IPC 白名单在建窗时经 `additionalArguments` 冻结，新建插件/新 IPC 必须重启。

结果：agent 在 `userData` 下找不到工程约定，转而搜索 DevDash 源码仓库，无法完成「贪吃蛇」这类从零插件。

## [S2] Design

目标：安装版 / `userData` 工作区下，agent 可 **创建 → 构建 → 重发现 → 热重载** 用户插件，无需源码仓库。源码仓库 monorepo 路径保持不变。

### S2.1 插件 SDK 产物

仓库新增 `bundled-plugin-sdk/`（与 `bundled-skills/` 并列），安装包打到 `resources/plugin-sdk/`：

```
bundled-plugin-sdk/
├── shims/
│   ├── host-react.ts          # 读 globalThis.DevDashHost.React
│   └── host-jsx-runtime.ts
├── template/
│   ├── package.json           # devdash 清单骨架（id/title 由 create 写入）
│   └── src/
│       ├── main.ts            # activate(ctx).registerIpc 示例
│       └── ui/
│           ├── App.tsx
│           ├── api.ts
│           └── index.tsx      # 占位符为 __PLUGIN_ID_JSON__ / __PLUGIN_TITLE_JSON__
├── create.mjs                 # node create.mjs <id> [--title …]
└── build.mjs                  # 在插件包根目录执行，产出 dist/ui.js + dist/main.js
```

- bundler：`esbuild-wasm`（npm 依赖），经 `extraResources` 拷到 `resources/plugin-sdk/vendor/esbuild-wasm/`。`build.mjs` 优先解析 vendor 路径，开发态回退 monorepo `node_modules/esbuild-wasm`。
- `build.mjs` 约定：输入 `src/ui` 与 `src/main`，输出 `dist/ui.js` / `dist/main.js`（ESM，`jsx: 'automatic'`）；`react` / `react/jsx-runtime` / `react-dom` alias 到 SDK shims。要求清单含 `devdash.id` 与 `devdash.title`。
- `create.mjs` 将模板落到 `cwd/plugins/<id>`；**不可信 title/id 一律 `JSON.stringify` 写入源码**；`package.json` 用 `JSON.parse`/`JSON.stringify` 写回；拒绝覆盖已存在目录；拒绝控制字符 title。
- 用户插件布局：`<workspace>/plugins/<id>/{package.json,src/,dist/}`。
- 安装版内置插件仍为 dist-only 产品件；外置开发一律走用户插件。

### S2.2 SDK 路径注入

- `src/main/agent/pluginSdk.ts` 导出 `pluginSdkRoot()`：
  - packaged → `path.join(process.resourcesPath, 'plugin-sdk')`
  - dev → `path.join(app.getAppPath(), 'bundled-plugin-sdk')`
- `agentRuntime` 的 `SYSTEM_APPEND` 改为 `buildSystemAppend()`：按 `repoRoot()` / `app.isPackaged` 分模式，并写入 SDK 绝对路径与 `create.mjs` / `build.mjs` / `refresh_plugins` 流程。

### S2.3 双模式 skill 与系统提示

`bundled-skills/devdash-plugin-dev/SKILL.md` 与 `.mimocode` 副本含「双工作区」对照表：

| | 源码仓库 | 安装版 / userData |
| --- | --- | --- |
| 新建 | `plugins/<name>` workspace | `node "<SDK>/create.mjs" <id>` |
| 构建 | `npm run build:plugins` | `node "<SDK>/build.mjs` |
| 验证 | typecheck / build:plugins / electron-vite / smoke | build → `refresh_plugins` → `reload_plugin_ui` |
| 改内置 | 改源码 | 不支持；新建用户插件 |

- `buildPluginContext`：`path.relative` 判定 workspace / userData 用户插件（可写绝对路径）/ asar 内置（无源码，引导 create）。
- `permissionBridge`：`isSafeBash` 先拒绝 `[\n\r;&|<>`$]`，再整串匹配安全命令（含 `plugin-sdk/(build|create).mjs`）。

### S2.4 动态插件重发现

1. **preload**：`PLUGIN_CHANNEL_RE` 放行 `plugin:<id>:<suffix>`（与 registry 的 id/suffix 规则一致）；host/agent 通道仍静态白名单。授权仍在主进程 `registerIpc`。
2. **`refreshPlugins()`**：discover + loadAllMains，返回列表与 workspace/sdk 路径。
3. **MCP `refresh_plugins`**：执行上述并广播 `devdash:plugins-changed`。
4. **渲染进程**：`App.tsx` 监听 `devdash:plugins-changed` 并刷新侧栏。
5. **边界**：不主动 removeHandler；同 id 重复注册仍抛错。T3 的 live Electron 路径需实机点验。

### S2.5 安装包与种子

- `electron-builder.yml` `extraResources`：`bundled-plugin-sdk` → `plugin-sdk`；`node_modules/esbuild-wasm` → `plugin-sdk/vendor/esbuild-wasm`。
- 不把 SDK 复制进 userData；路径由 `SYSTEM_APPEND` 注入。

## [S3] Out of Scope

- 插件 npm 发布 / 市场 / 签名 / 沙箱隔离（插件 main 仍与宿主同权）。
- 修改或外置化安装版内置插件源码（git-manager 等保持 dist-only）。
- 卸载插件时撤销已注册 IPC 的精细生命周期。
- Windows/mac 以外架构的 esbuild 分发。
- monorepo 内 git-manager 的 vite 构建改造（继续 `npm run build:plugins`）。
- `SAFE_BASH` 对 `*plugin-sdk/*.mjs` 的可写路径执行仍与 `node scripts/smoke.mjs` 同级松紧（既有模型）。

## Tasks

- [x] T1: bundled-plugin-sdk 资产 — acceptance: 存在 shims、template、create.mjs、build.mjs；在临时目录 create → build 产出 dist/ui.js 与 dist/main.js，且 ui 对 react 的解析来自 shim（covers: S2.1）
- [x] T2: SDK 路径与打包接线 — acceptance: `pluginSdkRoot()` 在 dev 指向 bundled-plugin-sdk；electron-builder extraResources 含 plugin-sdk 与 esbuild-wasm；SAFE_BASH 允许 create/build.mjs 且拒绝链式注入（covers: S2.2, S2.5）
- [x] T3: 动态插件重发现 — acceptance: refresh_plugins + preload 模式放行 + 侧栏事件已实现；smoke 覆盖用户插件 discovery 契约；Electron 内 live 点验待实机（covers: S2.4）
- [x] T4: 双模式 skill 与 agent 提示 — acceptance: SKILL.md 含安装版流程；SYSTEM_APPEND 含 SDK 绝对路径与分模式命令；buildPluginContext 不再对 asar 插件伪造 src 路径（covers: S2.3）
- [x] T5: 全量验证 — acceptance: `npm run typecheck`、`npm run build:plugins`、`npx electron-vite build`、`node scripts/smoke.mjs` 均 PASS（covers: 全部）
