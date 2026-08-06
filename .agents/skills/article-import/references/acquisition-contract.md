# Acquisition handoff contract

Use this contract between `article-import` and a separately installed acquisition skill. The acquisition skill owns URL access, browser or HTTP tooling, authentication-aware interaction, pagination, platform DOM handling, and extraction. It returns source data only and must not modify the hibikilogy repository.

## Source scope

This contract has no website allowlist, domain table, URL-pattern registry, or platform-specific schema. Any source URL is eligible when a selected acquisition skill can access it and return the complete contract. The acquisition skill owns the compatibility decision and reports unsupported or incomplete sources through `warnings` or a clear failure.

`article-import` must not reject a source because its site is absent from this reference. It derives repository tags later by inspecting the repository, not from acquisition rules.

## Request supplied to the acquisition skill

Provide:

- `source_url`: the exact URL supplied by the user;
- `requested_scope`: the user-approved post, author, page, or article scope;
- `contract`: `article-import/acquisition-v1`;
- `output`: the fields and Markdown syntax defined below.

The republishing-authorization gate belongs to `article-import`; do not delegate that decision to the acquisition skill.

## Required response fields

Return a structured result containing:

- `contract`: exactly `article-import/acquisition-v1`;
- `source_url`: the original user-supplied URL;
- `canonical_url`: the final canonical article or thread URL;
- `equivalent_urls`: known redirect-chain or platform URLs that identify the same source, including `source_url` and `canonical_url` when they differ;
- `source_id`: a stable site-specific article, thread, post, or document identifier when available;
- `site_name`: the source website's displayed or commonly recognized name when available;
- `site_host`: the normalized hostname from `canonical_url`;
- `source_kind`: a truthful description such as article, thread, post, or document;
- `included_scope`: the posts, pages, or article content actually included;
- `title`;
- `author`: display name, or `null` when unavailable;
- `published_at`: source timestamp with timezone or offset when available; otherwise the exact displayed date text;
- `body_markdown`: the extracted article body following the Markdown contract;
- `images`: an ordered array of content images;
- `permission_notice`: the exact meaning of any visible reposting or licensing notice, paraphrased when necessary, or `null`;
- `warnings`: incomplete content, uncertain metadata, inaccessible elements, omitted embeds, or other extraction limitations.

Each `images` entry contains:

- `source_url`: original full-size asset URL;
- `alt`: source alt text or a truthful empty string;
- `caption`: source caption or `null`;
- `position`: body order starting at `1`;
- `role`: `content` or `cover-candidate`.

Optional `evidence` and per-field `confidence` values may be returned when the acquisition skill supports them. Never invent a missing title, author, timestamp, source URL, reply, image, or permission notice.

## Markdown contract

Return only the article body in `body_markdown`; do not include YAML/TOML frontmatter or an extra copy of the title.

- Start body headings at `##`; never emit `#` for the article title.
- Use blank-line-separated paragraphs, `>` blockquotes, standard ordered or unordered lists, fenced code blocks, GFM tables, and `[^id]` footnotes where appropriate.
- Use `[label](url)` for links and `![alt](source_url)` for content images. Every image URL in the body must match one `images[].source_url` entry and preserve body order.
- Keep a meaningful image caption as the following plain paragraph or return it in `images[].caption`; do not encode captions as platform HTML.
- Preserve semantic emphasis with `**bold**`, `*italic*`, and `~~strikethrough~~` only when present in the source.
- Preserve meaningful section order, quotations, captions, tables, footnotes, and intentional line breaks.
- Exclude navigation, advertisements, counters, avatars, badges, controls, signatures, unrelated replies, duplicated quotations, tracking parameters, placeholders, and empty wrappers.
- Do not emit scripts, event handlers, arbitrary styles, unsafe HTML, unsupported iframes, repository component calls, local repository paths, or localized image paths.
- Escape any literal `{{` / `{%` sequences from the source in `{% raw %}` / `{% endraw %}` blocks, since Zola 0.23 templates article Markdown with Tera.
- Represent an unsupported embed as a normal source link and describe the omission in `warnings`.

## Acceptance boundary

The acquisition skill must not:

- decide whether the user has republishing permission;
- choose or create repository tags;
- generate Zola frontmatter, slug, aliases, abstract, author profiles, or destination paths;
- download images into the repository or rewrite them to local paths;
- write, commit, push, save to CMS, or publish any content.

`article-import` validates the response, resolves missing required metadata with the user, performs repository normalization and localization, presents the review package, and owns all writes.
