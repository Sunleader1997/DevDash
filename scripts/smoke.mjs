/**
 * Smoke: plugin discovery + git porcelain against a temp repo + manifest ipc.
 * Run: node scripts/smoke.mjs
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const pluginsDir = path.join(root, 'plugins')
const entries = await fs.readdir(pluginsDir, { withFileTypes: true })
const found = []
for (const e of entries) {
  if (!e.isDirectory()) continue
  const pkgPath = path.join(pluginsDir, e.name, 'package.json')
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
    if (pkg.devdash?.id) {
      found.push(pkg.devdash.id)
      const manifest = pkg.devdash
      const ipc = Array.isArray(manifest.ipc) ? manifest.ipc : []

      // Generic manifest checks: every discovered plugin must ship its bundles.
      const uiJs = path.join(pluginsDir, e.name, manifest.ui ?? 'dist/ui.js')
      const uiOk = await fs.access(uiJs).then(() => true).catch(() => false)
      console.log(`${manifest.id} ui bundle:`, uiOk ? 'OK' : 'MISSING')
      if (!uiOk) process.exit(1)

      if (manifest.main) {
        const mainJs = path.join(pluginsDir, e.name, manifest.main)
        const mainOk = await fs.access(mainJs).then(() => true).catch(() => false)
        console.log(`${manifest.id} main bundle:`, mainOk ? 'OK' : 'MISSING')
        if (!mainOk) process.exit(1)
      }

      if (manifest.id === 'git-manager') {
        if (ipc.length === 0) {
          console.error('FAIL: git-manager manifest missing devdash.ipc')
          process.exit(1)
        }
        console.log('git-manager ipc suffixes:', ipc.length)
      }
    }
  } catch {
    /* ignore */
  }
}
console.log('plugins discovered:', found)
if (!found.includes('git-manager')) {
  console.error('FAIL: git-manager plugin not discovered')
  process.exit(1)
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devdash-git-'))
await execFileAsync('git', ['init', tmp])
await execFileAsync('git', ['-C', tmp, 'config', 'user.email', 't@t.local'])
await execFileAsync('git', ['-C', tmp, 'config', 'user.name', 't'])
await fs.writeFile(path.join(tmp, 'a.txt'), 'hello\n')
await execFileAsync('git', ['-C', tmp, 'add', '.'])
await execFileAsync('git', ['-C', tmp, 'commit', '-m', 'init'])
await fs.writeFile(path.join(tmp, 'a.txt'), 'hello\nworld\n')
await fs.writeFile(path.join(tmp, 'b.txt'), 'new\n')

// Mirrors gitService porcelain parse (now lives in plugins/git-manager).
const { stdout } = await execFileAsync('git', ['-C', tmp, 'status', '--porcelain=v1', '-uall'])
const rows = stdout.split('\n').filter(Boolean).map((line) => ({
  index: line[0],
  worktree: line[1],
  path: line.slice(3)
}))
console.log('status rows:', rows)
if (!rows.some((r) => r.path === 'a.txt') || !rows.some((r) => r.path === 'b.txt')) {
  console.error('FAIL: expected modified + untracked')
  process.exit(1)
}
const ui = path.join(pluginsDir, 'git-manager', 'dist', 'ui.js')
const uiOk = await fs.access(ui).then(() => true).catch(() => false)
console.log('plugin ui bundle:', uiOk ? 'OK' : 'MISSING')
if (!uiOk) process.exit(1)
console.log('SMOKE PASS')
