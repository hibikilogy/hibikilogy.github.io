import type { Plugin } from 'vite'
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path'

interface SyncBuildOutputOptions {
  destination: string
}

interface BuildFile {
  fileName: string
  isEntry: boolean
}

const manifestFileName = '.vite-sync-manifest.json'

export function syncBuildOutputPlugin(options: SyncBuildOutputOptions): Plugin {
  let outputDirectory = ''
  let previousFiles: string[] = []

  return {
    name: 'hibikilogy:sync-build-output',
    apply: 'build',
    enforce: 'post',
    async configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
      previousFiles = await readManifest(outputDirectory) ?? []
    },
    async writeBundle(_outputOptions, bundle) {
      const files = Object.entries(bundle)
        .map(([fileName, output]): BuildFile => ({
          fileName,
          isEntry: 'isEntry' in output && output.isEntry,
        }))
        .sort((first, second) => Number(first.isEntry) - Number(second.isEntry))

      await syncBuildOutput({
        destination: options.destination,
        outputDirectory,
        files,
        previousFiles,
      })

      previousFiles = files.map(file => file.fileName)
      await writeFile(
        resolve(outputDirectory, manifestFileName),
        `${JSON.stringify(previousFiles, null, 2)}\n`,
      )
    },
  }
}

export async function syncBuildOutput({
  destination,
  outputDirectory,
  files,
  previousFiles,
}: {
  destination: string
  outputDirectory: string
  files: BuildFile[]
  previousFiles: string[]
}): Promise<void> {
  const currentFiles = new Set(files.map(file => file.fileName))

  for (const { fileName } of files) {
    const source = resolveInside(outputDirectory, fileName)
    const target = resolveInside(destination, fileName)
    if (isHashedChunk(fileName) && await haveEqualContents(source, target))
      continue

    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  for (const fileName of previousFiles) {
    if (!currentFiles.has(fileName))
      await rm(resolveInside(destination, fileName), { force: true })
  }
}

async function haveEqualContents(first: string, second: string): Promise<boolean> {
  try {
    const [firstStats, secondStats] = await Promise.all([
      stat(first),
      stat(second),
    ])
    if (firstStats.size !== secondStats.size)
      return false

    const [firstContent, secondContent] = await Promise.all([
      readFile(first),
      readFile(second),
    ])
    return firstContent.equals(secondContent)
  }
  catch {
    return false
  }
}

async function readManifest(outputDirectory: string): Promise<string[] | null> {
  try {
    const value: unknown = JSON.parse(
      await readFile(resolve(outputDirectory, manifestFileName), 'utf8'),
    )
    return Array.isArray(value) && value.every(item => typeof item === 'string')
      ? value
      : null
  }
  catch {
    return null
  }
}

function resolveInside(root: string, fileName: string): string {
  const target = resolve(root, fileName)
  const relativePath = relative(resolve(root), target)
  if (
    !relativePath
    || relativePath.startsWith('..')
    || isAbsolute(relativePath)
  ) {
    throw new Error(`Build output must stay inside its root: ${fileName}`)
  }
  return target
}

function isHashedChunk(fileName: string): boolean {
  return /^js\/chunks\/.+-[\w-]{8}\.js(?:\.map)?$/.test(fileName)
}
