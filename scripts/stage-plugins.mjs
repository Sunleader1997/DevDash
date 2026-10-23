#!/usr/bin/env node
/**
 * Stage built-in plugins for electron-builder extraResources.
 *
 * Sample plugins (e.g. git-manager) must ship as standalone plugin packages
 * under <resources>/plugins/<id>/, not inside app.asar. Only the manifest and
 * dist bundles are staged — never sources or node_modules.
 *
 * Usage: node scripts/stage-plugins.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = join(root, 'plugins')
const outRoot = join(root, 'build', 'plugins')

/** Keep the install package lean — match historical `!*.map` packaging exclude. */
function copyDist(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDist(from, to)
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name.endsWith('.map')) continue
    cpSync(from, to)
  }
}

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })

if (!existsSync(pluginsDir)) {
  console.error(`[stage-plugins] missing ${pluginsDir}`)
  process.exit(1)
}

const staged = []
for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(pluginsDir, entry.name)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch {
    continue
  }
  if (!pkg.devdash?.id) continue

  const dest = join(outRoot, entry.name)
  mkdirSync(dest, { recursive: true })
  cpSync(pkgPath, join(dest, 'package.json'))

  const distSrc = join(dir, 'dist')
  if (!existsSync(distSrc) || !statSync(distSrc).isDirectory()) {
    console.error(`[stage-plugins] ${entry.name}: missing dist/ — run npm run build:plugins first`)
    process.exit(1)
  }
  copyDist(distSrc, join(dest, 'dist'))
  staged.push(pkg.devdash.id)
}

if (!staged.length) {
  console.error('[stage-plugins] no plugins with a devdash manifest found')
  process.exit(1)
}

console.log(`[stage-plugins] staged ${staged.length} plugin(s) → ${outRoot}: ${staged.join(', ')}`)
