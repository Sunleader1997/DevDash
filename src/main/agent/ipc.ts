import { ipcMain } from 'electron'
import {
  loadSettings,
  saveSettings,
  newId,
  fetchModelList,
  testConnectivity,
  normalizeTts
} from './modelConfig'
import * as sessionStore from './sessionStore'
import * as runtime from './agentRuntime'
import { respondPermission } from './permissionBridge'
import { listSkills } from './skills'
import { repoRoot } from './repoRoot'
import { previewTts, stopSpeaking } from './ttsService'
import type {
  AgentSendRequest,
  AgentSettings,
  ModelEntry,
  ProviderConfig,
  ProviderConnection
} from './types'

export function registerAgentIpc(): void {
  ipcMain.handle('agent:settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('agent:settings:save', async (_e, settings: AgentSettings) => {
    if (!settings || !Array.isArray(settings.providers) || settings.providers.length === 0) {
      throw new Error('至少需要一个供应商')
    }
    const providers: ProviderConfig[] = settings.providers.map((p) => {
      const models: ModelEntry[] = (p.models ?? [])
        .filter((m) => m && (m.model || m.id))
        .map((m) => ({
          id: m.id || newId(),
          model: m.model || 'claude-sonnet-4-5',
          label: m.label || m.model || '模型',
          contextInputTokens: m.contextInputTokens,
          contextOutputTokens: m.contextOutputTokens
        }))
      return {
        ...p,
        id: p.id || newId(),
        models
      }
    })
    const allModels = providers.flatMap((p) => p.models)
    if (allModels.length === 0) {
      throw new Error('至少需要一个模型')
    }
    const activeModelId =
      allModels.find((m) => m.id === settings.activeModelId)?.id ?? allModels[0].id
    const next: AgentSettings = {
      providers,
      activeModelId,
      uiDev: settings.uiDev,
      tts: normalizeTts(settings.tts)
    }
    await saveSettings(next)
    return next
  })

  /** Fetch remote model list for a provider connection (draft or saved). */
  ipcMain.handle('agent:models:list', async (_e, conn: ProviderConnection) => {
    return fetchModelList(conn)
  })

  /** Connectivity test; optionally persists lastTest on the provider id. */
  ipcMain.handle(
    'agent:models:test',
    async (_e, payload: { conn: ProviderConnection; providerId?: string }) => {
      const result = await testConnectivity(payload.conn)
      if (payload.providerId) {
        const settings = await loadSettings()
        const idx = settings.providers.findIndex((p) => p.id === payload.providerId)
        if (idx >= 0) {
          settings.providers[idx] = {
            ...settings.providers[idx],
            lastTest: { ok: result.ok, message: result.message, at: Date.now() }
          }
          await saveSettings(settings)
        }
      }
      return result
    }
  )

  ipcMain.handle('agent:skills:list', async () => {
    return listSkills()
  })

  /** SDK init caps: skills / slash_commands / agents / mcp / plugins. */
  ipcMain.handle('agent:caps:get', async () => {
    return runtime.getSessionCaps()
  })

  ipcMain.handle('agent:tasks:list', async () => {
    let local = await sessionStore.listTasks()
    try {
      const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
      const sessions = await listSessions({ dir: repoRoot(), limit: 50 })
      // listSessions is slow — re-read so status changes during the wait
      // (e.g. task finished) are not returned as a stale `running` snapshot.
      local = await sessionStore.listTasks()
      const known = new Set(local.map((t) => t.sessionId).filter(Boolean))
      const localIds = new Set(local.map((t) => t.id))
      const extra = []
      for (const s of sessions) {
        if (known.has(s.sessionId) || localIds.has(s.sessionId)) continue
        if (await sessionStore.isDeleted(s.sessionId)) continue
        extra.push({
          id: s.sessionId,
          title: s.summary?.slice(0, 40) || s.firstPrompt?.slice(0, 40) || '历史会话',
          createdAt: s.createdAt ?? s.lastModified,
          updatedAt: s.lastModified,
          sessionId: s.sessionId,
          status: 'idle' as const
        })
      }
      return [...local, ...extra]
    } catch {
      return local
    }
  })

  ipcMain.handle('agent:tasks:create', async (_e, title?: string) => {
    return sessionStore.createTask(title || '新任务')
  })

  ipcMain.handle('agent:tasks:delete', async (_e, taskId: string) => {
    await runtime.cancelTask(taskId)
    await sessionStore.deleteTask(taskId)
    return true
  })

  ipcMain.handle('agent:messages:history', async (_e, taskId: string) => {
    return sessionStore.loadMessages(taskId)
  })

  ipcMain.handle('agent:messages:send', async (_e, req: AgentSendRequest) => {
    return runtime.sendMessage(req)
  })

  ipcMain.handle('agent:model:switch', async (_e, payload: { taskId: string; modelId: string }) => {
    return runtime.switchModel(payload.taskId, payload.modelId)
  })

  ipcMain.handle(
    'agent:access:switch',
    async (_e, payload: { taskId: string; accessMode: 'approve' | 'full' }) => {
      return runtime.switchAccessMode(payload.taskId, payload.accessMode)
    }
  )

  ipcMain.handle(
    'agent:permission:respond',
    async (
      _e,
      payload: {
        requestId: string
        allow: boolean
        reason?: string
        rememberSession?: boolean
        updatedInput?: Record<string, unknown>
      }
    ) => {
      return respondPermission(
        payload.requestId,
        payload.allow,
        payload.reason,
        payload.rememberSession,
        payload.updatedInput
      )
    }
  )

  ipcMain.handle('agent:session:cancel', async (_e, taskId: string) => {
    await runtime.cancelTask(taskId)
    return true
  })

  ipcMain.handle(
    'agent:tts:preview',
    async (_e, payload?: { text?: string; tts?: Partial<import('./types').TtsConfig> }) => {
      return previewTts(payload?.text, payload?.tts)
    }
  )

  ipcMain.handle('agent:tts:stop', async () => {
    stopSpeaking()
    return true
  })
}
