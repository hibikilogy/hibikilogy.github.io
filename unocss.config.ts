import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind4,
} from 'unocss'
import { presetHibikilogyComponents } from './components/preset'

export default defineConfig({
  outputToCssLayers: {
    cssLayerName(layer) {
      // presetWind4 internal layers → base
      if (layer === 'properties' || layer === 'theme' || layer === 'base') {
        return 'base'
      }

      return 'utilities'
    },
  },
  theme: {
    font: {
      family: 'var(--joh-font-family-base)',
    },
    breakpoint: {
      md: '720px',
    },
  },
  presets: [
    presetWind4({
      container: false,
      preflights: {
        reset: false,
      },
    }),
    presetAttributify(),
    presetIcons({
      mode: 'mask',
      scale: 1,
      warn: true,
      collections: {
        custom: resolveCustomIcons(),
      },
    }),
    presetHibikilogyComponents(),
  ],
  blocklist: [
    'container',
    'view-transition-name',
  ],
})

interface IconData {
  [key: string]: string
}

export function resolveCustomIcons(): IconData {
  const svgDir = path.resolve(
    fileURLToPath(new URL('./static/svg/', import.meta.url)),
  )
  const data: IconData = {}

  // Ensure the directory exists before reading
  if (!fs.existsSync(svgDir)) {
    throw new Error(`Directory not found: ${svgDir}`)
  }

  const svgFiles = fs
    .readdirSync(svgDir)
    .filter(file => file.endsWith('.svg'))

  svgFiles.forEach((file) => {
    const fileNameWithoutExt = path.basename(file, '.svg')
    const filePath = path.join(svgDir, file)

    data[fileNameWithoutExt] = fs.readFileSync(filePath, 'utf8')
  })

  return data
}
