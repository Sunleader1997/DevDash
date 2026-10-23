---
feature: git-repo-watcher
status: delivered
updated: 2026-10-23
branch: main
commits: e8df81b..uncommitted  # delivered in working tree on main (AGENTS.md forbids feature branches)
---

# Git 仓库变更监听（watcher）

## Report

**What was built** — 当前打开的仓库获得实时刷新：插件 main 侧 `RepoWatcher` 同时盯 `.git` 目录（过滤 `HEAD`/`index`/`packed-refs`/`ORIG_HEAD` 及 `.lock`）与递归工作区（忽略 `.git/`、`node_modules/`、`dist/`、`.devDash/`），300ms 尾沿 debounce 后唤醒。通知走新增 IPC 长轮询 `git:watch:wait` / `git:watch:stop`（不改宿主 push 通道）；UI 在 `activeRepo` 上跑单环，`changed` 时并行静默刷新 status / branches / log / unpushed，切仓或卸载时 `watchStop`。`wait` 带 sticky dirty，刷新窗口内的变更不会丢；`aliveRef` 保证卸载后的 `onChanged` 不会覆盖新仓库。

**Verification** — `repoWatcher` 边角用例（debounce 合并 / 忽略路径 / `.git` 过滤 / 超时 / 重复 wait / stop 幂等 / sticky dirty）PASS；`npm run typecheck` PASS；`npx tsc --noEmit -p plugins/git-manager/tsconfig.json` PASS；`npm run build:plugins` PASS（ipc 34→36）；`node scripts/smoke.mjs` PASS。独立 review 1 轮（2 major：lost-wakeup、切仓后 stale onChanged）→ 修复 → 聚焦 re-review：(a)(b)(d) 全 FIXED，无新 major/critical。

**Journey log** — 1) `fire()` 无 waiter 时直接丢事件会在「UI 正在 Promise.all 刷新」窗口丢唤醒，必须 sticky dirty。2) `RepoWorkspace` `key={repo.path}` 卸载后 in-flight `refreshStatus` 仍会 `onChanged`→`setActiveRepo`，必须 `aliveRef` 在 await 后再写。3) wait 超时 timer **不能 unref**（超时是 API 契约）；debounce timer 可以。4) registry 必须在任何 `await` 之前把 entry 放进 map，否则并发 `wait` 双开 watcher。5) `projectStore.patch` 无锁 RMW 与 `RepoWatcher` stop/start 并发仍是平台级残留，不在本特性范围。

## [S1] Problem

发现缓存解决的是「打开慢」，但 Git 状态仍是打开时的快照。用户在外部终端 commit/checkout、或用编辑器改文件后，侧栏 dirtyCount / branch 和右侧 status / 历史不会变，除非手动点「刷新」。IDE / VS Code 靠 `.git/index`、`.git/HEAD` 与工作区文件监听驱动增量刷新；DevDash git-manager 目前没有任何 watch。宿主 `PluginMainContext` 只有请求/响应 IPC，`preload.EVENT_CHANNELS` 仅有 `agent:event`，不能直接 push。

## [S2] Design

### S2.1 范围

只监听 **当前打开的仓库**（`activeRepo.path`）。切换仓库或卸载 UI 时停掉旧 watch。侧栏其它仓库的 dirtyCount 不在本轮实时化（仍靠打开/重扫）。

### S2.2 监听什么

插件 main 侧 `RepoWatcher`（`plugins/git-manager/src/git/repoWatcher.ts`）对给定 `repoPath`：

1. **`.git` 目录**（非递归）：关注 `HEAD`、`index`、`packed-refs`、`ORIG_HEAD` 及对应 `.lock`。捕获 commit / checkout / stage / 外部 git 命令。git 常以 rename 写 index，故盯目录而非单文件。
2. **工作区根**（`fs.watch(recursive: true)`）：任意非忽略路径变更触发。事件路径含 `.git/`、`node_modules/`、`dist/`、`.devDash/` 的丢弃。

两路事件进入同一 **debounce 300ms**（尾沿，连续变更只算一次）。无 waiter 时的变更写入 sticky `dirty`，由下一次 `wait` 立即消费，避免刷新窗口丢唤醒。

### S2.3 通知：`git:watch` 长轮询

新增 IPC 后缀（三处同步：`package.json` `devdash.ipc` → `main.ts` `registerIpc` → `ui/api.ts`）：

