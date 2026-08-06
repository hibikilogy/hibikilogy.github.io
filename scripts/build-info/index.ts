import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import process from 'node:process'

// Generates `build-info.json` at the site root before every Zola build.
// The dev-preview banner in `base.html` reads it via `load_data()` —
// Zola 0.23 removed the `get_env` function, so Git metadata can no
// longer be injected through environment variables.
function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return ''
  }
}

const commit = git(['rev-parse', '--short=7', 'HEAD'])
const message = git(['log', '-1', '--format=%s', 'HEAD'])
// Local branches resolve directly; CI checkouts are detached, so fall
// back to the workflow-provided ref name.
const branch = git(['branch', '--show-current']) || process.env.GITHUB_REF_NAME || ''

writeFileSync(
  'build-info.json',
  JSON.stringify({ commit, branch, message, build_time: new Date().toISOString() }, null, 2) + '\n',
)
