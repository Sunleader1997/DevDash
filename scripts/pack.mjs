#!/usr/bin/env node
/**
 * Cross-platform electron-builder pack entry.
 *
 * npm scripts used `export VAR=... && ...` (bash only). Windows cmd/PowerShell
 * rejects `export`, so `npm run pack:win` died before build. Set mirrors here
 * and run the full pack chain in-process instead.
 *
 * Usage:
 *   node scripts/pack.mjs win32 x64
 *   node scripts/pack.mjs win32 x64 --dir
 *   node scripts/pack.mjs darwin arm64
 *   node scripts/pack.mjs linux x64
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const platform = process.argv[2] || process.platform
const rest = process.argv.slice(3)
const dirOnly = rest.includes('--dir')
const arch = rest.find((a) => a !== '--dir') || 'x64'

const TARGET = {
  win32: 'win',
  darwin: 'mac',
  linux: 'linux'
}

const target = TARGET[platform]
if (!target) {
  console.error(`[pack] unsupported platform ${platform} (expected win32|darwin|linux)`)
  process.exit(1)
}

const env = {
  ...process.env,
  // Default GitHub is often unreachable from CN; cache hits still pull
  // SHASUMS256.txt from the same origin, so an unset mirror can hang packaging.
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/'
}

const isWinHost = process.platform === 'win32'
const npmCmd = isWinHost ? 'npm.cmd' : 'npm'
const electronBuilder = join(
  root,
  'node_modules',
  '.bin',
  isWinHost ? 'electron-builder.cmd' : 'electron-builder'
)

function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    console.log(`[pack] $ ${cmd} ${args.join(' ')}`)
    // .cmd shims on Windows require a shell; args are fixed literals (no user input).
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: isWinHost,
      env
    })
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    )
    child.on('error', reject)
  })
}

const builderArgs = [`--${target}`]
if (dirOnly) builderArgs.push('dir')

console.log(`[pack] ${platform}/${arch}${dirOnly ? ' (dir)' : ''}`)
await run(npmCmd, ['run', 'build'])
await run(process.execPath, [join(root, 'scripts', 'stage-claude-bin.mjs'), platform, arch])
await run(npmCmd, ['run', 'stage:plugins'])
await run(electronBuilder, builderArgs)
console.log(`[pack] done -> release/`)
