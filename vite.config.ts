import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { globEntries } from './scripts/vite/entries'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const themedir = (p: string) => resolve(__dirname, 'themes/hibikilogy', p)

export default defineConfig({
  publicDir: false,
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: { customMedia: true },
    },
    devSourcemap: true,
  },
  build: {
    outDir: 'themes/hibikilogy/static',
    emptyOutDir: false,
    target: 'es2021',
    sourcemap: true,
    minify: true,
    cssMinify: 'lightningcss',
    rolldownOptions: {
      input: {
        ...globEntries(themedir('components'), '.ts', (_rel, name) =>
          name === 'index'
            ? 'components/index'
            : name.endsWith('/index')
              ? `components/${name.replace(/\/index$/, '')}`
              : null),
        ...globEntries(themedir('src/ui'), '.ts', (_rel, name) =>
          name.includes('/') || name.endsWith('.d') ? null : name),
        ...globEntries(themedir('src/search'), '.ts', (_rel, name) =>
          name.includes('/') || name.endsWith('.d') ? null : `search/${name}`),
        ...globEntries(themedir('styles'), '.css', (rel, name) => {
          if (rel.startsWith('lib/') || rel.startsWith('base/'))
            return null
          return name
        }),
      },
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/chunks/[name].js',
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
      },
    },
  },
  plugins: [
    UnoCSS({ mode: 'shadow-dom', inspector: false }),
    UnoCSS({ mode: 'global', configFile: resolve(__dirname, 'unocss.config.ts') }),
    hibikilogyConfigPlugin(__dirname),
  ],
})
