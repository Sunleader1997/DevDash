#!/usr/bin/env node
/**
 * Scaffold a DevDash user plugin under ./plugins/<id>.
 *
 *   node <plugin-sdk>/create.mjs <id> [--title "标题"]
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sdkRoot = path.dirname(fileURLToPath(import.meta.url))
const templateDir = path.join(sdkRoot, 'template')

function parseArgs(argv) {
  let id = ''
  let title = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--title') {
      title = argv[++i] ?? ''
    } else if (!a.startsWith('--') && !id) {
      id = a
    }
  }
  return { id: id.trim(), title: title.trim() }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(from, to)
    else if (entry.isFile()) await fs.copyFile(from, to)
  }
}

async function replaceInFile(file, pairs) {
  let text = await fs.readFile(file, 'utf8')
  for (const [from, to] of pairs) {
    text = text.split(from).join(to)
  }
  await fs.writeFile(file, text, 'utf8')
}

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const { id, title } = parseArgs(process.argv.slice(2))
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error('用法: node create.mjs <id> [--title "标题"]，id 须为 ^[a-z0-9][a-z0-9-]*$')
  }
  if (title.length > 80) {
    throw new Error('标题过长（≤80 字符）')
  }
  if (/[\u0000-\u001f\u007f]/.test(title)) {
    throw new Error('标题不能包含控制字符')
  }
  const displayTitle = title || id
  const dest = path.join(process.cwd(), 'plugins', id)
  if (await pathExists(dest)) {
    throw new Error(`目标目录已存在，拒绝覆盖: ${dest}`)
  }

  await copyDir(templateDir, dest)
  // JSON.stringify is the only safe way to embed untrusted text into JS sources.
  const pairs = [
    ['__PLUGIN_ID_JSON__', JSON.stringify(id)],
    ['__PLUGIN_TITLE_JSON__', JSON.stringify(displayTitle)]
  ]
  for (const rel of ['src/ui/index.tsx', 'src/main.ts']) {
    await replaceInFile(path.join(dest, rel), pairs)
  }
  const pkgPath = path.join(dest, 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  pkg.name = `devdash-plugin-${id}`
  pkg.devdash.id = id
  pkg.devdash.title = displayTitle
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

  console.log(`[plugin-sdk] created ${dest}`)
  console.log('下一步:')
  console.log(`  cd plugins/${id} && node <plugin-sdk>/build.mjs`)
  console.log('  然后调用 mcp__devdash__refresh_plugins 热加载')
}

main().catch((err) => {
  console.error('[plugin-sdk] create failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
