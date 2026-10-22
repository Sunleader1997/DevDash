import path from 'node:path'
import { app } from 'electron'

/**
 * User-plugin SDK root.
 * Packaged: extraResources → <resources>/plugin-sdk (includes vendor/esbuild-wasm).
 * Dev: repo bundled-plugin-sdk (esbuild-wasm resolves from monorepo node_modules).
 */
export function pluginSdkRoot(): string {
  try {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'plugin-sdk')
    }
    return path.join(app.getAppPath(), 'bundled-plugin-sdk')
  } catch {
    return path.join(process.cwd(), 'bundled-plugin-sdk')
  }
}
