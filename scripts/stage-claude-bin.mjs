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
import { copyFileSync, chmodSync, existsSync, mkdirSync, openSync, readSync, closeSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Reject truncated PE (e.g. a partial npm extract) before it reaches the installer. */
function assertPeComplete(path) {
  const size = statSync(path).size
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(1024)
    readSync(fd, head, 0, head.length, 0)
    if (head[0] !== 0x4d || head[1] !== 0x5a) throw new Error('not MZ')
    const peOff = head.readUInt32LE(0x3c)
    const pe = Buffer.alloc(24 + 256)
    readSync(fd, pe, 0, pe.length, peOff)
    if (pe.readUInt32LE(0) !== 0x4550) throw new Error('bad PE signature')
    const nsec = pe.readUInt16LE(6)
    const optSize = pe.readUInt16LE(20)
    const secOff = peOff + 24 + optSize
    const sec = Buffer.alloc(nsec * 40)
    readSync(fd, sec, 0, sec.length, secOff)
    for (let i = 0; i < nsec; i++) {
      const rawSize = sec.readUInt32LE(i * 40 + 16)
      const rawPtr = sec.readUInt32LE(i * 40 + 20)
      if (rawPtr + rawSize > size) {
        throw new Error(`section ${sec.subarray(i * 40, i * 40 + 8).toString('latin1').replace(/\0.*$/, '')} extends past EOF (${rawPtr + rawSize} > ${size})`)
      }
    }
  } finally {
    closeSync(fd)
  }
}

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

if (platform === 'win32') {
  try {
    assertPeComplete(src)
  } catch (err) {
    console.error(`[stage-claude-bin] ${spec} is not a complete PE: ${err.message}`)
    console.error('[stage-claude-bin] re-extract the package (npm i) before packing')
    process.exit(1)
  }
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
