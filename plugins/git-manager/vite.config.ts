import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const ui = (p: string) => resolve(__dirname, 'src/ui', p)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react\/jsx-dev-runtime$/, replacement: ui('host-jsx-runtime.ts') },
      { find: /^react\/jsx-runtime$/, replacement: ui('host-jsx-runtime.ts') },
      { find: /^react-dom\/client$/, replacement: ui('host-react.ts') },
      { find: /^react-dom$/, replacement: ui('host-react.ts') },
      { find: /^react$/, replacement: ui('host-react.ts') }
    ]
  },
  build: {
    lib: {
      entry: {
        ui: resolve(__dirname, 'src/ui/index.tsx'),
        main: resolve(__dirname, 'src/main.ts')
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: ['electron', /^node:/],
      output: {
        inlineDynamicImports: false
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false
  }
})
