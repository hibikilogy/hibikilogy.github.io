import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { globEntries } from './scripts/vite/entries/index'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config/index'
import { syncBuildOutputPlugin } from './scripts/vite/sync-build-output/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const themedir = (p: string) => resolve(__dirname, 'themes/hibikilogy', p)

export default defineConfig({
  publicDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: { customMedia: true },
    },
    devSourcemap: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021',
    sourcemap: true,
    minify: true,
    cssMinify: 'lightningcss',
    rolldownOptions: {
      input: {
        'components/index': themedir('components/index.ts'),
        'search/worker': themedir('src/features/search/runtime/worker.ts'),
        'sw': themedir('src/infrastructure/service-worker/worker.ts'),
        'ui': themedir('src/ui/ui.ts'),
        ...globEntries(themedir('styles'), '.css', (rel, name) => {
          if (rel.startsWith('lib/') || rel.startsWith('base/'))
            return null
          return name
        }),
      },
      output: {
        entryFileNames: chunk => chunk.name === 'sw' ? 'sw.js' : 'js/[name].js',
        chunkFileNames: 'js/chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names[0] ?? ''
          if (/\.css$/.test(name)) {
            if (name.includes('virtual_uno') || name.startsWith('ui'))
              return 'styles/uno[extname]'
            return 'styles/[name][extname]'
          }
          if (/\.(?:woff2?|ttf|otf|eot)$/.test(name))
            return 'fonts/[name][extname]'
          if (/\.(?:png|jpe?g|webp|avif|svg|gif)$/.test(name))
            return 'imgs/[name][extname]'
          return 'js/assets/[name][extname]'
        },
        strictExecutionOrder: true,
      },
    },
  },
  plugins: [
    syncBuildOutputPlugin({
      destination: themedir('static'),
    }),
    UnoCSS({ mode: 'shadow-dom', inspector: false }),
    UnoCSS({ mode: 'global', configFile: resolve(__dirname, 'unocss.config.ts') }),
    hibikilogyConfigPlugin(__dirname),
  ],
})
