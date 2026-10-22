#!/usr/bin/env node
/**
 * Stage the native Claude Code CLI for electron-builder extraResources.
 *
 * electron-builder `extraResources.from` must exist at pack time and cannot be
 * platform-conditional, so we copy the matching optionalDependency binary into
 * build/claude-bin/ first.
 *
 * Usage: node scripts/stage-claude-bin.mjs <win32|darwin|linux> <arch>
 */
import { copyFileSync, chmodSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2] || process.platform
const arch = process.argv[3] || process.arch

const PKG = {
  'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
  'win32-arm64': '@anthropic-ai/claude-agent-sdk-win32-arm64/claude.exe',
  'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64/claude',
  'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
  'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
  'linux-arm64': '@anthropic-ai/claude-agent-sdk-linux-arm64/claude'
}

const key = `${platform}-${arch}`
const spec = PKG[key]
if (!spec) {
  console.error(`[stage-claude-bin] unsupported target ${key}`)
  process.exit(1)
}

const src = join(root, 'node_modules', spec)
if (!existsSync(src)) {
  console.error(`[stage-claude-bin] missing ${spec}`)
  console.error(`[stage-claude-bin] run: npm i -D ${spec.split('/')[0]}/${spec.split('/')[1]}`)
  process.exit(1)
}

const outDir = join(root, 'build', 'claude-bin')
const binName = platform === 'win32' ? 'claude.exe' : 'claude'
const dest = join(outDir, binName)

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
copyFileSync(src, dest)
if (platform !== 'win32') chmodSync(dest, 0o755)

const mb = (statSync(dest).size / 1024 / 1024).toFixed(1)
console.log(`[stage-claude-bin] ${key} → ${dest} (${mb} MB)`)
