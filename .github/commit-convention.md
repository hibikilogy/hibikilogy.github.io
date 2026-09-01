# Git Commit Message Convention

> 基于 [Angular 的提交约定](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular) 精简。

## 格式

```
<type>(<scope>): <subject>

<body>
```

header 必填，scope 可选。`commit-msg` 钩子（`scripts/verify-commit/index.ts`）按下面这个正则校验：subject 取**首行**，长度 ≤ 50。

```js
/^(?:revert: )?(?:feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|post)(?:\((?:theme|themes|script|scripts|content|docs|build|template|templates|search|ui|component|components|i18n|static|cms|article|articles)\))?: .{1,50}$/
```

## Type

- `feat` — 新功能
- `fix` — 缺陷修复
- `refactor` — 重构（不改变行为）
- `docs` — 文档
- `build` / `ci` — 构建与 CI
- `style`、`test`、`chore` — 格式、测试、杂务
- `dx`、`perf`、`workflow`、`types`、`wip`、`post` 按需使用

## Scope

允许的 scope：`theme`、`script`、`content`、`docs`、`build`、`template`、`search`、`ui`、`component`、`i18n`、`static`、`cms`、`article`，每个也接受复数形式（`themes`、`scripts`、`templates`、`components`、`articles`）。

## Subject

- 祈使句、动词原形（"change" 而非 "changed"）
- 首字母小写，句尾不加句号
- 尽量 ≤ 50 字符

## Body / Footer

- 说明动机，并与改动前行为做对比
- 破坏性变更以 `BREAKING CHANGE:` 开头
- 关联 issue 用 `close #<n>` 收尾

## Revert

`revert: <被回退提交的 header>`，正文注明 `This reverts commit <hash>.`。

## 示例

```
feat(theme): add dark mode support
fix(scripts): correct build cache path
docs(content): add article guide

close #12
```
