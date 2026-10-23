import { watch as fsWatch, promises as fsp, type FSWatcher } from 'node:fs'
import path from 'node:path'

export type WatchWaitResult = { changed: boolean }

type Waiter = {
  resolve: (r: WatchWaitResult) => void
  timer: ReturnType<typeof setTimeout>
}

const DEBOUNCE_MS = 300
const IGNORE_RE = /(^|[\\/])(\.git|node_modules|dist|\.devDash)([\\/]|$)/
const GIT_DIR_ENTRIES = new Set([
  'HEAD',
  'index',
  'packed-refs',
  'ORIG_HEAD',
  'HEAD.lock',
  'index.lock',
  'packed-refs.lock',
  'ORIG_HEAD.lock'
])

/** Injectable fs subset so debounce/timeout behavior is testable without a real tree. */
export type WatcherFs = {
  watch: (
    filename: string,
    options: { recursive?: boolean },
    listener: (event: string, filename: string | null) => void
  ) => FSWatcher
}

function shouldIgnore(relOrName: string): boolean {
  const norm = relOrName.replace(/\\/g, '/')
  return IGNORE_RE.test(norm)
}

/**
 * Per-repo change fan-in: `.git` entry watch + recursive worktree watch,
 * coalesced by a trailing-edge debounce. `wait` long-polls until a change
 * or timeout; `stop` is idempotent and settles pending waiters with {changed:false}.
 */
export class RepoWatcher {
  private watchers: FSWatcher[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private waiter: Waiter | null = null
  private closed = false
  /** Sticky: a debounced change that arrived while nobody was waiting. */
  private dirty = false

  constructor(
    private readonly repoPath: string,
    private readonly fsImpl: WatcherFs = {
      watch: (filename, options, listener) => fsWatch(filename, options, listener)
    },
    private readonly debounceMs: number = DEBOUNCE_MS
  ) {}

  async start(): Promise<void> {
    if (this.closed) throw new Error('watcher closed')
    if (this.watchers.length > 0) return
    if (!(await fsp.stat(this.repoPath)).isDirectory()) {
      throw new Error(`not a directory: ${this.repoPath}`)
    }

    // Git rewrites index/HEAD via rename — watch the .git dir and filter names.
    this.watchSafe(path.join(this.repoPath, '.git'), { recursive: false }, (event, filename) => {
      const name = filename ?? ''
      if (name && !GIT_DIR_ENTRIES.has(path.basename(name))) return
      this.scheduleFire()
    })

    // Worktree: any non-ignored path change. recursive may be unsupported → degrade.
    this.watchSafe(this.repoPath, { recursive: true }, (_event, filename) => {
      if (filename && shouldIgnore(filename)) return
      this.scheduleFire()
    })

    if (this.watchers.length === 0) {
      throw new Error(`no watchable paths under: ${this.repoPath}`)
    }
  }

  private watchSafe(
    target: string,
    options: { recursive: boolean },
    listener: (event: string, filename: string | null) => void
  ): void {
    try {
      const w = this.fsImpl.watch(target, options, listener)
      w.on('error', () => {
        /* degrade: other watchers keep running */
      })
      this.watchers.push(w)
    } catch (e) {
      console.warn(`[git-manager] watch degrade for ${target}:`, e)
    }
  }

  private scheduleFire(): void {
    if (this.closed) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.fire()
    }, this.debounceMs)
    if (typeof (this.debounceTimer as { unref?: () => void }).unref === 'function') {
      ;(this.debounceTimer as { unref: () => void }).unref()
    }
  }

  private fire(): void {
    const w = this.waiter
    if (!w) {
      // No waiter yet (e.g. UI still refreshing) — keep the wakeup sticky.
      this.dirty = true
      return
    }
    this.dirty = false
    this.waiter = null
    clearTimeout(w.timer)
    w.resolve({ changed: true })
  }

  wait(timeoutMs = 30_000): Promise<WatchWaitResult> {
    if (this.closed) return Promise.resolve({ changed: false })
    if (this.waiter) return Promise.reject(new Error('watch already waiting'))
    if (this.dirty) {
      this.dirty = false
      return Promise.resolve({ changed: true })
    }
    return new Promise<WatchWaitResult>((resolve) => {
      // Do not unref: the timeout is part of the wait contract and must fire.
      const timer = setTimeout(() => {
        if (this.waiter?.resolve === resolve) {
          this.waiter = null
          resolve({ changed: false })
        }
      }, timeoutMs)
      this.waiter = { resolve, timer }
    })
  }

  stop(): void {
    if (this.closed) return
    this.closed = true
    this.dirty = false
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    for (const w of this.watchers) {
      try {
        w.close()
      } catch {
        /* noop */
      }
    }
    this.watchers = []
    const waiter = this.waiter
    this.waiter = null
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve({ changed: false })
    }
  }
}

/** One watcher per repo path; `wait` starts on demand. */
export class RepoWatcherRegistry {
  private map = new Map<string, { watcher: RepoWatcher; ready: Promise<void> }>()

  private key(repoPath: string): string {
    return path.resolve(repoPath)
  }

  async wait(repoPath: string, timeoutMs?: number): Promise<WatchWaitResult> {
    const key = this.key(repoPath)
    let entry = this.map.get(key)
    if (!entry) {
      // Reserve before any await so concurrent wait() cannot double-create.
      const watcher = new RepoWatcher(key)
      const ready = watcher.start().catch((e: unknown) => {
        this.map.delete(key)
        watcher.stop()
        throw e
      })
      entry = { watcher, ready }
      this.map.set(key, entry)
    }
    await entry.ready
    return entry.watcher.wait(timeoutMs)
  }

  stop(repoPath: string): void {
    const key = this.key(repoPath)
    const entry = this.map.get(key)
    if (!entry) return
    entry.watcher.stop()
    this.map.delete(key)
  }

  stopAll(): void {
    for (const entry of this.map.values()) entry.watcher.stop()
    this.map.clear()
  }
}

export const repoWatcherRegistry = new RepoWatcherRegistry()
