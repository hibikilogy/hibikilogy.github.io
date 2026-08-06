import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import process from 'node:process'

// Writes `build-info.json` for the dev banner in base.html, which reads
// it via load_data() — get_env no longer exists in Zola 0.23.
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
// CI checkouts are detached; fall back to the workflow ref name.
const branch = git(['branch', '--show-current']) || process.env.GITHUB_REF_NAME || ''

writeFileSync(
  'build-info.json',
  JSON.stringify({ commit, branch, message, build_time: new Date().toISOString() }, null, 2) + '\n',
)
