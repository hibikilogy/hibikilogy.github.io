import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const projectRoot = __dirname
const staticRoot = resolve(projectRoot, 'static')
const themeStaticRoot = resolve(projectRoot, 'themes/hibikilogy/static')
const adminEntry = resolve(projectRoot, 'cms/bootstrap.ts')
const unoConfig = resolve(projectRoot, 'unocss.config.ts')
const adminAssetsDir = 'admin/assets'

export default defineConfig(({ command }) => ({
  root: staticRoot,
  base: command === 'build' ? './' : '/',
  publicDir: command === 'serve' ? themeStaticRoot : false,
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: { customMedia: true },
    },
  },
  plugins: [
    UnoCSS({ configFile: unoConfig }),
    ...(command === 'serve'
      ? [adminEntryPlugin()]
      : []),
  ],
  server: {
    open: '/admin/',
  },
  build: {
    outDir: resolve(staticRoot, adminAssetsDir),
    emptyOutDir: true,
    target: 'es2021',
    sourcemap: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rolldownOptions: {
      input: adminEntry,
      output: {
        entryFileNames: 'admin.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: asset => asset.names.includes('style.css')
          ? 'admin.css'
          : '[name]-[hash][extname]',
      },
    },
  },
}))

function adminEntryPlugin(): Plugin {
  return {
    name: 'hibikilogy-cms-dev-entry',
    enforce: 'pre',
    resolveId(source) {
      if (source === `/${adminAssetsDir}/admin.js`) {
        return adminEntry
      }

      return null
    },
  }
}
