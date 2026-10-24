---
feature: agent-cloud-tts
status: delivered
updated: 2026-02-14
source: main
---

# Agent 云端 TTS 自动朗读

## Report

**What was built** — Agent 回复自动云端 TTS 朗读：设置页「TTS」分区配置 OpenAI 兼容 `POST {base}/v1/audio/speech`（Base URL / API Key / 模型 / 音色 / 语速 / 格式 / 截断长度），支持草稿试听与停止。助手文本落定后 main 侧合成并推 `agent:tts:audio` 到 renderer `<audio>` 播放；新回合/新流式打断旧播。密钥只在 main，15s 超时，失败不打断对话。存储并入 `agent-settings.json` 的 `tts`。

**Verification** — `npm run typecheck` PASS；`npm run build:plugins` PASS；`npx electron-vite build` PASS；`node scripts/smoke.mjs` 部分 PASS（插件/技能/porcelain OK），`bundled-plugin-sdk/build.mjs` 因 esbuild-wasm `ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK` 失败，属环境 PRE-EXISTING，与本特性无关。独立 review 首轮 3 critical（超时未接线 / 试听用已存配置 / 打断未停播）已修复并复审确认 FIXED。

**Journey log** —
1. 用户指令禁止 `.worktree` / 新分支，compose-next worktree 门禁被覆盖，全程在 cwd / `main` 落地（与 `claude-agent-integration` 相同）。
2. 讨论中曾提出 `speak` tool 与 SDK `Stop` hook；对齐结论：**自动朗读挂在 assistant 消息落定点**，tool 是模型主动说话，不满足「自动」。
3. 试听必须吃表单草稿（对齐 `testModel(draft)`），不能 `loadSettings()`；打断要 `broadcast({stop:true})` 而不是只 abort fetch。

## [S1] Problem

DevDash 的 agent 回复目前只有文字。用户希望 agent 说完后能**自动出声**（不要让模型再调 speak 工具），用自己配置的云端 TTS API 朗读助手回复。

用户可见目标：

1. 设置页可配置云端 TTS（OpenAI 兼容协议）：Base URL / API Key / 模型 / 音色 / 语速，并可试听。
2. 开关打开后，助手消息**落定即自动朗读**，无需 agent 调用任何工具。
3. 可随时停止朗读；新回复会打断并接上。

## [S2] Design

### [S2.1] 选型与进程边界

| 层 | 选型 |
| --- | --- |
| 触发点 | `agentRuntime` 中 assistant 文本 `streaming: false` 落定（等价于生命周期 hook，但音频留在 Electron 内） |
| 合成协议 | OpenAI 兼容 `POST {baseUrl}/v1/audio/speech`，用户手动配置端点与密钥 |
| 密钥与 HTTP | **仅 main**（`src/main/agent/ttsService.ts`），不进 renderer |
| 播放 | renderer `<audio>`（整段 Buffer → Blob URL） |
| 存储 | 并入现有 `agent-settings.json` 的 `tts` 字段 |

**为什么不用 speak tool**：tool 依赖模型主动调用，不是自动朗读。  
**为什么不用 SDK `Stop` hook**：hook 适合 shell 副作用；DevDash 已有消息落定点，音频直接进 UI 更可控（取消/试听/设置）。

### [S2.2] 配置模型（仿现有 ProviderConfig）

扩展 `AgentSettings`：

```ts
export type TtsConfig = {
  enabled: boolean
  /** OpenAI-compatible base, e.g. https://api.openai.com */
  baseUrl: string
  apiKey: string
  /** TTS model id, e.g. tts-1 / gpt-4o-mini-tts */
  model: string
  /** Voice id, e.g. alloy / zh-CN-XiaoxiaoNeural */
  voice: string
  /** 0.25–4.0, default 1.0 */
  speed: number
  /** output format, default mp3 */
  format: 'mp3' | 'wav' | 'opus'
  /** Skip paragraphs longer than this many chars, default 2000 */
  maxChars: number
}
```

默认：`enabled: false`，其余字段给可编辑空值/安全默认；不绑定任何厂商密钥。

存储与读写复用 `modelConfig.ts` 的 `agent-settings.json`；`getSettings`/`saveSettings` 带上 `tts`。密钥保存后 UI 可显示为掩码，但逻辑层明文存 userData（与现有 `apiKey` 一致）。

### [S2.3] 合成 API（OpenAI 兼容）

```
POST {baseUrl}/v1/audio/speech
Authorization: Bearer {apiKey}
Content-Type: application/json

{ "model", "voice", "input": text, "speed", "response_format": format }
```

- 响应：二进制音频（非 JSON）。
- `baseUrl` 规范化：去尾 `/`、去尾 `/v1`（避免 `/v1/v1/...`），与 `normalizeAnthropicBase` 同思路。
- 失败：HTTP 非 2xx / 网络错误 / **15s 超时** → 返回结构化 error，**不打断对话**，UI 仅状态提示。

