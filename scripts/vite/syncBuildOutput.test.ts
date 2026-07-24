import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  syncBuildOutput,
} from './syncBuildOutput.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('syncBuildOutput', () => {
  it('replaces generated files and preserves unrelated static assets', async () => {
    const root = await createTemporaryDirectory()
    const outputDirectory = join(root, 'dist')
    const destination = join(root, 'static')

    await write(outputDirectory, 'js/ui.js', 'new entry')
    await write(outputDirectory, 'js/chunks/current.js', 'new chunk')
    await write(outputDirectory, 'styles/critical.css', 'new styles')
    await write(destination, 'js/chunks/stale.js', 'stale chunk')
    await write(destination, 'styles/components/stale.css', 'stale styles')
    await write(destination, 'styles/source-han-serif.css', 'keep')

    await syncBuildOutput({
      destination,
      outputDirectory,
      files: [
        { fileName: 'js/chunks/current.js', isEntry: false },
        { fileName: 'styles/critical.css', isEntry: false },
        { fileName: 'js/ui.js', isEntry: true },
      ],
      previousFiles: [
        'js/chunks/stale.js',
        'styles/components/stale.css',
      ],
    })

    await expect(read(destination, 'js/ui.js')).resolves.toBe('new entry')
    await expect(read(destination, 'js/chunks/current.js')).resolves.toBe('new chunk')
    await expect(read(destination, 'styles/critical.css')).resolves.toBe('new styles')
    await expect(read(destination, 'styles/source-han-serif.css')).resolves.toBe('keep')
    await expect(read(destination, 'js/chunks/stale.js')).rejects.toThrow()
    await expect(read(destination, 'styles/components/stale.css')).rejects.toThrow()
  })

  it('removes the previous hash after copying the replacement chunk', async () => {
    const root = await createTemporaryDirectory()
    const outputDirectory = join(root, 'dist')
    const destination = join(root, 'static')
    const currentChunk = 'js/chunks/search-page-NewHash1.js'
    const previousChunk = 'js/chunks/search-page-OldHash1.js'

    await write(outputDirectory, 'js/ui.js', 'next entry')
    await write(outputDirectory, currentChunk, 'new chunk')
    await write(destination, 'js/ui.js', 'old entry')
    await write(destination, previousChunk, 'old chunk')

    await syncBuildOutput({
      destination,
      outputDirectory,
      files: [
        { fileName: currentChunk, isEntry: false },
        { fileName: 'js/ui.js', isEntry: true },
      ],
      previousFiles: ['js/ui.js', previousChunk],
    })

    await expect(read(destination, 'js/ui.js')).resolves.toBe('next entry')
    await expect(read(destination, currentChunk)).resolves.toBe('new chunk')
    await expect(read(destination, previousChunk)).rejects.toThrow()
  })

  it('does not rewrite an unchanged hashed chunk', async () => {
    const root = await createTemporaryDirectory()
    const outputDirectory = join(root, 'dist')
    const destination = join(root, 'static')
    const fileName = 'js/chunks/search-page-AbCd1234.js'
    const oldTime = new Date('2020-01-01T00:00:00Z')

    await write(outputDirectory, fileName, 'same chunk')
    await write(destination, fileName, 'same chunk')
    await utimes(join(destination, fileName), oldTime, oldTime)

    await syncBuildOutput({
      destination,
      outputDirectory,
      files: [{ fileName, isEntry: false }],
      previousFiles: [fileName],
    })

    expect((await stat(join(destination, fileName))).mtimeMs).toBe(oldTime.getTime())
  })

  it('rewrites a hashed chunk when its contents differ', async () => {
    const root = await createTemporaryDirectory()
    const outputDirectory = join(root, 'dist')
    const destination = join(root, 'static')
    const fileName = 'js/chunks/search-page-AbCd1234.js'

    await write(outputDirectory, fileName, 'new chunk')
    await write(destination, fileName, 'old chunk')

    await syncBuildOutput({
      destination,
      outputDirectory,
      files: [{ fileName, isEntry: false }],
      previousFiles: [fileName],
    })

    await expect(read(destination, fileName)).resolves.toBe('new chunk')
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'hibikilogy-vite-sync-'))
  temporaryDirectories.push(directory)
  return directory
}

async function write(root: string, fileName: string, content: string): Promise<void> {
  const file = join(root, fileName)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

function read(root: string, fileName: string): Promise<string> {
  return readFile(join(root, fileName), 'utf8')
}
