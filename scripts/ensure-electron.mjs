/**
 * Ensures node_modules/electron/path.txt exists after npm install.
 * Electron's own postinstall can fail silently (proxy/cache), leaving electron-vite
 * with "Electron uninstall" even though dist/electron.exe is present.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = join(root, 'node_modules', 'electron')
const pathTxt = join(electronDir, 'path.txt')
const dist = join(electronDir, 'dist')

if (!existsSync(electronDir) || !existsSync(dist)) {
  process.exit(0)
}

const exe = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
const candidates = [exe, ...readdirSync(dist).filter((n) => n.startsWith('electron') && !n.endsWith('.pak'))]

const needWrite = !existsSync(pathTxt) || !readFileSync(pathTxt, 'utf8').trim()
if (needWrite) {
  const pick = candidates.find((name) => existsSync(join(dist, name))) ?? exe
  writeFileSync(pathTxt, pick, 'utf8')
  console.log(`[ensure-electron] wrote path.txt -> ${pick}`)
} else {
  console.log(`[ensure-electron] path.txt ok (${readFileSync(pathTxt, 'utf8')})`)
}
