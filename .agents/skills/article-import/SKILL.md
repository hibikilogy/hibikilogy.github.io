---
name: article-import
description: Import or migrate articles from any web source, pasted webpage content, or extracted HTML, Markdown, plain text, and local files into this hibikilogy Zola repository. Use when the user asks to import, migrate, republish, normalize, preview, or hand an article to CMS. Delegates URL retrieval and site compatibility to a separately installed acquisition skill through a site-agnostic data and Markdown contract, then handles authorization, source validation, Zola TOML frontmatter, local images, tags, optional author profiles, review, local writing and verification, or a terminal Sveltia CMS browser handoff.
---

# Article Import

Convert a source article into a reviewable, repository-native Zola article. Preserve the author's meaning and attribution; do not silently rewrite opinions or invent missing metadata.

## Route references

Read only the references needed for the request:

- Read [references/acquisition-contract.md](references/acquisition-contract.md) before handing a URL to an acquisition skill or validating its result.
- Read [references/tags.md](references/tags.md) before recommending or creating tags.
- Read [references/authors.md](references/authors.md) only when an author profile is requested or useful.
- Read [references/cms.md](references/cms.md) only for Sveltia CMS handoff work.

## Workflow

### 1. Confirm republishing authorization

Make authorization the first blocking interaction. Before accessing a source URL, inspecting installed acquisition skills, checking for duplicate articles, or parsing pasted, extracted, or local article content, require the user to attest that they have permission to republish the full text and included images at the intended destination.

Use the environment's structured single-select choice UI with exactly these outcomes:

- **未获得转载授权或不确定** — recommended safe default; stop the skill immediately.
- **已获得转载授权** — continue the import workflow.

Place **未获得转载授权或不确定** first and mark it as recommended using the current UI's required label syntax. If structured choice UI is unavailable, ask the same binary question as a concise numbered text choice. Do not imply that authorization exists or infer it from attribution, public accessibility, page metadata, or comments.

If the user's request already explicitly states that they have permission to republish the full text and images for this source and destination, treat the gate as answered and do not ask again. Otherwise, do not perform crawling, browser access, acquisition-skill discovery or selection, duplicate detection, pasted or local full-text parsing, normalization, summarization, file writes, or publication before receiving **已获得转载授权**.

If the user selects **未获得转载授权或不确定**, end the skill without offering or producing a summary, excerpt, link-only page, or other processing of the supplied content.

### 2. Confirm source and scope

After authorization is confirmed, identify the source website and exact source URL. Clarify only decisions that materially change the result:

- first post, author-only posts, or the complete thread;
- all pages or a bounded page range;
- original publication date and author identity when the page is ambiguous.

Keep the canonical source URL in `extra.original`. Never bypass login, paywalls, access controls, or anti-bot challenges.

### 3. Check for an existing import

After authorization and before URL acquisition, search `content/articles/` frontmatter for the user-supplied URL. Compare normalized URLs without fragments, known tracking parameters, or insignificant trailing slashes; preserve identity-bearing parameters such as a thread ID.

After an acquisition skill returns, repeat the check with `source_url`, `canonical_url`, `equivalent_urls`, and `source_id`. Also flag a matching title plus author and publication date as a possible duplicate, but do not treat that heuristic as conclusive.

When a match is found, show the existing file and use a structured single-select choice:

- **停止导入** — keep the existing article unchanged.
- **审查并更新现有文章** — compare the acquired source with the existing file and prepare an update review.
- **明确创建独立新稿** — continue only when the user confirms that the duplicate source is intentional, such as a split series or a different included scope.

Do not overwrite, rename, or create a second article silently. Record the duplicate-check result in the review package.

### 4. Obtain and validate source material

Accept either of these input paths:

- a source URL delegated to a separately installed acquisition skill;
- webpage content copied by the user, or previously extracted HTML, Markdown, plain text, or a local file.

For a URL, read [references/acquisition-contract.md](references/acquisition-contract.md), then inspect the current session's installed skill catalog for skills capable of returning that contract. Match only from their declared descriptions and apparent suitability for the supplied URL. Let each acquisition skill decide whether it supports the source; do not maintain a site allowlist or implement, prescribe, or reproduce crawling logic here.

Do not recommend, discover, or install new skills during the import workflow. Do not invoke skill-search, skill-installation, or plugin-install suggestions unless the user explicitly asks to find or install another capability.

When one or more installed skills may work:

