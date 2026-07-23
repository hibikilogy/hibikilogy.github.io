import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import pc from 'picocolors'

const msgPath = path.resolve('.git/COMMIT_EDITMSG')
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
