---
feature: gitlab-config-and-repo-switch
status: delivered
updated: 2026-03-11
branch: main
commits: 87d0797..uncommitted  # work delivered in working tree on main (AGENTS.md forbids feature branches)
---

# GitLab 配置易用性与仓库切换体验修复

## Report

**What was built** — Git 工具的 GitLab 配置与仓库切换六项体验问题已修复。项目标识支持三种粘贴形式（仓库链接 / 数字 projectId / group/repo），保存与请求前经 `normalizeProjectRef` 归一化；仓库设置页新增「从 git remote 识别」。GitLab API 改走 `http(s).request` 并对自签证书 `rejectUnauthorized: false`（含 30x 跳转，跨 host 跳转不带 token），连接失败与非 2xx 错误文案可读。成员拉取失败在全局设置 / 仓库设置 / MR 弹窗展示红字并附 token 权限提示。点仓库自动关闭全局设置；「文件/历史/设置」不再持久化、进入固定文件 tab；切仓以 `key={repo.path}` 立即 remount 并叠加载遮罩。

**Verification** — `npm run typecheck` PASS；`npx tsc --noEmit -p plugins/git-manager/tsconfig.json` PASS；`npm run build:plugins` PASS（34 ipc 后缀）；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS；`normalizeProjectRef` 边角用例（URL+`.git`+`/-/`、scp-like、Windows 盘符）PASS。独立 review 一轮（3 critical + 1 major）→ 修复 → 聚焦 re-review 全 PASS、无新 critical。

**Journey log** — 1) UI 直接 import `projectRef` 会把 `ui.js` 拆出共享 chunk，插件 UI 需单文件；改为 IPC `gitlab:normalize-project`。2) `git restore` 无 `--ignore-unmatch`，回滚改用 checkout+reset+clean。3) `normalizeProjectRef` 必须先剥 `/-/` 再剥 `.git`，否则带 `.git` 的浏览 URL 解析错。4) 换掉 `fetch` 后要自己跟 30x，并注意跨 host 跳转勿转发 token。5) AGENTS.md 禁 worktree/功能分支，本特性直接在 cwd/main 工作树交付，故无 branch commit 范围。

## [S1] Problem

Git 工具（`plugins/git-manager`）在 GitLab 配置与仓库切换上有六处用户可见问题：

1. `projectPath` 只能手填 `group/repo`，界面上的说明也不清楚；用户希望直接粘贴仓库链接或使用数字 projectId。内网 GitLab 常见自签名证书，`fetch` 会 TLS 校验失败。
2. 打开「全局设置」后再点侧栏仓库，主区域仍停在全局设置，没有切回仓库工作区。
3. 「文件 / 历史 / 设置」三个 tab 的切换被写入 `.devDash/ui-state.json` 并在下次进入时恢复；用户只要默认进「文件」。
4. 切换仓库时右侧 `RepoWorkspace` 不换实例，旧仓库的文件树 / Diff / 历史会残留，直到异步刷新完成才更新，看起来像卡在上一个仓库。
5. Assignee / Reviewer 成员列表拉取失败时界面几乎无提示（只显示「配置连接与 projectPath 后可选择成员」），无法区分是配置问题还是 API 错误。
6. 一键 MR 创建报 `TypeError: fetch failed`（用户环境里也可能是别的插件前缀，但本仓库通道为 `plugin:git-manager:gitlab:create-mr`）。根因通常是自签名 HTTPS 导致 Node `fetch` 直接失败，且错误文案不可读。

## [S2] Design

### S2.1 项目标识归一化（覆盖 1、5、6 的配置侧）

`plugins/git-manager/src/gitlab/projectRef.ts` 导出 `normalizeProjectRef(input: string): string`：

| 输入 | 归一化结果 | 说明 |
| --- | --- | --- |
| `123` / `123456` | `123`（数字 ID） | 纯数字视为 GitLab project ID |
| `group/repo`、`group/sub/repo` | 原样 trim 后的 path | 保持兼容旧配置 |
| `https://gitlab.example.com/group/repo`、`https://gitlab.example.com/group/repo.git`、`…/repo/-/tree/main`、`…/repo.git/-/tree/main` | `group/repo` | 先去掉 `/-/…` 后缀，再去掉 `.git`、host |
| `git@gitlab.example.com:group/repo.git`、`ssh://git@gitlab.example.com/group/repo.git` | `group/repo` | 解析 SSH remote；Windows 盘符路径（`C:/…`）不当作 scp remote |
| 空白 | `''` | 视为未配置 |

归一化发生在：

- `saveDefaults` / `saveRepoConfig` 写盘前（存的就是归一化值）。
- `resolveSettings` 返回前（兼容历史脏数据）。
- `encodeProject`：结果 `encodeURIComponent` 后进 `/projects/:id`（数字 ID 与 path 均可）。

UI（全局设置 + 仓库「设置」）：