1. Build one list containing every distinct, currently viable installed acquisition-skill candidate, plus user copy/paste and stop options. Classify candidates as automatic extraction, interactive browser acquisition, or user-provided content/stop. Do not hide candidates behind a top-three limit.
2. Rank the strongest match first, give every option a short capability or tradeoff description, and display the complete catalog before asking for a choice.
3. If the complete list fits the structured single-select control's current option limit, put every option in one control.
4. If it exceeds that limit, use two structured single-select controls: first choose one of the three acquisition families, then choose from every candidate in that family. Keep the complete catalog visible so the hierarchy does not hide alternatives.
5. If one family still exceeds the per-control limit, split that family into clearly labeled pages or subgroups and continue with structured single-select controls until every candidate is reachable. Never represent independent choices as multiple unrelated questions in one dialog.
6. If the current surface has no structured choice UI, fall back to a complete numbered list without omitting options.
7. If the user already named an installed skill for this import, treat that as consent and do not ask again.
8. After selection, load the acquisition skill, give it the source URL, requested scope, and complete acquisition contract, then let that skill control its own tools and platform-specific process.
9. Require the acquisition skill to return data rather than write this repository, localize images, choose tags, create frontmatter, or publish anything.
10. If the selected skill fails or returns an invalid result, report its exact boundary, rebuild the list of remaining viable installed acquisition skills plus copy/paste and stop, and ask again. Do not silently choose another method.

Do not call web extraction, browser control, Computer Use, or platform-specific scraping directly from this skill. Those are implementation choices owned by the selected acquisition skill. If no installed acquisition skill matches, ask the user to copy and paste the article, provide exported HTML/Markdown, or stop; do not recommend installing another skill.

Validate an acquisition result against the contract before continuing. Reject or request correction when required fields are missing, the requested scope is incomplete, image references cannot be reconciled with the image inventory, or the returned Markdown violates the handoff syntax. Preserve the acquisition skill's warnings and source-page permission notice for the review package.

For copied or extracted content, parse it directly before attempting another crawl. Accept reader-mode text, page selections, raw HTML, and Markdown. Extract every property supported by evidence in the supplied material:

- title;
- author;
- publication date;
- canonical source URL and source website;
- included post/page scope;
- article body;
- content-image URLs, captions, and alt text.

Track each property's extracted value, evidence, and confidence. Do not make the user re-enter a value that can be inferred reliably from the copied content. After extraction, ask one compact follow-up containing only required properties that remain missing, conflicting, or too ambiguous to infer. Explain each fallback when proposing one, such as `匿名` for a missing author or a user-supplied publication date. Infer or omit missing optional properties unless the user requested them. Do not invent a source URL, date, author, or omitted replies.

If copied content contains a complete usable article, continue without crawling the URL again. If it omits image source URLs or visually meaningful content, ask the user to paste the missing HTML, attach the images, or provide the source URL.

Require, at minimum:

- title;
- author or an explicit `匿名` fallback;
- publication date or a clearly disclosed fallback;
- article body;
- exact source URL;
- an image inventory, which may be empty when the article has no content images.

If acquisition fails, invite the user to copy and paste the article content or provide exported HTML/Markdown. Parse that input automatically into the same contract, then ask only for still-unidentified required properties.

### 5. Normalize the article

Treat the acquisition contract's `body_markdown` as the source body. For copied HTML, Markdown, or text, first produce the same contract locally. Then normalize the Markdown for this repository while preserving meaningful structure.

Remove navigation, reply controls, signatures, ads, counters, duplicated quoted blocks, tracking parameters, and empty wrappers. Preserve semantic emphasis, quotations, headings, tables, footnotes, and intentional line breaks. Start body headings at `##` because the page template renders the title.

Convert supported embeds to existing shortcodes only after checking `themes/hibikilogy/templates/shortcodes/`. Convert links to existing site articles to Zola internal links:

```markdown
[文章标题](@/articles/2020-01-07-example.md)
```

Do not retain unsafe scripts, event-handler attributes, iframes without a repository shortcode, or arbitrary copied styles.

### 6. Build repository metadata

Inspect existing files rather than relying on hard-coded counts or catalogs. Choose a lowercase, readable, unique slug under 50 characters and use the filename:

```text
content/articles/YYYY-MM-DD-slug.md
```

Use this current frontmatter shape:

```toml
+++
title = "文章标题"
date = "2020-01-07"
slug = "example-slug"
aliases = ["/2020/01/07/example-slug/"]

[taxonomies]
tags = ["贴吧", "角色名"]
author = ["作者名"]

[extra]
original = "https://example.com/source"
toc = true
cover = "/imgs/2020-01-07-example-slug/001.png"
cover_alt = "封面图描述"
abstract = "一至三句中文摘要。"
+++
```

Rules:

