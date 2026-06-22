import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { presetHibikilogyComponents } from './components/preset'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'static/js',
    emptyOutDir: false,
    target: 'es2021',
    sourcemap: true,
    minify: true,
    rolldownOptions: {
      input: {
        'components/index': resolve(__dirname, 'components/index.ts'),
        'components/lazy-image': resolve(__dirname, 'components/lazy-image/index.ts'),
        'components/site-pagination': resolve(__dirname, 'components/site-pagination/index.ts'),
        'components/tags-list': resolve(__dirname, 'components/tags-list/index.ts'),
        'accordion': resolve(__dirname, 'lib/ui/accordion.ts'),
        'outline': resolve(__dirname, 'lib/ui/outline.ts'),
        'search/worker': resolve(__dirname, 'lib/search/worker.ts'),
        'slide-visible-once-bottom': resolve(__dirname, 'lib/ui/slide-visible-once-bottom.ts'),
        'text-swap': resolve(__dirname, 'lib/ui/text-swap.ts'),
        'ui': resolve(__dirname, 'lib/ui/ui.ts'),
        'utils': resolve(__dirname, 'lib/ui/utils.ts'),
        'water-fall': resolve(__dirname, 'lib/ui/water-fall.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [
    UnoCSS({
      mode: 'shadow-dom',
      inspector: false,
      presets: [
        presetHibikilogyComponents(),
      ],
    }),
    hibikilogyConfigPlugin(__dirname),
  ],
})
