import { app } from 'electron'

/**
 * Agent workspace root. Must be a real directory — `spawn({ cwd: app.asar })` throws ENOTDIR
 * because the asar archive is a file. Dev uses the project root; packaged uses userData
 * (writable, and `userData/plugins` is already a plugin discovery root).
 */
export function repoRoot(): string {
  try {
    const appPath = app.isReady() ? app.getAppPath() : process.cwd()
    if (appPath && !appPath.endsWith('.asar')) return appPath
    return app.getPath('userData')
  } catch {
    return process.cwd()
  }
}
