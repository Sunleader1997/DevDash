/**
 * Builds every DevDash plugin package under plugins/* that has a vite.config
 * and a `devdash` manifest. Emits ESM bundles to each plugin's dist/.
 */
import { readdir, readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = join(root, 'plugins')

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function run(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    // npm.cmd on Windows requires a shell; args are fixed literals (no user input).
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))))
    child.on('error', reject)
  })
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const entries = await readdir(pluginsDir, { withFileTypes: true })
let built = 0

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const dir = join(pluginsDir, entry.name)
  const pkgPath = join(dir, 'package.json')
  if (!(await exists(pkgPath))) continue
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  if (!pkg.devdash) continue
  if (!(await exists(join(dir, 'vite.config.ts'))) && !(await exists(join(dir, 'vite.config.js')))) {
    console.log(`[build-plugins] skip ${entry.name}: no vite config`)
    continue
  }
  console.log(`[build-plugins] building ${pkg.name || entry.name}…`)
  await run(npmCmd, ['run', 'build'], dir)
  built += 1
}

console.log(`[build-plugins] done (${built} plugin(s))`)