- Escape TOML strings correctly; never paste raw quotes into frontmatter.
- Omit `slug` only when deliberately accepting Zola's filename-derived slug.
- Preserve legacy aliases when migrating an existing page.
- Use `extra.toc`; current templates and CMS read `toc`. Do not add legacy `catalog` to new articles.
- Set `toc = false` for short or heading-free articles; otherwise use `true` or omit it to accept the theme default.
- Omit `cover` when no suitable content image exists.
- Keep the Chinese abstract faithful, concrete, and under 200 Chinese characters.
- Do not manually add CMS-managed `template`, `render`, or `in_search_index` fields unless the repository contract explicitly requires them.

Read [references/tags.md](references/tags.md), inspect `content/tags/`, and recommend a compact set of existing tags. Include exactly one source-site tag when an existing tag accurately identifies the source. If none exists, ask before creating a source-site tag or proceeding without one; do not derive repository tags from an allowlist.

### 7. Plan and stage content images

Do not leave remote content-image hotlinks in the final article.

1. Extract unique content-image URLs.
2. Exclude avatars, badges, emoji sprites without semantic value, ads, placeholders, and duplicate thumbnails.
3. Plan the final destination under `static/imgs/YYYY-MM-DD-slug/` without writing there yet.
4. When bytes are needed for validation, download once into an operating-system temporary directory outside the repository.
5. Detect the actual media type; do not trust a query-string extension blindly.
6. Use descriptive filenames when available, otherwise `001.ext`, `002.ext`, and so on.
7. Build a reviewed mapping from each source URL to `/imgs/YYYY-MM-DD-slug/...` without changing the repository body yet.
8. Choose a meaningful, sufficiently large image as the optional cover and write useful alt text.

Do not write images or rewritten Markdown into the repository before the review step. For anti-leeching, use the source URL as `Referer` only when permitted. Do not copy authenticated cookies into commands or logs. If an image cannot legally or technically be downloaded, omit it from the localization plan and disclose the omission.

### 8. Present a review package

Before writing repository content, always show a compact safety summary containing:

- destination file;
- duplicate-check result and any existing destination article;
- the user's initial authorization attestation and any permission or no-repost notice found on the source page;
- missing or uncertain required metadata;
- staged image failures, omissions, and destination conflicts.

If the user explicitly requested direct import and none of those items requires a new decision, continue after the safety summary without asking for another confirmation. Otherwise, add the full review package:

- title, date, slug, author, tags, source, TOC choice, cover, and abstract;
- included post/page range;
- image count, staged-download result, omissions, and final destination;
- cleanup decisions or uncertain metadata;
- a short body preview.

Do not use a source-page notice to re-open or override the completed authorization gate. If the page later displays a no-repost or permission warning, record it in the review package and continue based on the user's attestation without asking for authorization again.

Ask for confirmation when content scope, metadata, duplicate disposition, image omissions, or destination remain consequentially ambiguous. A local draft is reversible; a commit or push requires explicit authorization. CMS interaction after browser handoff belongs to the user.

### 9. Write locally or hand off to CMS

For a local import:

1. Recheck every approved destination and stop before overwriting an unrelated existing path.
2. Create the image destination and move or copy the already staged images into `static/imgs/`; do not download them a second time.
3. Write approved new tags to `content/tags/` and approved author metadata only when requested.
4. Apply the reviewed local-image mapping and write the article to `content/articles/` last, so it never points at images that have not been placed.
5. If any write fails, remove only paths newly created by this import and preserve every pre-existing user file.
6. Report the exact changed paths.

Do not commit or push unless asked. Follow the repository's conventional commit rules when requested.

For Sveltia CMS handoff, read [references/cms.md](references/cms.md). Open the CMS URL with the user's system default browser rather than an in-app browser. If the complete URL-encoded body fits the verified URL/prefill limit, include it intact. If it does not fit, omit the body parameter instead of truncating it, open the metadata-prefilled URL, and explicitly tell the user to copy the complete reviewed body into the editor's body field. Provide that body in a clearly labeled copyable block or local draft file.

Once the CMS URL is opened and any required copyable body is provided, report that control has been handed to CMS and end the workflow. Do not authenticate, interact with CMS fields, upload images, save, publish, inspect the resulting repository or deployment, or run local verification. Do not construct or offer a direct GitHub web-editor URL as an alternative submission path.

### 10. Verify a local import

Run this step only after files were written locally. Never run it after CMS handoff. Validate in proportion to the local change:

1. Check frontmatter parsing, local links, tag files, author names, and image paths.
2. Run `zola check` and distinguish pre-existing repository failures from import regressions.
3. Run a clean build, preferably to a fresh output directory:

```powershell
zola build --output-dir <fresh-temp-directory> --force
```

4. For visible changes, preview the article and inspect the article page, cover, tags, author, original-source link, TOC, and search result.
5. Report each verification performed, its result, and anything not verified.

Do not edit generated `public/` files. Keep temporary extraction and preview artifacts out of Git.
