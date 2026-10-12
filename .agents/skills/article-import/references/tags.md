# Tag System Reference

## Tag Location

Tags are YAML files in `content/tags/`. Inspect that directory at execution time; do not rely on a cached count or catalog.

## Tag Format

```yaml
category: 人物
title: 黄前久美子
```

Categories:
- `人物` — character tags
- `版块` — platform or section tags, such as `NGA`, `贴吧`, `虎扑`, and `bilibili`
- `杂类` — miscellaneous tags, such as `Stage1`, `利兹与青鸟`, and `合奏比赛`

## Source-site tags

These existing source-site tags are examples, not an allowlist:
- `content/tags/贴吧.yml` (category: `版块`)
- `content/tags/虎扑.yml` (category: `版块`)
- `content/tags/bilibili.yml` (category: `版块`)
- `content/tags/NGA.yml` (category: `版块`)
- `content/tags/Stage1.yml` (category: `杂类`)

## Tag Recommendation Strategy

### 1. Character Tags (人物)

Scan the article body for character names. The existing character tags include but are not limited to:

**Main characters**: 黄前久美子, 高坂丽奈, 田中明日香, 中世古香织, 伞木希美, 铠冢霙, 吉川优子, 中川夏纪, 久石奏, 剑崎梨梨花, 加藤叶月, 川岛绿辉, 冢本秀一, 斋藤葵, 黑江真由, 北山泰瑠, 义井沙里, 小笠原晴香, 佐佐木梓, 加部友惠, 井上调, 井上顺菜, 釜屋燕, 上石弥生, 叶加濑美智留, 加藤树, 北田亩, 内田婴, 井村卓, 中野蕾实

**How to match**: Read the article body, identify frequently mentioned character names, check against `ls content/tags/`. For names that appear 3+ times and have an existing tag, recommend them.

### 2. Series/Media Tags

- `京吹群像志` — series analysis articles
- `利兹与青鸟` — Liz and the Blue Bird movie
- `合奏比赛` — Ensemble Contest
- `bangumi` — anime episode discussion

### 3. Timeline Tags

Format: `黄前{数字}年`. Examples from existing tags: 黄前十五年, 黄前十六年, 黄前十七年, 黄前十八年.

These are in-universe timeline markers for the Hibike! Euphonium series. Match year references in the article body.

### 4. Source-site and section tags

Match `site_name` and `site_host` from the acquisition contract against current tag titles and meanings. Include exactly one existing tag when it accurately identifies the source website. If none exists, ask whether to create a source-site tag or proceed without one. Additional section tags may describe a board or subsection, but must not replace the source-site decision silently.

## Creating New Tags

When a character or concept mentioned prominently in the article has no existing tag:

```yaml
category: 人物
title: 角色名
```

Use `人物` for characters, `杂类` for concepts/series/events, `版块` for forum sections.

**Before creating**: confirm with the user. Present the proposed tag and ask if they want to create it.

## Tag Selection Rules

1. Include exactly one accurate source-site tag when one exists; otherwise ask before creating one or omitting it.
2. Recommend character tags for characters mentioned 3+ times.
3. Prefer existing tags over creating new ones.
4. 5-8 tags total is typical for articles in this repo.
5. Tags display as clickable links on the article page and are used for search/discovery.
