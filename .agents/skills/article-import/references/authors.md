# Author profile reference

Author profiles are optional. Importing an article requires an author taxonomy value, not a profile file. Read the current theme template and CMS configuration before changing this contract.

## Repository behavior

The theme looks for:

```text
content/authors/{exact-author-name}.yml
```

The directory may not exist until the first profile is created. Without a profile, the author taxonomy page still renders a simple author listing. With a profile, the theme can render a richer hero and use available metadata in page meta and structured data.

The filename and `title` must exactly match the value used in `[taxonomies].author`, including case and punctuation.

## Format

Use YAML:

```yaml
title: 呓儒之殇
bio: 京吹学报特约评论员
avatar: /imgs/authors/example.png
link: https://example.com/profile
```

Only `title` is required. Keep `bio` concise. Store local avatars under `static/imgs/authors/` and reference them as `/imgs/authors/...`. Do not invent a biography, avatar, or personal link.

## Creation workflow

1. Check whether `content/authors/{name}.yml` exists.
2. Skip profile creation by default for one-off authors.
3. Ask once when the author is recurring or the user requests richer attribution.
4. Create only the fields the user or source can substantiate.
5. Verify the taxonomy name, YAML parse, avatar path, author page, and metadata output.

For multiple authors, treat each profile independently. Do not block the article import because one or more profiles are absent.

## CMS

The current `authors` collection uses YAML files under `content/authors/` and media under `static/imgs/authors/`. Re-read `static/admin/config.yml` before constructing a CMS handoff URL. Prefill supported article-author fields when possible, then end the workflow after opening CMS. Do not open a separate author-profile editor, interact with CMS, or save anything after handoff.