`synthesize(text, cfg) → { ok: true, audio: Buffer, format } | { ok: false, error: string }`。

试听：`POST` 同一接口；**支持草稿配置**（未保存的表单值，对齐 `testModel`）。

### [S2.4] 自动朗读流水线

```
assistant 文本落定 (streaming:false, 有 text)
        │
        ▼
  tts.enabled? ──否──▶ 跳过
        │是
        ▼
  text 清洗（去 markdown / 空白）→ 超 maxChars 截断 + 「（内容过长已省略）」
        │
        ▼
  打断旧播（abort + broadcast stop）
        │
        ▼
  ttsService.synthesize()（15s 超时）
        │ ok
        ▼
  经 IPC 推到 renderer → Blob → <audio>.play()
```

规则：

1. **只朗读 assistant 纯文本**；tool 消息、error、system 不朗读。
2. **单声道队列**：新朗读请求打断上一次（abort fetch + `agent:tts:audio {stop:true}`）。
3. **新回合 / 新流式**：`sendMessage` 启动与新 streaming assistant 创建时 `interruptSpeaking()`。
4. 长度保护：`text.length > maxChars` 截断并追加「（内容过长已省略）」。
5. 朗读失败静默降级：console.warn + error 状态，不影响任务状态机。

### [S2.5] IPC

| 通道 | 方向 | 载荷 |
| --- | --- | --- |
| `agent:tts:preview` | invoke | `{ text?, tts? }` → `TtsSpeakResult`（可带草稿） |
| `agent:tts:stop` | invoke | — → `{ ok }` |
| `agent:tts:audio` | event | `{ stop, taskId?, messageId?, format?, audio? }` |
| `agent:tts:status` | event | `{ state: 'idle'\|'speaking'\|'error', error? }` |

设置读写仍走 `agent:settings:get` / `agent:settings:save`。

### [S2.6] UI

`SettingsModal`「TTS」分区：开关、Base URL / API Key / 模型 / 音色 / 语速 / 格式 / Max chars，「Preview」「Stop」。

### [S2.7] 错误与边界

| 场景 | 行为 |
| --- | --- |
| 未配置 apiKey/baseUrl | 朗读失败提示「请完善语音设置」 |
| 密钥错误 / 401 | 状态 error，本轮跳过 |
| 网络超时 | 15s abort；`TimeoutError` 文案 |
| 音频格式不支持 | 依赖 Chromium `<audio>` |
| 应用退出 | `shutdownTts()` abort 在途请求 |

### [S2.8] 安全

- API Key 只在 main 读取；请求由 main 发起。
- 事件载荷只有音频字节与状态，不含密钥。
- 不执行返回内容中的任何指令。

## [S3] Out of Scope

- 流式边合成边播（V2）
- 消息旁手动「朗读」按钮 / 选段朗读（V2）
- speak MCP tool / 插件 `registerTool` 主动说话
- 本地 TTS（Piper / Web Speech / 系统 SAPI）
- 语音输入（STT）
- 多 Provider 抽象与音色市场
- SSML / 情绪 / 方言细控

## Tasks

- [x] T1: `TtsConfig` 类型 + `modelConfig` 读写合并 `tts` — acceptance: `getSettings`/`saveSettings` 往返保留 `tts`；缺省 `enabled:false`（covers: S2.2）
- [x] T2: `ttsService.synthesize`（OpenAI 兼容 + baseUrl 规范化 + 15s Abort） — acceptance: URL/头/体正确；错误结构化（covers: S2.3, S2.7）
- [x] T3: IPC 通道 + preload 白名单（`preview`/`stop`/`audio`/`status`） — acceptance: renderer 能 preview/stop 并收到 audio 事件（covers: S2.5）
- [x] T4: `agentRuntime` 落定自动触发朗读流水线 — acceptance: enabled 时 assistant 文本落定自动合成；tool/error 不触发；新消息打断旧播（covers: S2.4）
- [x] T5: SettingsModal TTS 分区 + 试听/停止 — acceptance: 可配置并草稿试听；开关关闭后不再自动朗读（covers: S2.6）
- [x] T6: 验证门禁 — acceptance: `npm run typecheck` + `build:plugins` + `npx electron-vite build` 通过（depends: T1–T5）

## Journey log

1. 用户指令禁止 `.worktree` / 新分支，compose-next worktree 门禁被覆盖，全程在 cwd / `main` 落地（与 `claude-agent-integration` 相同）。
2. 讨论中曾提出 `speak` tool 与 SDK `Stop` hook；对齐结论：**自动朗读挂在 assistant 消息落定点**，tool 是模型主动说话，不满足「自动」。
3. 试听必须吃表单草稿（对齐 `testModel(draft)`），不能 `loadSettings()`；打断要 `broadcast({stop:true})` 而不是只 abort fetch。
