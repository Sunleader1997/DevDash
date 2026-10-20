import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface GitRepoInfo {
  path: string
  name: string
  branch: string | null
  dirtyCount: number
}

export interface GitStatusEntry {
  path: string
  index: string
  worktree: string
  status:
    | 'not-added'
    | 'added'
    | 'added-dirty'
    | 'deleted'
    | 'renamed'
    | 'untracked'
    | 'ignored'
    | 'conflict'
    | 'clean'
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  authorEmail: string
  date: string
}

export interface GitDiffFile {
  path: string
  status: string
  additions: number
  deletions: number
  patch: string
  binary: boolean
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    throw new Error(err.stderr?.trim() || err.message || 'git command failed')
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function classifyPorcelain(index: string, worktree: string): GitStatusEntry['status'] {
  if (index === '!' && worktree === '!') return 'ignored'
  if (index === 'U' || worktree === 'U' || (index === 'A' && worktree === 'A') || (index === 'D' && worktree === 'D')) {
    return 'conflict'
  }
  if (index === '?' && worktree === '?') return 'untracked'
  if (index === 'R' || worktree === 'R' || index === 'C' || worktree === 'C') return 'renamed'
  if (index === 'D' || worktree === 'D') return 'deleted'

  // New file staged and not further modified → green
  if (index === 'A' && (worktree === ' ' || worktree === '')) return 'added'
  // Staged (A/M/...) then worktree changed again → blue
  if (index === 'A' || index === 'M' || index === 'T') {
    if (worktree === 'M' || worktree === 'T') return 'added-dirty'
    if (worktree === ' ' || worktree === '') return index === 'A' ? 'added' : 'added-dirty'
  }
  // Not added to index (worktree-only change or untracked-like) → red
  if (worktree === 'M' || worktree === 'T') return 'not-added'
  if (index === 'M' || index === 'T') return 'added-dirty'

  return 'clean'
}

export class GitService {
  async isRepo(dir: string): Promise<boolean> {
    try {
      const out = await git(dir, ['rev-parse', '--is-inside-work-tree'])
      return out.trim() === 'true'
    } catch {
      return false
    }
  }

  async findRepos(root: string, maxDepth = 3): Promise<string[]> {
    const results: string[] = []

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return
      if (await exists(path.join(dir, '.git'))) {
        results.push(dir)
        return
      }
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue
        await walk(path.join(dir, entry.name), depth + 1)
      }
    }

