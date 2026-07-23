import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { hibikilogyConfigPlugin } from './scripts/vite/hibikilogy-config.ts'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    hibikilogyConfigPlugin(dirname(fileURLToPath(import.meta.url))),
  ],
  test: {
    environment: 'happy-dom',
    include: [
      'themes/hibikilogy/src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    restoreMocks: true,
  },
})
