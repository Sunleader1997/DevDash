import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DevDashPluginMeta } from '../../renderer/src/hostApi'

interface PackageManifest {
  name?: string
  main?: string
  devdash?: {
    id: string
    title: string
    icon?: string
    order?: number
    ui?: string
    main?: string
  }
}

async function readManifest(file: string): Promise<PackageManifest | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as PackageManifest
  } catch {
    return null
  }
}

function toMeta(rootDir: string, pkg: PackageManifest): DevDashPluginMeta | null {
  const d = pkg.devdash
  if (!d?.id || !d.title) return null
  const uiRel = d.ui ?? pkg.main ?? 'dist/ui.js'
  const mainRel = d.main
  return {
    id: d.id,
    title: d.title,
    icon: d.icon,
    order: d.order ?? 100,
    packageName: pkg.name ?? d.id,
    rootDir,
    uiEntry: path.resolve(rootDir, uiRel),
    mainEntry: mainRel ? path.resolve(rootDir, mainRel) : undefined
  }
}

async function collectFromNodeModules(dir: string, out: DevDashPluginMeta[]): Promise<void> {
  const nm = path.join(dir, 'node_modules')
  let scopes: string[]
  try {
    scopes = await fs.readdir(nm)
  } catch {
    return
  }
  for (const scope of scopes) {
    if (scope.startsWith('.')) continue
    const scopePath = path.join(nm, scope)
    if (scope.startsWith('@')) {
      let children: string[]
      try {
        children = await fs.readdir(scopePath)
      } catch {
        continue
      }
      for (const child of children) {
        const pkgPath = path.join(scopePath, child, 'package.json')
        const pkg = await readManifest(pkgPath)
        const meta = pkg && toMeta(path.join(scopePath, child), pkg)
        if (meta) out.push(meta)
      }
    } else {
      const pkgPath = path.join(scopePath, 'package.json')
      const pkg = await readManifest(pkgPath)
      const meta = pkg && toMeta(scopePath, pkg)
      if (meta) out.push(meta)
    }
  }
}

export class PluginRegistry {
  private cache: DevDashPluginMeta[] = []
  private loadedMain = new Set<string>()

  /**
   * Discover plugins from:
   * 1) app/plugins/<name>/package.json (in-repo plugin packages)
   * 2) app/plugins/node_modules/** (npm-installed plugins)
   */
  async discover(): Promise<DevDashPluginMeta[]> {
    const bases = this.pluginRoots()
    const found: DevDashPluginMeta[] = []
    const seen = new Set<string>()

    for (const base of bases) {
      let entries: string[]
      try {
        entries = await fs.readdir(base)
      } catch {
        continue
      }
      for (const name of entries) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const dir = path.join(base, name)
        const pkg = await readManifest(path.join(dir, 'package.json'))
        const meta = pkg && toMeta(dir, pkg)
        if (meta && !seen.has(meta.id)) {
          seen.add(meta.id)
          found.push(meta)
        }
      }
      await collectFromNodeModules(base, found)
    }

    // de-dupe by id after node_modules collection
    const byId = new Map<string, DevDashPluginMeta>()
    for (const m of found) {
      if (!byId.has(m.id)) byId.set(m.id, m)
    }
    this.cache = [...byId.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title))
    return this.cache
  }

  private pluginRoots(): string[] {
    const roots: string[] = []
    // Preferred: <project>/plugins (dev & packaged source layout)
    const projectPlugins = path.join(app.getAppPath(), 'plugins')
    roots.push(projectPlugins)
    // Fallback: alongside userData for user-installed plugins
    roots.push(path.join(app.getPath('userData'), 'plugins'))
    return roots
  }

  list(): DevDashPluginMeta[] {
    return this.cache
  }

  byId(id: string): DevDashPluginMeta | undefined {
    return this.cache.find((p) => p.id === id)
  }

  /**
   * Load plugin main-process module if present.
   */
  async loadMain(meta: DevDashPluginMeta): Promise<void> {
    if (!meta.mainEntry) return
    if (this.loadedMain.has(meta.id)) return
    this.loadedMain.add(meta.id)
    try {
      const url = pathToFileURL(meta.mainEntry).href
      const mod = await import(url)
      const plugin = mod.default ?? mod
      if (typeof plugin?.activate === 'function') {
        await plugin.activate({ appPath: app.getAppPath() })
      }
    } catch (error) {
      this.loadedMain.delete(meta.id)
      console.error(`[plugin:${meta.id}] main activate failed`, error)
    }
  }
}

export const pluginRegistry = new PluginRegistry()