    await walk(root, 0)
    return results.sort((a, b) => a.localeCompare(b))
  }

  async getRepoInfo(repoPath: string): Promise<GitRepoInfo> {
    const branch = await this.currentBranch(repoPath)
    const status = await this.status(repoPath)
    return {
      path: repoPath,
      name: path.basename(repoPath),
      branch,
      dirtyCount: status.filter((s) => s.status !== 'clean').length
    }
  }

  async currentBranch(repoPath: string): Promise<string | null> {
    try {
      const out = await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
      const name = out.trim()
      return name && name !== 'HEAD' ? name : null
    } catch {
      return null
    }
  }

  async listBranches(repoPath: string): Promise<GitBranch[]> {
    const out = await git(repoPath, ['branch', '--list', '--format=%(refname:short)\t%(HEAD)'])
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, head] = line.split('\t')
        return { name, current: head === '*' }
      })
  }

  async checkout(repoPath: string, branch: string): Promise<void> {
    // Avoid option-injection: resolve to a full ref before checkout.
    const ref = await git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    if (!ref.trim()) {
      throw new Error(`分支不存在: ${branch}`)
    }
    await git(repoPath, ['checkout', ref.trim()])
  }

  async status(repoPath: string): Promise<GitStatusEntry[]> {
    const out = await git(repoPath, ['status', '--porcelain=v1', '-uall', '--ignored=matching'])
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line[0] ?? ' '
        const worktree = line[1] ?? ' '
        let filePath = line.slice(3)
        if (index === 'R' || worktree === 'R' || index === 'C' || worktree === 'C') {
          const parts = filePath.split(' -> ')
          filePath = parts[parts.length - 1] ?? filePath
        }
        return {
          path: filePath,
          index,
          worktree,
          status: classifyPorcelain(index, worktree)
        }
      })
  }

  async listFiles(repoPath: string): Promise<string[]> {
    const tracked = await git(repoPath, ['ls-files'])
    const untracked = await git(repoPath, ['ls-files', '--others', '--exclude-standard'])
    let ignored = ''
    try {
      ignored = await git(repoPath, ['ls-files', '--others', '--ignored', '--exclude-standard'])
    } catch {
      ignored = ''
    }
    const set = new Map<string, boolean>() // path -> ignored
    for (const line of tracked.split('\n').filter(Boolean)) set.set(line, false)
    for (const line of untracked.split('\n').filter(Boolean)) set.set(line, false)
    for (const line of ignored.split('\n').filter(Boolean)) {
      if (!set.has(line)) set.set(line, true)
    }
    return [...set.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([p]) => p)
  }

  async log(repoPath: string, limit = 50, skip = 0): Promise<GitCommit[]> {
    const sep = '\x1f'
    const out = await git(repoPath, [
      'log',
      `--max-count=${limit}`,
      `--skip=${skip}`,
      `--pretty=format:%H${sep}%h${sep}%s${sep}%an${sep}%ae${sep}%aI`
    ])
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, authorName, authorEmail, date] = line.split(sep)
        return {
          hash: hash ?? '',
          shortHash: shortHash ?? '',
          subject: subject ?? '',
          authorName: authorName ?? '',
          authorEmail: authorEmail ?? '',
          date: date ?? ''
        }
      })
  }

  async commitFiles(repoPath: string, commitHash: string): Promise<GitDiffFile[]> {
    // Compare the commit against its parent (or empty tree for root commits).
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    let parent = EMPTY_TREE
    try {
      const out = await git(repoPath, ['rev-parse', '--verify', `${commitHash}^`])
      parent = out.trim() || EMPTY_TREE
    } catch {
      parent = EMPTY_TREE
    }
    return this.diffFiles(repoPath, `${parent}..${commitHash}`)
  }

  async workingDiffFiles(repoPath: string): Promise<GitDiffFile[]> {
    return this.diffFiles(repoPath, 'HEAD')
  }

  async diffText(repoPath: string, args: string[]): Promise<string> {
    return git(repoPath, ['diff', ...args])
  }

  async diffFiles(repoPath: string, range?: string): Promise<GitDiffFile[]> {
    const safeRange = range ? this.assertSafeRevRange(range) : undefined
    const args = ['diff', '--numstat', '-z']
    if (safeRange) args.push(safeRange)
    args.push('--')
    const raw = await git(repoPath, args)
    const patchArgs = ['diff', '--find-renames']
    if (safeRange) patchArgs.push(safeRange)
    patchArgs.push('--')
    const patches = await git(repoPath, patchArgs)

    const files: GitDiffFile[] = []
    // numstat -z: "add\tdel\tpath\0" (renames: "add\tdel\t\0old\0new\0")
    const chunks = raw.split('\0').filter((c) => c.length > 0)
    let i = 0
    while (i < chunks.length) {
      const head = chunks[i]
      const parts = head.split('\t')
      const additions = parts[0] === '-' ? 0 : Number(parts[0] ?? 0)
      const deletions = parts[1] === '-' ? 0 : Number(parts[1] ?? 0)
      let filePath = parts[2] ?? ''
      let binary = parts[0] === '-' || parts[1] === '-'
      if (!filePath) {
        // rename pair
        i += 1
        const oldPath = chunks[i] ?? ''
        i += 1
        filePath = chunks[i] ?? oldPath
      }
      i += 1
      files.push({
        path: filePath,
        status: '',
        additions,
        deletions,
        patch: '',
        binary
      })
    }

    // Attach patch hunks per file from unified diff
    const patchMap = splitUnifiedDiff(patches)
    for (const f of files) {
      const patch = patchMap.get(f.path) ?? patchMap.get(`b/${f.path}`)
      if (patch) {
        f.patch = patch
      }
    }
    return files
  }

  async diffFilePatch(repoPath: string, filePath: string, range?: string): Promise<string> {
    const safePath = this.resolveRepoFile(repoPath, filePath)
    if (range) {
      const safeRange = this.assertSafeRevRange(range)
      return git(repoPath, ['diff', '--find-renames', safeRange, '--', filePath])
    }
    // Untracked: `git diff HEAD -- file` is success+empty — detect explicitly.
    const tracked = await this.isTracked(repoPath, filePath)
    if (!tracked) {
      return this.untrackedPatch(filePath, safePath)
    }
    return git(repoPath, ['diff', 'HEAD', '--', filePath])
  }

  private resolveRepoFile(repoPath: string, filePath: string): string {
    const root = path.resolve(repoPath)
    const target = path.resolve(root, filePath)
    const rel = path.relative(root, target)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`非法路径: ${filePath}`)
    }
    return target
  }

  private assertSafeRevRange(range: string): string {
    // Disallow leading-dash and option-like ranges; allow typical rev syntax.
    if (!/^[A-Za-z0-9._/@^~{}:,\[\]-]+$/.test(range) || range.startsWith('-')) {
      throw new Error(`非法版本范围: ${range}`)
    }
    return range
  }

  private async isTracked(repoPath: string, filePath: string): Promise<boolean> {
    try {
      await git(repoPath, ['ls-files', '--error-unmatch', '--', filePath])
      return true
    } catch {
      return false
    }
  }

  private async untrackedPatch(filePath: string, absolutePath: string): Promise<string> {
    const content = await fs.readFile(absolutePath, 'utf8')
    const lines = content.split('\n')
    const body = lines.map((l) => `+${l}`).join('\n')
    return [
      `diff --git a/${filePath} b/${filePath}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${filePath}`,
      `@@ -0,0 +1,${lines.length} @@`,
      body
    ].join('\n')
  }

  async fileAtRef(repoPath: string, ref: string, filePath: string): Promise<string | null> {
    try {
      const sha = await git(repoPath, ['rev-parse', '--verify', '--end-of-options', ref])
      return await git(repoPath, ['show', `${sha.trim()}:${filePath}`])
    } catch {
      return null
    }
  }
}

function splitUnifiedDiff(patchText: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = patchText.split('\n')
  let current: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (current) map.set(current, buf.join('\n'))
    buf = []
  }
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush()
      // diff --git a/path b/path
      const match = /diff --git a\/(.+) b\/(.+)/.exec(line)
      current = match?.[2] ?? match?.[1] ?? null
      buf = [line]
    } else if (current) {
      buf.push(line)
    }
  }
  flush()
  return map
}

export const gitService = new GitService()
