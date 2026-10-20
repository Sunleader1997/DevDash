export type HostTaskStatus = 'running' | 'done' | 'error'

export interface HostTask {
  id: string
  label: string
  status: HostTaskStatus
  detail?: string
  startedAt: number
  endedAt?: number
}

type Listener = () => void

const tasks = new Map<string, HostTask>()
const listeners = new Set<Listener>()

/** Cached snapshot — must keep referential identity between mutations. */
let snapshot: HostTask[] = []
let snapshotDirty = true

function rebuildSnapshot(): void {
  snapshot = [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  snapshotDirty = false
}

function emit(): void {
  snapshotDirty = true
  for (const l of listeners) l()
}

export const taskBus = {
  list(): HostTask[] {
    if (snapshotDirty) rebuildSnapshot()
    return snapshot
  },
  runningCount(): number {
    return snapshotDirty ? rebuildAndCount() : snapshot.filter((t) => t.status === 'running').length
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  async run<T>(id: string, label: string, fn: () => Promise<T>): Promise<T> {
    const task: HostTask = {
      id,
      label,
      status: 'running',
      startedAt: Date.now()
    }
    tasks.set(id, task)
    emit()
    try {
      const result = await fn()
      tasks.set(id, { ...task, status: 'done', endedAt: Date.now() })
      return result
    } catch (error) {
      tasks.set(id, {
        ...task,
        status: 'error',
        detail: (error as Error).message,
        endedAt: Date.now()
      })
      throw error
    } finally {
      emit()
      window.setTimeout(() => {
        const cur = tasks.get(id)
        if (cur && cur.status !== 'running') {
          tasks.delete(id)
          emit()
        }
      }, 8000)
    }
  },
  clearFinished(): void {
    for (const [id, t] of tasks) {
      if (t.status !== 'running') tasks.delete(id)
    }
    emit()
  }
}

function rebuildAndCount(): number {
  rebuildSnapshot()
  return snapshot.filter((t) => t.status === 'running').length
}
