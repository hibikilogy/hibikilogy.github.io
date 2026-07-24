import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { chunkCycleGuardPlugin } from './scripts/vite/chunkCycleGuard'
import { globEntries } from './scripts/vite/entries'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config'
import { syncBuildOutputPlugin } from './scripts/vite/syncBuildOutput'

const __dirname = dirname(fileURLToPath(import.meta.url))
const themedir = (p: string) => resolve(__dirname, 'themes/hibikilogy', p)

function normalizeModuleId(id: string): string {
  return id.replaceAll('\\', '/')
}

function isSearchEngineModule(id: string): boolean {
  const moduleId = normalizeModuleId(id)
  return moduleId.includes('/node_modules/.pnpm/fuse.js@')
    || /\/features\/search\/(?:core\/(?:body-match|engine|results)|runtime\/(?:cache|engineBuilder|mainThreadClient))\.ts$/.test(moduleId)
}

function isSearchPageModule(id: string): boolean {
  const moduleId = normalizeModuleId(id)
  return /\/features\/search\/(?:page\/|hooks\/useSearch\.ts$)/.test(moduleId)
    || moduleId.endsWith('/ui/text-swap.ts')
}

function isSearchCoreModule(id: string): boolean {
  return /\/features\/search\/core\/(?:query|tags)\.ts$/.test(normalizeModuleId(id))
}

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
        'search/worker': themedir('src/search/worker.ts'),
        'ui': themedir('src/ui/ui.ts'),
        ...globEntries(themedir('styles'), '.css', (rel, name) => {
          if (rel.startsWith('lib/') || rel.startsWith('base/'))
            return null
          return name
        }),
      },
      output: {
        entryFileNames: 'js/[name].js',
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
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'search-engine', test: isSearchEngineModule },
            { name: 'search-page', test: isSearchPageModule },
            { name: 'search-core', test: isSearchCoreModule },
          ],
        },
        strictExecutionOrder: true,
      },
    },
  },
  plugins: [
    chunkCycleGuardPlugin(),
    syncBuildOutputPlugin({
      destination: themedir('static'),
    }),
    UnoCSS({ mode: 'shadow-dom', inspector: false }),
    UnoCSS({ mode: 'global', configFile: resolve(__dirname, 'unocss.config.ts') }),
    hibikilogyConfigPlugin(__dirname),
  ],
})
