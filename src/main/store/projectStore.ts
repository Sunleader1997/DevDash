import { promises as fs } from 'node:fs'
import path from 'node:path'

const DIR = '.devDash'
const STATE_FILE = 'ui-state.json'
const IGNORE_LINE = '.devDash/'

export interface ProjectUiState {
  [key: string]: unknown
}

/**
 * Project-local persistence under <project>/.devDash/.
 * First write creates the directory and appends `.devDash/` to .gitignore if missing.
 */
export class ProjectStore {
  private dirPath(projectPath: string): string {
    return path.join(projectPath, DIR)
  }

  async ensure(projectPath: string): Promise<string> {
    const dir = this.dirPath(projectPath)
    await fs.mkdir(dir, { recursive: true })
    await this.ensureGitignore(projectPath)
    return dir
  }

  private async ensureGitignore(projectPath: string): Promise<void> {
    const gi = path.join(projectPath, '.gitignore')
    let content = ''
    try {
      content = await fs.readFile(gi, 'utf8')
    } catch {
      content = ''
    }
    const lines = content.split(/\r?\n/)
    const has = lines.some(
      (l) => l.trim() === IGNORE_LINE || l.trim() === '.devDash' || l.trim() === '/.devDash/'
    )
    if (!has) {
      const next =
        content.endsWith('\n') || content === ''
          ? `${content}${IGNORE_LINE}\n`
          : `${content}\n${IGNORE_LINE}\n`
      await fs.writeFile(gi, next, 'utf8')
    }
  }

  async read(projectPath: string): Promise<ProjectUiState> {
    const file = path.join(this.dirPath(projectPath), STATE_FILE)
    try {
      const raw = await fs.readFile(file, 'utf8')
      return JSON.parse(raw) as ProjectUiState
    } catch {
      return {}
    }
  }

  async write(projectPath: string, state: ProjectUiState): Promise<void> {
    await this.ensure(projectPath)
    const file = path.join(this.dirPath(projectPath), STATE_FILE)
    await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf8')
  }

  async patch(projectPath: string, partial: ProjectUiState): Promise<ProjectUiState> {
    const current = await this.read(projectPath)
    const next = { ...current, ...partial }
    await this.write(projectPath, next)
    return next
  }
}

export const projectStore = new ProjectStore()
