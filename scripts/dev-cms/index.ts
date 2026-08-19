import { cpSync, existsSync, mkdirSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'

// Keep `public/` in sync with `static/` while editing CMS config, so the dev
// preview at /admin/ always serves the latest files without a Zola rebuild.
watch('static', { recursive: true }, (_, file) => {
  if (!file)
    return

  const source = join('static', file)
  const target = join('public', file)

  try {
    if (!existsSync(source))
      return
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }
  catch {
    // The source can vanish mid-event on rename/delete races; skip it.
  }
})
