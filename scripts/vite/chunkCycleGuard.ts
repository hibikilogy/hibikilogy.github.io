import type { Plugin } from 'vite'

export function chunkCycleGuardPlugin(): Plugin {
  return {
    name: 'hibikilogy:chunk-cycle-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      const imports = new Map(
        Object.values(bundle)
          .filter(output => output.type === 'chunk')
          .map(chunk => [
            chunk.fileName,
            chunk.imports.filter(fileName => bundle[fileName]?.type === 'chunk'),
          ]),
      )
      const cycle = findChunkCycle(imports)
      if (cycle)
        this.error(`Static chunk import cycle: ${cycle.join(' -> ')}`)
    },
  }
}

export function findChunkCycle(
  imports: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visited = new Set<string>()
  const active = new Set<string>()
  const path: string[] = []

  function visit(fileName: string): string[] | null {
    if (active.has(fileName))
      return [...path.slice(path.indexOf(fileName)), fileName]
    if (visited.has(fileName))
      return null

    visited.add(fileName)
    active.add(fileName)
    path.push(fileName)
    for (const dependency of imports.get(fileName) ?? []) {
      const cycle = visit(dependency)
      if (cycle)
        return cycle
    }
    path.pop()
    active.delete(fileName)
    return null
  }

  for (const fileName of imports.keys()) {
    const cycle = visit(fileName)
    if (cycle)
      return cycle
  }
  return null
}
