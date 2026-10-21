import { app } from 'electron'
import { registerAgentIpc } from './ipc'
import { shutdown as agentShutdown } from './agentRuntime'

export function setupAgent(): void {
  registerAgentIpc()
  app.on('before-quit', () => {
    void agentShutdown()
  })
}
