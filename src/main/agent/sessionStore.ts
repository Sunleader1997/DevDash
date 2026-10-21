import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentTask, ChatMessage } from './types'

const TASKS_FILE = 'agent-tasks.json'
const MSG_PREFIX = 'agent-messages-'
const TOMBSTONES_FILE = 'agent-deleted-sessions.json'

type TaskIndex = {
  tasks: AgentTask[]
}

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

/** Session ids the user deleted — listSessions must not resurrect them. */
async function loadTombstones(): Promise<string[]> {
  try {
    const raw = await fs.readFile(userDataFile(TOMBSTONES_FILE), 'utf8')
    const parsed = JSON.parse(raw) as { ids?: string[] }
    return Array.isArray(parsed.ids) ? parsed.ids : []
  } catch {
    return []
  }
}

async function addTombstone(id: string): Promise<void> {
  const ids = await loadTombstones()
  if (!ids.includes(id)) ids.push(id)
  // keep last 200
  const trimmed = ids.slice(-200)
  const file = userDataFile(TOMBSTONES_FILE)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({ ids: trimmed }, null, 2), 'utf8')
}

export async function isDeleted(id: string): Promise<boolean> {
  const ids = await loadTombstones()
  return ids.includes(id)
}

export async function listTasks(): Promise<AgentTask[]> {
  try {
    const raw = await fs.readFile(userDataFile(TASKS_FILE), 'utf8')
    const parsed = JSON.parse(raw) as TaskIndex
    return Array.isArray(parsed.tasks) ? parsed.tasks : []
  } catch {
    return []
  }
}

async function writeTasks(tasks: AgentTask[]): Promise<void> {
  const file = userDataFile(TASKS_FILE)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({ tasks }, null, 2), 'utf8')
}

export async function createTask(title: string): Promise<AgentTask> {
  const now = Date.now()
  const task: AgentTask = {
    id: randomUUID(),
    title: title.trim() || '新任务',
    createdAt: now,
    updatedAt: now,
    status: 'idle'
  }
  const tasks = await listTasks()
  tasks.unshift(task)
  await writeTasks(tasks)
  return task
}

export async function updateTask(id: string, patch: Partial<AgentTask>): Promise<AgentTask | undefined> {
  const tasks = await listTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx < 0) {
    // Upsert: foreign ids (e.g. SDK session ids) get a local record on first write.
    const now = Date.now()
    const created: AgentTask = {
      id,
      title: patch.title || '新任务',
      createdAt: patch.createdAt ?? now,
      updatedAt: now,
      status: patch.status ?? 'idle',
      ...patch
    }
    tasks.unshift(created)
    await writeTasks(tasks)
    return created
  }
  tasks[idx] = { ...tasks[idx], ...patch, updatedAt: Date.now() }
  await writeTasks(tasks)
  return tasks[idx]
}

export async function deleteTask(id: string): Promise<void> {
  const tasks = await listTasks()
  await writeTasks(tasks.filter((t) => t.id !== id && t.sessionId !== id))
  await addTombstone(id)
  // also tombstone by sessionId if the task had one
  const task = tasks.find((t) => t.id === id)
  if (task?.sessionId) await addTombstone(task.sessionId)
  await fs.rm(userDataFile(`${MSG_PREFIX}${id}.json`), { force: true })
  if (task?.sessionId && task.sessionId !== id) {
    await fs.rm(userDataFile(`${MSG_PREFIX}${task.sessionId}.json`), { force: true })
  }
  // Best-effort: remove the SDK transcript so listSessions drops it too
  try {
    const { deleteSession } = await import('@anthropic-ai/claude-agent-sdk')
    await deleteSession(task?.sessionId ?? id, { dir: process.cwd() })
  } catch {
    /* transcript may not exist locally */
  }
}

export async function getTask(id: string): Promise<AgentTask | undefined> {
  const tasks = await listTasks()
  return tasks.find((t) => t.id === id)
}

export async function loadMessages(taskId: string): Promise<ChatMessage[]> {
  try {
    const raw = await fs.readFile(userDataFile(`${MSG_PREFIX}${taskId}.json`), 'utf8')
    const parsed = JSON.parse(raw) as { messages?: ChatMessage[] }
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}

export async function appendMessage(taskId: string, message: ChatMessage): Promise<void> {
  const messages = await loadMessages(taskId)
  messages.push(message)
  await writeMessages(taskId, messages)
}

export async function replaceMessage(taskId: string, messageId: string, patch: Partial<ChatMessage>): Promise<void> {
  const messages = await loadMessages(taskId)
  const idx = messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return
  messages[idx] = { ...messages[idx], ...patch }
  await writeMessages(taskId, messages)
}

async function writeMessages(taskId: string, messages: ChatMessage[]): Promise<void> {
  const file = userDataFile(`${MSG_PREFIX}${taskId}.json`)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({ messages }, null, 2), 'utf8')
}
