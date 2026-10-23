import type {
  AccessMode,
  AgentEvent,
  AgentSendRequest,
  AgentSettings,
  AgentTask,
  ChatMessage,
  ConnectivityResult,
  ProviderConnection,
  PermissionRequestPayload,
  SkillInfo
} from './types'

export async function getSettings(): Promise<AgentSettings> {
  return (await window.devdash.invoke('agent:settings:get')) as AgentSettings
}

export async function saveSettings(settings: AgentSettings): Promise<AgentSettings> {
  return (await window.devdash.invoke('agent:settings:save', settings)) as AgentSettings
}

export async function listModels(conn: ProviderConnection): Promise<ConnectivityResult> {
  return (await window.devdash.invoke('agent:models:list', conn)) as ConnectivityResult
}

export async function testModel(
  conn: ProviderConnection,
  providerId?: string
): Promise<ConnectivityResult> {
  return (await window.devdash.invoke('agent:models:test', { conn, providerId })) as ConnectivityResult
}

export async function listSkills(): Promise<SkillInfo[]> {
  return (await window.devdash.invoke('agent:skills:list')) as SkillInfo[]
}

export type SessionCaps = {
  skills: string[]
  slashCommands: string[]
  agents: string[]
  mcpServers: Array<{ name: string; status: string }>
  plugins: Array<{ name: string; path: string }>
}

export async function getSessionCaps(): Promise<SessionCaps | null> {
  return (await window.devdash.invoke('agent:caps:get')) as SessionCaps | null
}

export async function listTasks(): Promise<AgentTask[]> {
  return (await window.devdash.invoke('agent:tasks:list')) as AgentTask[]
}

export async function createTask(title?: string): Promise<AgentTask> {
  return (await window.devdash.invoke('agent:tasks:create', title)) as AgentTask
}

export async function deleteTask(taskId: string): Promise<void> {
  await window.devdash.invoke('agent:tasks:delete', taskId)
}

export async function loadHistory(taskId: string): Promise<ChatMessage[]> {
  return (await window.devdash.invoke('agent:messages:history', taskId)) as ChatMessage[]
}

export async function sendMessage(req: AgentSendRequest): Promise<{ ok: boolean; error?: string }> {
  return (await window.devdash.invoke('agent:messages:send', req)) as {
    ok: boolean
    error?: string
  }
}

export async function switchModel(
  taskId: string,
  modelId: string
): Promise<{ ok: boolean; error?: string }> {
  return (await window.devdash.invoke('agent:model:switch', { taskId, modelId })) as {
    ok: boolean
    error?: string
  }
}

export async function switchAccessMode(
  taskId: string,
  accessMode: AccessMode
): Promise<{ ok: boolean; error?: string }> {
  return (await window.devdash.invoke('agent:access:switch', { taskId, accessMode })) as {
    ok: boolean
    error?: string
  }
}

export async function respondPermission(
  requestId: string,
  allow: boolean,
  reason?: string,
  rememberSession?: boolean,
  updatedInput?: Record<string, unknown>
): Promise<boolean> {
  const res = (await window.devdash.invoke('agent:permission:respond', {
    requestId,
    allow,
    reason,
    rememberSession,
    updatedInput
  })) as boolean
  return res
}

export async function cancelSession(taskId: string): Promise<void> {
  await window.devdash.invoke('agent:session:cancel', taskId)
}

export function onAgentEvent(cb: (e: AgentEvent) => void): () => void {
  return window.devdash.on('agent:event', (payload) => {
    cb(payload as AgentEvent)
  })
}

export type { AgentSendRequest, PermissionRequestPayload }
