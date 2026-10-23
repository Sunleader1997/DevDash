---
feature: git-repo-discovery-cache
status: delivered
updated: 2026-10-23
branch: main
commits: e8df81b..uncommitted  # delivered in working tree on main (AGENTS.md forbids feature branches)
---

# Git 仓库发现缓存

## Report

**What was built** — Git 工具的仓库发现结果改为 project store 持久化（key `git:repos`，payload `{scannedAt, repos: RepoInfo[]}`）。打开插件时先读缓存立刻渲染侧栏（branch / dirtyCount 快照可点），再后台 `findRepos` + `repoInfo`；结果与缓存不同才写回并覆盖 UI，相同则不闪。缓存命中时后台扫描不进 task footer。`removeProject` 用 `pendingClears` token 清掉 `git:repos`：in-flight 扫描被 `ScanHandle.cancelled` 取消且不写回；若 remove 后立刻 re-add，新扫描会吞掉 pending clear 并跳过 hydrate（冷扫描），避免旧 clear 把新缓存抹掉。

**Verification** — `npm run typecheck` PASS；`npx tsc --noEmit -p plugins/git-manager/tsconfig.json` PASS；`repoCache` 边角用例（空/`null`/脏 JSON 归一化、`discoveryEquals`）PASS；`npm run build:plugins` PASS（34 ipc 后缀，未新增通道）；`node scripts/smoke.mjs` PASS。独立 review 1 轮（1 major：remove vs in-flight scan）→ 修复 → re-review（1 major：remove→re-add wipe）→ 二次修复 → 聚焦 re-review：(a)(b)(c) 全 FIXED，无新 major/critical。

**Journey log** — 1) 首版用 `scanningProjects` Set 做互斥，remove 后 in-flight `storePatch` 会复活 `git:repos`。2) 改 await inflight + map presence 判断「有无替代扫描」不够：替代扫描先完成并删 handle 后，pending clear 仍会误清。3) 正确形状是 **pendingClear token**（新扫描 `delete` 即接管）+ **afterRemove 跳过 hydrate** + **isStale 在写回前二次检查**。4) `projectStore.patch` 是无锁 RMW（`projectStore.ts:65-69`），并发 `store:patch` 仍可能丢写——平台预存限制，不在本特性范围。5) AGENTS.md 禁 worktree/功能分支，直接在 cwd/main 工作树交付。

## [S1] Problem

Git 工具每次打开插件（组件 mount）都会对每个 project 现场 `findRepos` 深度遍历找 `.git`，再对每个仓库跑 `git status` / `rev-parse` 取 branch 与 dirtyCount。`reposByProject` 只活在 React state，卸载即丢；`repoListCache` 只写不读。结果是：切走再回来、或刚打开应用，用户必须重新等一轮扫描，多仓库 / 大目录下首屏明显卡顿。IDE 与 VS Code 的做法是「发现结果持久化 + 变更监听」，不是全量索引。

## [S2] Design

### S2.1 缓存放哪、存什么

每个 project 的发现结果写入 **project store**（`<project>/.devDash/ui-state.json`），经现有 `store:patch` 合并，不覆盖其它 key（如 `repo:<path>`）。

- store key：`git:repos`
- payload：

```ts
type RepoDiscoveryCache = {
  scannedAt: number          // epoch ms，最近一次完整扫描完成时间
  repos: RepoInfo[]          // path/name/branch/dirtyCount 快照
}
```

`RepoInfo` 形状与 `plugins/git-manager/src/ui/types.ts` 一致。纯解析/序列化/比较在 `plugins/git-manager/src/ui/repoCache.ts`（`parseRepoDiscoveryCache` / `serializeRepoDiscoveryCache` / `discoveryEquals`）；读写经 UI 侧 `api.storeRead` / `api.storePatch`，不在 main 新增 IPC。

### S2.2 打开时行为（缓存先渲染 + 后台重扫）

`scanProject` 拆成两段：

