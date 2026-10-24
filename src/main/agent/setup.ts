import { app } from 'electron'
import { registerAgentIpc } from './ipc'
import { shutdown as agentShutdown } from './agentRuntime'
import { shutdownTts } from './ttsService'

export function setupAgent(): void {
  registerAgentIpc()
  app.on('before-quit', () => {
    shutdownTts()
    void agentShutdown()
  })
}
