/** Shared agent types (JSON-serializable, used by main + renderer). */

export type ModelProvider = 'anthropic' | 'custom'

export type ModelAuthMode = 'api-key' | 'subscription'

/** Wire protocol for the endpoint. Claude Agent SDK speaks Anthropic Messages. */
export type ApiProtocol = 'anthropic-messages'

export type ModelPreset = {
  id: string
  /** Display name */
  label: string
  provider: ModelProvider
  /** Interface protocol */
  protocol: ApiProtocol
  /** Model id passed to Claude Agent SDK `options.model` */
  model: string
  /** API endpoint base, e.g. https://api.anthropic.com */
  baseUrl?: string
  /** API key */
  apiKey?: string
  /** Anthropic auth mode; custom always uses api key */
  authMode?: ModelAuthMode
  /** Input context length in tokens; default 1_000_000 (1M) */
  contextInputTokens?: number
  /** Max output tokens; default 64000 */
  contextOutputTokens?: number
  /** Last connectivity test result */
  lastTest?: {
    ok: boolean
    message: string
    at: number
  }
}

export type UiDevSettings = {
  /** Enable CDP remote debugging on next launch */
  enableCdp?: boolean
  /** CDP port, default 9222 */
  cdpPort?: number
}

export type AgentSettings = {
  presets: ModelPreset[]
  activePresetId: string
  uiDev?: UiDevSettings
}

/** 审批模式 vs 完全访问 */
export type AccessMode = 'approve' | 'full'

export type AgentTaskStatus = 'idle' | 'running' | 'error'

/** 输入框左上 / header 状态芯片 */
export type AgentPhase = 'idle' | 'thinking' | 'tool' | 'waiting' | 'streaming' | 'error'

export type AgentTask = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  sessionId?: string
  modelId?: string
  accessMode?: AccessMode
  status: AgentTaskStatus
  lastError?: string
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system'

export type ToolStatus = 'running' | 'done' | 'error'

export type ChatMessage = {
  id: string
  taskId: string
  role: ChatRole
  text: string
  createdAt: number
  toolName?: string
  /** Compact input summary for tool cards */
  toolInput?: string
  toolResult?: string
  toolStatus?: ToolStatus
  toolUseId?: string
  pluginRefs?: string[]
  skillRefs?: string[]
  streaming?: boolean
  error?: boolean
}

export type PermissionRequestPayload = {
  requestId: string
  taskId: string
  toolName: string
  title: string
  description?: string
  displayName?: string
  inputPreview: string
  blockedPath?: string
  dangerous: boolean
}

export type SkillInfo = {
  id: string
  title: string
  description: string
  source: string
}

export type ModelListResult =
  | { ok: true; models: Array<{ id: string; label: string }> }
  | { ok: false; error: string }

export type ConnectivityResult = {
  ok: boolean
  message: string
  latencyMs?: number
  models?: Array<{ id: string; label: string }>
}

export type AgentEvent =
  | { type: 'message'; taskId: string; message: ChatMessage }
  | {
      type: 'message-update'
      taskId: string
      messageId: string
      text?: string
      streaming?: boolean
      toolResult?: string
      toolStatus?: ToolStatus
    }
  | {
      type: 'status'
      taskId: string
      status: AgentTaskStatus
      error?: string
      sessionId?: string
      phase?: AgentPhase
      accessMode?: AccessMode
    }
  | { type: 'permission'; payload: PermissionRequestPayload }
  | { type: 'error'; taskId: string; message: string }
  | {
      type: 'usage'
      taskId: string
      usedTokens: number
      maxTokens: number
    }

export type AgentSendRequest = {
  taskId: string
  text: string
  pluginRefs?: string[]
  skillRefs?: string[]
  modelId?: string
  accessMode?: AccessMode
}
