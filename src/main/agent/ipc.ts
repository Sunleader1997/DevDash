import { ipcMain, app } from 'electron'
import {
  loadSettings,
  saveSettings,
  newPresetId,
  fetchModelList,
  testConnectivity
} from './modelConfig'
import * as sessionStore from './sessionStore'
import * as runtime from './agentRuntime'
import { respondPermission } from './permissionBridge'
import { listSkills } from './skills'
import type { AgentSendRequest, AgentSettings, ModelPreset } from './types'

function repoRoot(): string {
  try {
    return app.isReady() ? app.getAppPath() : process.cwd()
  } catch {
    return process.cwd()
  }
}

export function registerAgentIpc(): void {
  ipcMain.handle('agent:settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('agent:settings:save', async (_e, settings: AgentSettings) => {
    if (!settings || !Array.isArray(settings.presets) || settings.presets.length === 0) {
      throw new Error('至少需要一个模型预设')
    }
    const presets: ModelPreset[] = settings.presets.map((p) => ({
      ...p,
      id: p.id || newPresetId()
    }))
    const active =
      presets.find((p) => p.id === settings.activePresetId)?.id ?? presets[0].id
    const next: AgentSettings = {
      presets,
      activePresetId: active,
      uiDev: settings.uiDev
    }
    await saveSettings(next)
    return next
  })

  /** Fetch remote model list for a draft/saved preset. */
  ipcMain.handle('agent:models:list', async (_e, preset: ModelPreset) => {
    return fetchModelList(preset)
  })

  /** Connectivity test; optionally persists lastTest on the preset id. */
  ipcMain.handle(
    'agent:models:test',
    async (_e, payload: { preset: ModelPreset; presetId?: string }) => {
      const result = await testConnectivity(payload.preset)
      if (payload.presetId) {
        const settings = await loadSettings()
        const idx = settings.presets.findIndex((p) => p.id === payload.presetId)
        if (idx >= 0) {
          settings.presets[idx] = {
            ...settings.presets[idx],
            ...payload.preset,
            id: payload.presetId,
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
    const local = await sessionStore.listTasks()
    try {
      const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
      const sessions = await listSessions({ dir: repoRoot(), limit: 50 })
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
}
