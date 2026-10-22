import { pluginRegistry } from '../plugin/registry'
import { repoRoot } from '../agent/repoRoot'
import { pluginSdkRoot } from '../agent/pluginSdk'

export type RefreshPluginsResult = {
  count: number
  plugins: Array<{ id: string; title: string; rootDir: string; hasMain: boolean }>
  workspace: string
  sdk: string
  note: string
}

/**
 * Re-scan plugin roots and activate newly discovered plugin mains.
 * Safe to call repeatedly; already-loaded mains are skipped.
 */
export async function refreshPlugins(): Promise<RefreshPluginsResult> {
  const list = await pluginRegistry.discover()
  await pluginRegistry.loadAllMains()
  return {
    count: list.length,
    plugins: list.map((m) => ({
      id: m.id,
      title: m.title,
      rootDir: m.rootDir,
      hasMain: Boolean(m.mainEntry)
    })),
    workspace: repoRoot(),
    sdk: pluginSdkRoot(),
    note: '已重新发现插件。新建插件需先 build 出 dist/，再调用本工具；UI 修改可用 reload_plugin_ui。'
  }
}
