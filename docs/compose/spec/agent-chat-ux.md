---
feature: agent-chat-ux
status: delivered
updated: 2026-10-27
branch: main
commits: 9619316..(uncommitted working tree)
---

# Agent 对话界面与逻辑优化

## Report

**What was built** — 在既有 Claude Agent 对话工作区上完成交互与能力升级，并按反馈修正弹窗/工具栏。插件引用为 `@`（`/` 用于 skill/命令）；审批/完全访问与模型经 `setPermissionMode` / `setModel` 实时切换，下一动作生效且不打断 loop。token 级流式，气泡无角色字；工具卡片展示状态与结果。SDK `settingSources: user+project` 继承 skills/agents/hooks/MCP/plugins。权限弹窗支持「允许并记住本会话」与 AskUserQuestion 补充输入。所有弹窗/浮层为不透明背景。模型配置弹窗已去掉大段说明文案。左下 `+` 仅保留「编排模式」= `/compose-next` skill；模型下拉在发送按钮左侧，首项「添加模型」打开模型配置（原 ⚙ 已移除）。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` PASS。独立审查 6 项 CRITICAL 已修并复审通过；本批 UI 修正同上验证。

**Journey log** —
1. 访问模式切换用 `setPermissionMode`，禁止 cancel 重启；完全访问在 `canUseTool` 内短路 allow。
2. `settingSources` 完整加载后必须用 preset `options.model` + env 强制覆盖。
3. 流式以 `streamBuffer` finalize；`result.result` 只清 streaming，不覆盖正文。
4. `AskUserQuestion.updatedInput` = 原 `questions` + 顶层 `answers` 映射（多选逗号拼接）。
5. 「编排模式」不是多套工作流模板，而是 `/compose-next` skill；`+` 菜单只做这一个入口。

## [S1] Problem

已有 Claude Agent 对话工作区可跑通插件开发闭环，但交互偏「命令行套壳」，且初版 UI 仍有透明弹窗、模型配置说明冗长、编排入口与工具栏布局不符预期。

## [S2] Design

### [S2.1] `@` 引用插件

- `@` → 插件选择器；`/` → skill / 命令。
- 选中插件 chip `@<id>`；发送时注入「插件上下文」。

### [S2.2] 模式 / 模型实时切换

| 切换项 | 机制 | 生效点 |
| --- | --- | --- |
| 审批 ↔ 完全访问 | `query.setPermissionMode` | 下一次工具请求 |
| 模型 | `query.setModel` | 下一次模型调用 |

- 禁止因 accessMode 变化 cancel/restart。
- IPC `agent:access:switch`。

### [S2.3] 流式输出与气泡

- `includePartialMessages: true`；`stream_event` → 同 `messageId` 增量。
- 气泡无「你」「Agent」；用户右、助手左、工具通栏卡片。

### [S2.4] 继承 Claude Code Agent SDK

- `settingSources: ['user','project']`，`skills: 'all'`。
- preset `model`/`env` 强制覆盖 settings.json。
- init caps 经 `agent:caps:get`。

### [S2.5] 对话 UI

- 状态芯片：就绪/思考中/使用工具/等待你确认/生成中/出错。
- 工具卡片：名称、状态点、参数摘要、可折叠结果。
- **弹窗不透明**：`.modal` / `.modal-backdrop` / `.plus-menu` / `.mention-menu` 使用实色背景，禁止 `--bg-elevated` 半透明。
- 模型配置弹窗 **不展示** 长提示文案。
- 权限：拒绝 / 允许 / 允许并记住本会话；AskUserQuestion 结构化输入。

### [S2.6] `+` 菜单与 composer 工具栏

- `+` 菜单 **仅** 「编排模式」= `/compose-next` skill：向草稿注入 `/compose-next` 并加入 skill chip。
- **不** 提供多套工作流模板、Skills 子菜单、模式标签 chip。
- 布局：左 `+` + 审批/完全访问；右 **模型下拉**（首项「添加模型」→ 打开模型配置）+ **发送**。无独立 ⚙ 设置按钮。

### [S2.7] IPC 增量

| 通道 | 变化 |
| --- | --- |
| `agent:access:switch` | 新增 |
| `agent:caps:get` | 新增 |
| `agent:permission:respond` | `rememberSession` / `updatedInput` |
| `agent:event` | `message-update` 增量；`status.phase` / `accessMode` |

### [S2.8] 错误行为

- `setPermissionMode` / `setModel` 失败回滚 UI，不中断 turn。
- 权限超时 120s deny。

## [S3] Out of Scope

- 不做多套编排工作流模板 / DAG 编辑器。
- 不做 Skills 子菜单（`/` 触发仍可用）。
- 不做多仓库 Agent、语音、云同步、OpenAI 协议。

## Tasks

- [x] T1: Runtime 实时切换 + 流式 — acceptance: accessMode 经 `setPermissionMode` 生效且不 cancel；增量上屏（covers: S2.2, S2.3）
- [x] T2: SDK 生态继承 — acceptance: `settingSources: user+project`；preset model/env 强制覆盖（covers: S2.4）
- [x] T3: IPC + types — acceptance: `agent:access:switch` / `agent:caps:get` 可用（covers: S2.2, S2.7）
- [x] T4: 对话 UI 改版 — acceptance: 无角色字气泡、工具卡片、状态芯片、权限弹窗增强（covers: S2.3, S2.5）
- [x] T5: `@` 引用 + `+` 编排 — acceptance: `@` 选插件；`+` 仅注入 `/compose-next`（covers: S2.1, S2.6）
- [x] T6: UI 修正批次 — acceptance: 弹窗实色背景；模型配置无长提示；模型下拉近发送钮且首项「添加模型」；无 ⚙/模式 chip/工作流选项（covers: S2.5, S2.6）
- [x] T7: 验证与收尾 — acceptance: typecheck + build:plugins + electron-vite build + smoke 通过；更新 Report（covers: 全部）