- 字段标题改为「GitLab 项目」，placeholder 提示三种粘贴形式。
- hint：「支持粘贴仓库链接 / 数字 projectId / group/repo；保存时自动识别。」
- 仓库设置页在项目字段旁提供「从 git remote 识别」按钮：调 `git:remote-url` 读 `origin`，经 IPC `gitlab:normalize-project` 解析后填入。

IPC（三处同步：`package.json` `devdash.ipc` → `main.ts` `registerIpc` → `api.ts`）：

- `git:remote-url` → `gitService.remoteUrl(repoPath, remoteName)`，remote 名校验 `[A-Za-z0-9._-]+` 且不以 `-` 开头。
- `gitlab:normalize-project` → `normalizeProjectRef`（UI 不 import 领域模块，保持 `ui.js` 单文件）。

### S2.2 GitLab HTTP：忽略自签名 SSL（覆盖 1、5、6 的传输侧）

`gitlabClient.request` 走 `node:http` / `node:https`，HTTPS `rejectUnauthorized: false`（仅 GitLab API）。`rawRequest` 跟随 30x（上限 5 跳）；跨 host 跳转不携带 `PRIVATE-TOKEN`。

错误文案：

- 连接/TLS/网络层失败 → `GitLab 连接失败: <原因>（已忽略自签名证书，仍失败请检查 baseUrl / 网络）`
- HTTP 非 2xx → `GitLab <status>: <body message>（请求 <pathname>）`，pathname 不含 token/header。

成员拉取失败时 UI 不吞异常：全局设置 / 仓库设置 / MR 弹窗以 `MembersError` 展示红字 + 「请检查 GitLab 项目标识（链接 / projectId / group/repo）与 token 权限（read_api 或 api）」。

### S2.3 全局设置与仓库工作区互斥（覆盖 2）

`App.openRepo` 成功切换仓库时 `setGlobalSettingsOpen(false)`。点「全局设置」仍只打开设置，不改变 `activeRepo`。

### S2.4 不持久化 tab（覆盖 3）

`RepoUiState` 去掉 `view`：持久化 payload 不含 `view`；hydrate 忽略旧 `view` 字段；进入任意仓库固定 `files`。`treeExpanded` / `sizes` / `selectedFile` / `selectedCommit` 持久化不变。

### S2.5 切换仓库立即切换右侧面板（覆盖 4）

`<RepoWorkspace key={activeRepo.path} … />` 强制 remount。`ready` state：`refreshBranches/refreshStatus/refreshLog` 并行完成后置 true；`!ready` 时 `.gm-repo-loading` 半透明遮罩（`pointer-events: none`，不挡点击）。

### S2.6 一键 MR 错误可读（覆盖 6）

`MrPanel.submit` 捕获错误后 toast + 表单区红字展示完整 `error.message`（含 S2.2 连接失败文案），不再只出现 `TypeError: fetch failed`。

## [S3] Out of Scope

- 不改 GitLab OAuth / 多账号；仍为 personal access token。
- 不引入系统证书信任链配置或「信任自签名」开关（按决策：GitLab API 全部忽略自签）。
- 不改 MR 表单字段语义、分支命名规则、Push/Commit 流程。
- 不迁移 `.devDash/ui-state.json` 格式；旧 `view` 字段仅忽略。
- 不处理用户报错里的 `plugin:hot-manager:` 前缀（本仓库插件 id 为 `git-manager`）；若运行中加载了改名插件需另行排查清单。

## Tasks

- [x] T1: `normalizeProjectRef` + 调用点归一化 — acceptance: 纯数字/URL/SSH/group/sub/repo 均得到正确标识；`saveDefaults`/`saveRepoConfig`/`resolveSettings` 写出归一化值；纯数字走 `/projects/:id`（covers: S2.1）
- [x] T2: `gitService.remoteUrl` + IPC `git:remote-url` + 「从 git remote 识别」按钮 — acceptance: 仓库设置页点击按钮后输入框被 origin 解析结果填充或 toast 说明无 origin（covers: S2.1）
- [x] T3: GitLab `request` 改 http/https 且 HTTPS 忽略自签，错误文案可读 — acceptance: 自签 HTTPS 下 `listMembers`/`createMergeRequest` 不再抛 `fetch failed`；连接错误含可读原因（covers: S2.2, S2.6）
- [x] T4: 成员列表失败在设置/MR 页展示错误 — acceptance: 拉取失败时出现红字错误，成功后错误消失（covers: S2.2）
- [x] T5: `openRepo` 关闭全局设置 — acceptance: 打开全局设置后点仓库，主区域立即为该仓库工作区（covers: S2.3）
- [x] T6: 去掉 view 持久化，进入默认 files — acceptance: 在历史/设置页切走再进，仍停在文件 tab；`.devDash` 不再写入 `view`（covers: S2.4）
- [x] T7: `RepoWorkspace` 按 `repo.path` remount + 加载遮罩 — acceptance: A 仓库切 B 时右侧面板立即换为 B 的空壳+加载态，不残留 A 的 Diff/历史（covers: S2.5）
- [x] T8: UI 字段文案（GitLab 项目 / 三种格式 hint）— acceptance: 全局与仓库设置可见新标题与 hint（covers: S2.1）
