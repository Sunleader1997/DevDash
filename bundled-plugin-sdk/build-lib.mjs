import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)

/** SDK root (bundled-plugin-sdk/ or resources/plugin-sdk/). */
export const sdkRoot = path.dirname(fileURLToPath(import.meta.url))

const UI_CANDIDATES = [
  'src/ui/index.tsx',
  'src/ui/index.ts',
  'src/ui/index.jsx',
  'src/ui/index.js',
  'src/ui.tsx',
  'src/ui.ts'
]
const MAIN_CANDIDATES = ['src/main.ts', 'src/main.js', 'src/main.tsx']

/**
 * Resolve esbuild-wasm: packaged vendor first, then monorepo node_modules.
 */
export function loadEsbuild() {
  const candidates = [
    path.join(sdkRoot, 'vendor', 'esbuild-wasm'),
    path.join(sdkRoot, '..', 'node_modules', 'esbuild-wasm'),
    path.join(sdkRoot, '..', '..', 'node_modules', 'esbuild-wasm')
  ]
  for (const dir of candidates) {
    try {
      return require_(dir)
    } catch {
      /* try next */
    }
  }
  try {
    return require_('esbuild-wasm')
  } catch (error) {
    throw new Error(
      `找不到 esbuild-wasm。期望位置: ${candidates[0]} 或开发态 node_modules。\n${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function shims() {
  return {
    react: path.join(sdkRoot, 'shims', 'host-react.ts'),
    jsx: path.join(sdkRoot, 'shims', 'host-jsx-runtime.ts')
  }
}

export function reactAliases() {
  const s = shims()
  return {
    react: s.react,
    'react/jsx-runtime': s.jsx,
    'react/jsx-dev-runtime': s.jsx,
    'react-dom': s.react,
    'react-dom/client': s.react
  }
}

export async function findEntry(dir, candidates, label) {
  const { promises: fs } = await import('node:fs')
  for (const rel of candidates) {
    const abs = path.join(dir, rel)
    try {
      await fs.access(abs)
      return abs
    } catch {
      /* next */
    }
  }
  throw new Error(`找不到 ${label} 入口。已尝试: ${candidates.join(', ')}（相对 ${dir}）`)
}

export { UI_CANDIDATES, MAIN_CANDIDATES }
