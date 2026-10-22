import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { SkillInfo } from './types'
import { bundledSkillsScanDir, userDataSkillsDir } from './skillSeed'
import { repoRoot } from './repoRoot'

function skillDirs(): string[] {
  const root = repoRoot()
  const dirs = [
    path.join(root, '.claude', 'skills'),
    path.join(root, '.mimocode', 'skills'),
    // Seeded from bundled-skills on every launch (always overwrite).
    userDataSkillsDir(),
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.config', 'mimocode', 'skills'),
    path.join(os.homedir(), '.agents', 'skills')
  ]
  // Packaged resources sit before home dirs so a failed seed still prefers shipped skills.
  const packaged = bundledSkillsScanDir()
  if (packaged) dirs.splice(3, 0, packaged)
  return dirs
}

/**
 * Discover skills from common locations (project + user).
 * A skill is a directory containing SKILL.md.
 */
export async function listSkills(): Promise<SkillInfo[]> {
  const out: SkillInfo[] = []
  const seen = new Set<string>()

  for (const dir of skillDirs()) {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const skillDir = path.join(dir, name)
      const md = path.join(skillDir, 'SKILL.md')
      try {
        const stat = await fs.stat(skillDir)
        if (!stat.isDirectory()) continue
        await fs.access(md)
      } catch {
        continue
      }
      if (seen.has(name)) continue
      seen.add(name)

      let title = name
      let description = ''
      try {
        const text = await fs.readFile(md, 'utf8')
        const front = text.match(/^---\n([\s\S]*?)\n---/)
        const body = front ? front[1] : text.slice(0, 400)
        const nameM = body.match(/^name:\s*(.+)$/m)
        const descM = body.match(/^description:\s*(.+)$/m)
        if (nameM) title = nameM[1].trim().replace(/^['"]|['"]$/g, '')
        if (descM) description = descM[1].trim().replace(/^['"]|['"]$/g, '')
        if (!description) {
          const firstPara = text
            .replace(/^---\n[\s\S]*?\n---\n/, '')
            .split(/\n\n+/)
            .find((p) => p.trim() && !p.startsWith('#'))
          description = (firstPara ?? '').trim().slice(0, 120)
        }
      } catch {
        /* keep defaults */
      }

      out.push({
        id: name,
        title,
        description,
        source: dir
      })
    }
  }

  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

/** Build context block for referenced skills (mirrors plugin # context). */
export function buildSkillContext(skillRefs: string[], skills: SkillInfo[]): string {
  if (!skillRefs.length) return ''
  const lines = skillRefs.map((id) => {
    const s = skills.find((x) => x.id === id)
    return [
      `- skill: ${id}`,
      `  title: ${s?.title ?? id}`,
      s?.description ? `  description: ${s.description}` : '',
      `  用法: 需要该能力时按 skill 说明执行；可读 skill 目录下的 SKILL.md 与附属资源。`
    ]
      .filter(Boolean)
      .join('\n')
  })
  return `\n\n【Skill 上下文】\n${lines.join('\n')}\n`
}
