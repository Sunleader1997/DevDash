---
feature: bundled-skills
status: delivered
updated: 2026-03-20
branch: main
commits: 8e92cc6..8e92cc6
---

# 安装包预置 Skill + 落盘

## Report

**What was built** — DevDash 安装包预置三枚 agent skill（`compose-next` / `devdash-plugin-dev` / `playwright`），源在仓库 `bundled-skills/`，经 `electron-builder` 的 `extraResources` 打到 `resources/skills/`（绕开 `files` 的 `!*.md`）。应用每次 `ready` 后 `seedBundledSkills()` 把包内 skill **总是覆盖**复制到 `userData/skills/`，开发模式从 `<appPath>/bundled-skills` 取源。`skillDirs()` 扫描顺序为：项目 `.claude`/`.mimocode` → `userData/skills` → 打包 `resources/skills`（安装版，优先于家目录）→ 用户家目录三处。失败不阻断启动；单 id 复制失败不影响其它 id。因此「编排模式」在全新机器上也能拿到 `compose-next` 正文。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS（含三条 bundled skill 存在性检查）。独立 review：T1–T4 met，无 critical 代码缺陷；已修扫描顺序（resources 先于家目录）、按 id 隔离复制失败、删除未使用的 `userHomeSkillDirs`、去掉重复的 `.claude/skills/playwright`（以 `bundled-skills` 为唯一出货源）。安装包 `extraResources` 的实机 `resources/skills` 落盘需 `electron-builder` 打一版安装包后点验。

**Journey log** — 1) skill 不能走 `files`：清单里 `!*.md` 会删掉 `SKILL.md`，必须 `extraResources`。2) 编排模式是硬编码 `/compose-next` 入口，skill 本体原先完全依赖用户机器目录，预置后才闭环。3) 用户选择「总是覆盖」：包内版本为准，userData 下用户手改会被启动时覆盖。4) 同名 skill 先命中先赢，项目本地目录仍可压过预置版做开发试验。

## [S1] Problem

DevDash 对话里的「编排模式」硬编码注入 `/compose-next`，但：

1. 安装包不打包任何 skill（`electron-builder.yml` 的 `files` 排除 `*.md`，且不含 skill 目录）。
2. 运行时 `skillDirs()` 只扫项目/用户目录，装好的应用扫不到内置 skill。
3. 结果：全新机器上点「编排模式」agent 没有 skill 正文，功能形同虚设。

## [S2] Design

### 2.1 预置集合（用户已确认）

仓库根目录 `bundled-skills/` 作为唯一出货源：

| id | 用途 |
| --- | --- |
| `compose-next` | 编排模式 |
| `devdash-plugin-dev` | 插件开发约定 |
| `playwright` | 浏览器/UI 自动化 |

`electron-builder.yml` 用 `extraResources` 打到安装目录 `resources/skills/`。

### 2.2 落盘策略（用户已确认：总是覆盖）

启动 `app.ready` 后 `seedBundledSkills()`：

```text
源： <resourcesPath>/skills  或开发态 <appPath>/bundled-skills
目标：<userData>/skills/<id>/...
行为：每次启动整目录覆盖复制；单 id 失败跳过并记录，不阻断启动
```

### 2.3 扫描顺序

1. `<repo>/.claude/skills`
2. `<repo>/.mimocode/skills`
3. `<userData>/skills`
4. `<resourcesPath>/skills`（仅安装版）
5. `~/.claude/skills`
6. `~/.config/mimocode/skills`
7. `~/.agents/skills`

同名先命中先赢。

### 2.4 打包

```yaml
extraResources:
  - from: bundled-skills
    to: skills
```

## [S3] Out of Scope

- 不自动从网络拉取/更新 skill。
- 不做 skill 版本比较或用户修改合并（已选总是覆盖）。
- 不把 skill 做成可卸载插件 UI。

## Tasks

- [x] T1: bundled-skills 出货源 — acceptance: `bundled-skills/{compose-next,devdash-plugin-dev,playwright}/SKILL.md` 存在且非空 (covers: S2.1)
- [x] T2: 启动落盘 seedBundledSkills — acceptance: ready 后把源复制到 `userData/skills`，同名覆盖；开发/安装两种源路径均可达；失败不崩溃 (covers: S2.2)
- [x] T3: skillDirs 扩展 — acceptance: 扫描含 `userData/skills` 与 `resources/skills`；`agent:skills:list` 能列出预置 id (covers: S2.3)
- [x] T4: electron-builder extraResources — acceptance: yml 含 `extraResources` 从 `bundled-skills` → `skills`；`*.md` 排除不影响 skill 包 (covers: S2.4)
- [x] T5: 验证与收尾 — acceptance: typecheck + build:plugins + electron-vite build + smoke PASS；更新本文档 Report (covers: 全部)
