import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config'
import { presetHibikilogyComponents } from './themes/hibikilogy/components/preset'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'themes/hibikilogy/static/js',
    emptyOutDir: false,
    target: 'es2021',
    sourcemap: true,
    minify: true,
    rolldownOptions: {
      input: {
        'components/index': resolve(__dirname, 'themes/hibikilogy/components/index.ts'),
        'components/lazy-image': resolve(__dirname, 'themes/hibikilogy/components/lazy-image/index.ts'),
        'components/site-pagination': resolve(__dirname, 'themes/hibikilogy/components/site-pagination/index.ts'),
        'components/tags-list': resolve(__dirname, 'themes/hibikilogy/components/tags-list/index.ts'),
        'accordion': resolve(__dirname, 'themes/hibikilogy/src/ui/accordion.ts'),
        'outline': resolve(__dirname, 'themes/hibikilogy/src/ui/outline.ts'),
        'search/worker': resolve(__dirname, 'themes/hibikilogy/src/search/worker.ts'),
        'slide-visible-once-bottom': resolve(__dirname, 'themes/hibikilogy/src/ui/slide-visible-once-bottom.ts'),
        'text-swap': resolve(__dirname, 'themes/hibikilogy/src/ui/text-swap.ts'),
        'ui': resolve(__dirname, 'themes/hibikilogy/src/ui/ui.ts'),
        'utils': resolve(__dirname, 'themes/hibikilogy/src/ui/utils.ts'),
        'water-fall': resolve(__dirname, 'themes/hibikilogy/src/ui/water-fall.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names[0] ?? ''

          if (/\.css$/.test(name)) {
            return '../styles/[name][extname]'
          }

          if (/\.(?:woff2?|ttf|otf|eot)$/.test(name)) {
            return '../fonts/[name][extname]'
          }

          if (/\.(?:png|jpe?g|webp|avif|svg|gif)$/.test(name)) {
            return '../imgs/[name][extname]'
          }

          return 'assets/[name][extname]'
        },
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
