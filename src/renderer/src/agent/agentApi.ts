import type {
  AgentEvent,
  AgentSendRequest,
  AgentSettings,
  AgentTask,
  ChatMessage,
  ConnectivityResult,
  ModelPreset,
  PermissionRequestPayload,
  SkillInfo
} from './types'

export async function getSettings(): Promise<AgentSettings> {
  return (await window.devdash.invoke('agent:settings:get')) as AgentSettings
}

export async function saveSettings(settings: AgentSettings): Promise<AgentSettings> {
  return (await window.devdash.invoke('agent:settings:save', settings)) as AgentSettings
}

export async function listModels(preset: ModelPreset): Promise<ConnectivityResult> {
  return (await window.devdash.invoke('agent:models:list', preset)) as ConnectivityResult
}

export async function testModel(
  preset: ModelPreset,
  presetId?: string
): Promise<ConnectivityResult> {
  return (await window.devdash.invoke('agent:models:test', { preset, presetId })) as ConnectivityResult
}

export async function listSkills(): Promise<SkillInfo[]> {
  return (await window.devdash.invoke('agent:skills:list')) as SkillInfo[]
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

export async function respondPermission(
  requestId: string,
  allow: boolean,
  reason?: string
): Promise<boolean> {
  const res = (await window.devdash.invoke('agent:permission:respond', {
    requestId,
    allow,
    reason
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