1. **Hydrate**：`storeRead(project.path)`，若 `git:repos` 存在且 `repos` 为数组 → 立即 `setReposByProject`，侧栏立刻可点。此时不再显示「扫描中…」。若本次扫描紧接在 `removeProject` 之后（`pendingClears.delete` 命中），跳过 hydrate，走冷扫描。
2. **Rescan（后台）**：无论是否有缓存，继续 `findRepos` + 逐仓 `repoInfo`。完成后：
   - 与缓存的 path 集合或任一 `branch`/`dirtyCount`/`name` 不同 → 写回 `store:patch`，并 `setReposByProject` 覆盖为新鲜数据。
   - 完全一致 → UI 不闪、不 toast、不重写。
   - Rescan 失败（目录不可读等）→ 保留已 hydrate 的缓存；若本就无缓存则沿用现有 toast 报错。

缓存命中时后台 rescan 不走 `api.tasks`（不进 task footer）；无缓存首扫仍显示「扫描 xxx」。

并发：`ScanHandle { cancelled, done }`。新扫描将旧 handle 标 `cancelled`；`isStale()` 在 hydrate setState、写回 setState、`storePatch` 前检查；写回 `await` 完成后 `done` 才 resolve。

### S2.3 手动刷新

项目树无独立「刷新发现」入口，本轮不新增按钮；依赖 mount 时的后台 rescan 覆盖。仓库工作区内的「刷新 Git 状态」只刷当前仓库 status/log，不动发现缓存。

### S2.4 失效与移除

- `removeProject`：取消 in-flight scan → `pendingClears.set(id, token)` → 等 `inflight.done` → 若 token 仍是当前 pending clear 则 `storePatch` 置 `{ 'git:repos': null }`。读侧把 `null`/非对象当无缓存。
- remove 后立刻 re-add：`scanProject` `delete` pending clear（取消未落地的 clear）并跳过 hydrate，保证 T3「再添加表现为无缓存完整扫描」；新扫描写回后不会被旧 clear 抹掉。
- 缓存只保证「打开更快」，不保证绝对新：外部新建/删除仓库依赖后台 rescan 或下次打开纠正。本轮不做 fs watcher。

## [S3] Out of Scope

- 文件系统监听（`.git/HEAD` / `.git/index` / 工作区），另开一轮。
- 仓库 status/log/branches 的增量缓存或索引。
- findany / Everything 式全文件名索引。
- 跨设备同步 project store（`.devDash/` 本就在项目目录，随 gitignore 规则走）。
- 新 IPC 通道。
- `projectStore.patch` 无锁 RMW 的全局串行化（平台预存；极端并发 `store:patch` 仍可能丢写）。

## Tasks

- [x] T1: 类型与 store 读写 — 在 git-manager UI 侧定义 `RepoDiscoveryCache`，实现 `parseRepoDiscoveryCache` / `serializeRepoDiscoveryCache`（走 `storeRead`/`storePatch`，key `git:repos`，容忍 `null`/脏数据）。acceptance: 存在可单测的纯解析函数，对空 store、脏 JSON、`git:repos: null` 返回空缓存；save 后 read 回同结构。 (covers: S2.1)
- [x] T2: scanProject 改造为 hydrate + 后台 rescan — mount/展开时先 hydrate 渲染，再 rescan；差异时写回并覆盖 UI；失败保留缓存。acceptance: 有缓存时 `setReposByProject` 在 `findRepos` 返回前完成；rescan 结果与缓存不同则 `storePatch` 被调用且 UI 更新；相同则 UI 不重置。 (covers: S2.2, S2.4; depends: T1)
- [x] T3: removeProject 清理缓存 — 删除 project 时清 `git:repos`；in-flight / 立刻 re-add 竞态不复活、不误清。acceptance: remove 后该项目再添加表现为无缓存完整扫描。 (covers: S2.4; depends: T1)
- [x] T4: 全链路验证 — typecheck（根 + git-manager）、build:plugins、smoke。acceptance: 命令全 PASS，无新增 IPC 后缀。 (covers: S2.1; depends: T2, T3)