| 通道 | 参数 | 返回 |
| --- | --- | --- |
| `git:watch:wait` | `repoPath: string`, `timeoutMs?: number`（默认 30000） | `{ changed: boolean }` |
| `git:watch:stop` | `repoPath: string` | `void` |

语义：

- `wait`：若该 repo 尚无 watcher 则启动（registry 在任何 `await` 之前占位，防并发双开）；注册/复用 waiter，直到 debounce 后的变更、sticky dirty、或 `timeoutMs` 到期才返回。超时返回 `{changed: false}`。
- 同一 repo 仅允许一个 in-flight `wait`；重复调用 `throw new Error('watch already waiting')`，UI 用单环避免。
- `stop`：关闭 watcher，pending wait 以 `{changed: false}` resolve，清除 sticky dirty 与内部 map。幂等。
- `repoPath` 不存在或启动失败：`wait` throw；`stop` 静默成功。

不新增宿主 push 通道；不改 `PluginMainContext` / `preload`。

### S2.4 UI 刷新环

`RepoWorkspace` 在 `activeRepo.path` 上单环：

```
loop:
  r = await api.watchWait(repo.path)
  if unmounted: break
  if r.changed:
    await Promise.all([refreshStatus({silent}), refreshBranches(), refreshLog(), refreshUnpushed()])
```

- 与现有「刷新」按钮同一组数据源；watcher 路径 `refreshStatus` 走 `silent`（不进 task footer）。
- `refreshStatus` 的 `onChanged(repoInfo)` 顺带更新侧栏当前仓库的 dirtyCount/branch。
- 所有 refresh 在 await 之后用 `aliveRef` 门闩再 `setState`/`onChanged`/`onToast`，避免 `key={repo.path}` 卸载后覆盖新仓库。
- 切换 `repo.path` / 卸载：`aliveRef=false`，`api.watchStop(oldPath)`。
- 刷新失败沿用各 refresh 内 toast，不退出环。

### S2.5 错误与资源

- `fs.watch` 在 Linux 对 recursive 支持随 Node 版本而异；失败时该路 `console.warn` 后降级，仅另一路仍可用。
- `deactivate()` → `repoWatcherRegistry.stopAll()`。
- 不监听仓库外路径；`repoPath` 仅作 `fs.watch` 根与 `.git` 子路径，不做 shell 拼接。
- wait 超时 timer 不 `unref`（超时属于 API 契约）；debounce timer 可 `unref`。

## [S3] Out of Scope

- 侧栏全部仓库的实时 dirtyCount。
- 宿主级 push 事件通道（`PluginMainContext.broadcast` / `EVENT_CHANNELS`）。
- 发现列表的 fs watch（新建/删除子仓库）；仍靠打开时 rescan。
- 对 watch 事件做 git 级增量解析（直接整表 refresh status/log）。
- `RepoWatcher` 在 `start()` 未完成时 `stop()` 的句柄泄漏、linked-worktree `.git` 文件形态。

## Tasks

- [x] T1: `RepoWatcher`（插件 main）— `wait/stop` API；`.git` 目录 + 递归工作区两路；300ms 尾沿 debounce；忽略 `.git/`、`node_modules/`、`dist/`、`.devDash/`；超时返回 `{changed:false}`；sticky dirty；stop 幂等并 resolve pending。acceptance: 纯逻辑可单测：变更后 debounce 合并只 resolve 一次 `changed:true`；无 waiter 变更由下次 wait 消费；超时 `changed:false`；stop 后 wait 不再触发。 (covers: S2.2, S2.3, S2.5)
- [x] T2: IPC 三处同步 — `git:watch:wait` / `git:watch:stop` 进清单、`registerIpc`、`api.ts`；`deactivate` 清 watcher。acceptance: `build:plugins` 后 ipc 后缀数 = 旧值 + 2，smoke 通过。 (covers: S2.3; depends: T1)
- [x] T3: UI 刷新环 — activeRepo 上单环 long-poll，`changed` 时并行 refresh status/branches/log/unpushed；`aliveRef` 门闩；切仓/卸载 `watchStop`。acceptance: 外部改工作区文件或 `git commit` 后 ≤ debounce+一次 wait 周期，面板与侧栏 dirtyCount 更新；切仓不残留旧 repo 的 wait，也不覆盖新 activeRepo。 (covers: S2.4; depends: T2)
- [x] T4: 全链路验证 — typecheck（根 + git-manager）、build:plugins、smoke、watcher 边角用例。acceptance: 全 PASS，无宿主/preload 改动。 (covers: S2.5; depends: T2, T3)
