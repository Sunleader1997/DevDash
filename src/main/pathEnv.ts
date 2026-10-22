import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * GUI-launched Electron often inherits a minimal PATH (macOS:
 * /usr/bin:/bin:/usr/sbin:/sbin). Claude Agent SDK Bash tools then cannot
 * resolve node/npm (`#!/usr/bin/env node` fails with "env: node: No such
 * file or directory"). Enrich once at process start so every child —
 * the claude CLI, plugin builds, smoke scripts — sees a usable PATH.
 */

function pathDelimiter(): string {
  return process.platform === 'win32' ? ';' : ':'
}

function splitPath(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(pathDelimiter())
    .map((part) => part.trim())
    .filter(Boolean)
}

function mergePath(...lists: string[][]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const dir of list) {
      const key = process.platform === 'win32' ? dir.toLowerCase() : dir
      if (seen.has(key)) continue
      seen.add(key)
      out.push(dir)
    }
  }
  return out.join(pathDelimiter())
}

function probeLoginShellPath(): string[] {
  try {
    if (process.platform === 'win32') {
      const script =
        '[Environment]::GetEnvironmentVariable("Path","Machine"); ' +
        '[Environment]::GetEnvironmentVariable("Path","User")'
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return out.split(/\r?\n/).flatMap((line) => splitPath(line))
    }
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    // -i loads .zshrc/.bashrc where nvm & homebrew usually live; markers keep
    // greeting noise out of the captured PATH.
    const begin = '__DEVDASH_PATH_BEGIN__'
    const end = '__DEVDASH_PATH_END__'
    const out = execFileSync(shell, ['-ilc', `printf '%s' '${begin}'\"$PATH\"'${end}'`], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const matched = out.match(new RegExp(`${begin}([\\s\\S]*?)${end}`))
    return splitPath(matched?.[1] ?? '')
  } catch {
    return []
  }
}

function nvmBinDirs(): string[] {
  const base = path.join(homedir(), '.nvm', 'versions', 'node')
  try {
    return readdirSync(base)
      .map((v) => path.join(base, v, 'bin'))
      .filter((dir) => existsSync(path.join(dir, 'node')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  } catch {
    return []
  }
}

function knownNodeDirs(): string[] {
  const home = homedir()
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return [
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
      path.join(appData, 'npm'),
      path.join(localAppData, 'Volta', 'bin'),
      path.join(appData, 'nvm'),
      path.join(home, 'scoop', 'shims'),
      ...nvmBinDirs()
    ]
  }
  return ['/usr/local/bin', '/opt/homebrew/bin', path.join(home, '.local', 'bin'), ...nvmBinDirs()]
}

function findCommandDir(cmd: string, dirs: string[]): string | undefined {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      if (existsSync(path.join(dir, cmd + ext))) return dir
    }
  }
  return undefined
}

function absoluteNodeFallbackDirs(): string[] {
  if (process.platform === 'win32') return []
  return [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    ...nvmBinDirs(),
    ...knownNodeDirs()
  ]
}

/** Mutates `process.env.PATH` in place. Idempotent. */
export function enrichProcessPath(): void {
  const current = splitPath(process.env.PATH)
  const login = probeLoginShellPath()
  const known = knownNodeDirs()
  process.env.PATH = mergePath(login, known, current)

  if (findCommandDir('node', splitPath(process.env.PATH))) return

  // Last resort: pin the directory of a node we can see on disk.
  const pinned = findCommandDir('node', absoluteNodeFallbackDirs())
  if (pinned) {
    process.env.PATH = mergePath([pinned], splitPath(process.env.PATH))
  }
}

export function resolveNodeDir(): string | undefined {
  return findCommandDir('node', splitPath(process.env.PATH))
}
