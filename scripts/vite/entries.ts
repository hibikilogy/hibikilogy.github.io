import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function globEntries(
  base: string,
  ext: string,
  keyFn: (relativePath: string, name: string) => string | null,
): Record<string, string> {
  const entries: Record<string, string> = {}

  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(resolve(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
      }
      else if (entry.name.endsWith(ext)) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        const name = rel.slice(0, -ext.length)
        const key = keyFn(rel, name)
        if (key !== null)
          entries[key] = resolve(dir, entry.name)
      }
    }
  }

  walk(base, '')
  return entries
}
