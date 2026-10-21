import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Bundled skill ids that ship with the installer. */
export const BUNDLED_SKILL_IDS = ['compose-next', 'devdash-plugin-dev', 'playwright'] as const

function bundledSourceDir(): string {
  // Packaged: extraResources → <resources>/skills
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'skills')
  }
  // Dev: repo root bundled-skills/
  return path.join(app.getAppPath(), 'bundled-skills')
}

export function userDataSkillsDir(): string {
  return path.join(app.getPath('userData'), 'skills')
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(from, to)
    } else if (entry.isFile()) {
      await fs.copyFile(from, to)
    }
  }
}

async function copyDirOverwrite(src: string, dest: string): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true })
  await copyDir(src, dest)
}

/**
 * Always (re)copy bundled skills into userData/skills.
 * Install package is source of truth; user edits under userData/skills are overwritten.
 * Failures are non-fatal.
 */
export async function seedBundledSkills(): Promise<{ copied: string[]; skipped: string[]; error?: string }> {
  const srcRoot = bundledSourceDir()
  const destRoot = userDataSkillsDir()
  const copied: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  try {
    await fs.mkdir(destRoot, { recursive: true })
    for (const id of BUNDLED_SKILL_IDS) {
      const src = path.join(srcRoot, id)
      const dest = path.join(destRoot, id)
      try {
        await fs.access(path.join(src, 'SKILL.md'))
      } catch {
        skipped.push(id)
        continue
      }
      try {
        await copyDirOverwrite(src, dest)
        copied.push(id)
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (errors.length) {
      const message = errors.join('; ')
      console.warn('[skills] seedBundledSkills partial failure:', message)
      return { copied, skipped, error: message }
    }
    return { copied, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[skills] seedBundledSkills failed:', message)
    return { copied, skipped, error: message }
  }
}

/** Fallback scan roots (resourcesPath only in packaged builds). */
export function bundledSkillsScanDir(): string | null {
  if (!app.isPackaged) return null
  return path.join(process.resourcesPath, 'skills')
}
