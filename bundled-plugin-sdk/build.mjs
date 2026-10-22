#!/usr/bin/env node
/**
 * Build a DevDash user plugin into dist/ui.js + dist/main.js.
 * Run from the plugin package root (the directory that contains package.json).
 *
 *   node <plugin-sdk>/build.mjs
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  findEntry,
  loadEsbuild,
  MAIN_CANDIDATES,
  reactAliases,
  UI_CANDIDATES
} from './build-lib.mjs'

async function readManifest(dir) {
  const file = path.join(dir, 'package.json')
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const cwd = process.cwd()
  const pkg = await readManifest(cwd)
  if (!pkg?.devdash?.id || !pkg?.devdash?.title) {
    throw new Error(`当前目录不是完整 DevDash 插件包（package.json 需含 devdash.id 与 devdash.title）: ${cwd}`)
  }

  const esbuild = loadEsbuild()
  const alias = reactAliases()
  const uiEntry = await findEntry(cwd, UI_CANDIDATES, 'UI')
  const mainEntry = await findEntry(cwd, MAIN_CANDIDATES, 'main')

  const outDir = path.join(cwd, 'dist')
  await fs.mkdir(outDir, { recursive: true })

  const common = {
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120', 'safari16'],
    sourcemap: true,
    minify: false,
    jsx: 'automatic',
    alias,
    external: ['electron', 'node:*'],
    logLevel: 'warning'
  }

  await esbuild.build({
    ...common,
    entryPoints: [uiEntry],
    outfile: path.join(outDir, 'ui.js')
  })

  await esbuild.build({
    ...common,
    platform: 'node',
    entryPoints: [mainEntry],
    outfile: path.join(outDir, 'main.js')
  })

  console.log(`[plugin-sdk] built ${pkg.devdash.id}`)
  console.log(`  ui   → dist/ui.js`)
  console.log(`  main → dist/main.js`)
}

main().catch((err) => {
  console.error('[plugin-sdk] build failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
