import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import pc from 'picocolors'

// Prefer the message path git passes as $1 (forwarded by the hook); fall
// back to asking git, which resolves correctly in linked worktrees where
// `.git` is a gitdir file, not a directory.
const msgPath = process.argv[2]
  || execSync('git rev-parse --git-path COMMIT_EDITMSG', { encoding: 'utf-8' }).trim()
const msg = readFileSync(msgPath, 'utf-8').trim()

// 50 字符上限只约束 subject（首行），先切出首行再锚定。
const subjectLine = msg.split('\n', 1)[0] ?? ''
const commitRE
  = /^(?:revert: )?(?:feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|post)(?:\((?:theme|themes|script|scripts|content|docs|build|template|templates|search|ui|component|components|i18n|static|cms|article|articles)\))?: .{1,50}$/

if (!commitRE.test(subjectLine)) {
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
