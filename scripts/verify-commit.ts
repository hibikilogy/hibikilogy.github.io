import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import pc from 'picocolors'

// Git passes the message file path as $1, but simple-git-hooks does not
// forward arguments, so fall back to asking git (works in linked worktrees
// where `.git` is a gitdir file, unlike a hardcoded `.git/COMMIT_EDITMSG`).
const msgPath = process.argv[2]
  || execSync('git rev-parse --git-path COMMIT_EDITMSG', { encoding: 'utf-8' }).trim()
const msg = readFileSync(msgPath, 'utf-8').trim()

const commitRE
  = /^(?:revert: )?(?:feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip)(?:\(.+\))?: .{1,50}/

if (!commitRE.test(msg)) {
  console.log()
  console.error(
    `  ${pc.white(pc.bgRed(' ERROR '))} ${pc.red(
      'invalid commit message format.',
    )}\n\n${
      pc.red(
        '  Proper commit message format is required. Examples:\n\n',
      )
    }    ${pc.green('feat(theme): add dark mode support')}\n`
    + `    ${pc.green(
      'fix(scripts): correct build cache path',
    )}\n\n${
      pc.red('  See .github/commit-convention.md for more details.\n')}`,
  )
  process.exit(1)
}
