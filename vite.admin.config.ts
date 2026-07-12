import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const projectRoot = __dirname
const staticRoot = resolve(projectRoot, 'static')
const themeStaticRoot = resolve(projectRoot, 'themes/hibikilogy/static')
const adminEntry = resolve(projectRoot, 'cms/bootstrap.ts')
const unoConfig = resolve(projectRoot, 'unocss.config.ts')

export default defineConfig(({ command }) => ({
  root: staticRoot,
  publicDir: command === 'serve' ? themeStaticRoot : false,
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
    outDir: resolve(staticRoot, 'admin'),
    emptyOutDir: false,
    target: 'es2021',
    sourcemap: true,
    minify: true,
    lib: {
      entry: adminEntry,
      formats: ['es'],
      fileName: () => 'admin.js',
      cssFileName: 'admin',
    },
  },
}))

function adminEntryPlugin(): Plugin {
  return {
    name: 'hibikilogy-cms-dev-entry',
    enforce: 'pre',
    resolveId(source) {
      if (source === '/admin/admin.js') {
        return adminEntry
      }

      return null
    },
  }
}
