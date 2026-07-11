# Repository Guidelines

## Project Structure & Module Organization

This repository is a Zola static site using the built-in `hibikilogy` theme. The theme lives in `themes/hibikilogy/` and contains templates, Sass, static assets, TypeScript source (`src/`), and Web Components (`components/`).

### Site-level (overrides theme defaults)
- `config.toml` — site configuration (base_url, title, taxonomies, extra settings)
- `content/` — Markdown pages and posts
- `static/` — site-specific static files (logos, favicons, images, opensearch.xml, site.manifest, build caches). Files here override theme `static/` by path.

### Theme (`themes/hibikilogy/`)
- `templates/` — Tera templates with reusable partials under `components/`, taxonomy views under `tags/` and `author/`, macros under `macros/`, and shortcodes under `shortcodes/`
- `sass/` — SCSS stylesheets organized as `base/`, `components/`, `layouts/`
- `static/` — theme static assets (JS bundle, CSS, SVG icons, fonts, KaTeX files)
- `src/` — TypeScript source for search engine, UI components, and utilities (compiled to `static/js/` by Vite)
- `components/` — Lit Web Components (lazy-image, site-pagination, tags-list)
- `i18n/zh.toml` — theme default translations. Site can override via `[translations]` in `config.toml`, or replace by adding `i18n/<lang>.toml` files. Templates use `tr::t(key="...")` macro which loads from theme i18n first, falls back to Zola's built-in `trans()`.
- `theme.toml` — theme metadata and default `[extra]` values

`public/` is the generated site output. Prefer editing source files, then regenerate output, rather than hand-editing `public/`.

### Sveltia CMS (`static/admin/`)

The site includes a Sveltia CMS (v0.170.0) setup at `/admin/` for visual content editing:

- `static/admin/index.html` — CMS entry point. Loads Sveltia CMS from CDN, registers site CSS for preview styling, and defines custom preview templates (JSX via Babel standalone) that replicate the Zola page structure. Also registers custom editor components for Bilibili embeds, collapsible blocks, and accordions.
- `static/admin/config.yml` — CMS configuration. Defines `posts` (articles), `docs` (documentation pages), and `tags` (tag library) collections. Includes singletons for `config.toml` site settings and `themes/hibikilogy/i18n/zh.toml` translations. Uses GitHub backend for OAuth-authenticated content editing.
- `static/admin/fonts.css` — Full Source Han Serif CN VF @font-face for the preview pane title font.


**Preview templates** (in `index.html`) replicate the actual Zola template DOM structure (`hero.html` + `page.html` for posts, `docs.html` for pages) so that the site's real CSS applies correctly in the preview pane.

**Custom editor components** extend the Markdown editor with toolbar buttons for inserting Zola shortcodes (`{{ bilibili() }}`, `{% collapsible() %}`, `{% accordion() %}`).

## Build, Test, and Development Commands

- `zola serve`: run the local development server at `http://127.0.0.1:1111/`. The `-f` (fast) flag enables incremental rebuilds. Zola watches `themes/` directory for live reload since v0.9.0.
- `zola build`: build the site into `public/` (uses default `config.toml`).
- `zola build --drafts`: match the GitHub Pages workflow build behavior.
- Search index (`search_index.zh.json`) is generated automatically by Zola during `zola build` via `build_search_index = true` and `index_format = "fuse_json"` in `config.toml`. The client-side search engine (Fuse.js + Web Worker + IndexedDB cache) lives at `themes/hibikilogy/src/search/`.
- `zola check`: validate pages, links, templates, and configuration without producing a deployment artifact.
- `pnpm build:all`: full build pipeline (Vite → UnoCSS → font subset → Zola → image rewrite → short links).
- `pnpm dev:all`: start all dev servers in parallel (Zola + Vite watch + UnoCSS watch).
- `pnpm dev:cms`: watch `static/` and sync changes to `public/` for CMS development.

Requires Zola 0.19+ and Node.js 18+.

## i18n / Translations

Translations live in `themes/hibikilogy/i18n/zh.toml`. Templates access them via the `tr::t(key, default)` macro (defined in `themes/hibikilogy/templates/macros/i18n.html`). The macro loads theme i18n via `load_data()`, then falls back to Zola's `trans()` (which reads site `config.toml` `[translations]`), then to the inline `default` parameter.

To override a translation, add a `[translations]` section in site `config.toml` with the specific key. To add a new language, create `i18n/<lang>.toml` in the theme.

The Vite plugin at `scripts/vite/hibikilogy-config.ts` also reads i18n for client-side JS search messages. It loads from `config.toml` `[translations]` first, then falls back to `themes/<theme>/i18n/<lang>.toml`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, final newline for code/config files, and trimmed trailing whitespace. Markdown files may omit the final newline and may keep intentional trailing whitespace. Use TOML for site configuration in `config.toml`, Tera syntax in `templates/`, and Sass/SCSS in `sass/`. Name posts with a date prefix when adding articles, for example `content/2024-07-01-title.md`; keep asset folders grouped by post or date under `static/imgs/`.

## Testing Guidelines

There is no separate unit test suite. Treat static-site validation as the required test path: run `zola check`, then `zola build`, For template, Sass, or navigation changes, inspect the local site with `zola serve` before opening a PR.

## Commit & Pull Request Guidelines

Follow [Angular's commit convention](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular): `<type>(<scope>): <subject>`. Allowed scopes are limited to: `theme`, `scripts`, `content`, `docs`, `build`. Examples: `feat(theme): add dark mode support`, `fix(scripts): correct build cache path`, `docs(content): add article guide`. Keep the subject imperative, lowercase, and under 50 characters when practical. See `.github/commit-convention.md` for the full format.

PRs should describe the change, note affected content/templates/assets, link related issues, and include screenshots for visible layout changes. Mention whether `zola check` and `zola build` were run.

## Security & Configuration Tips

Do not commit local secrets or analytics changes without review. Confirm `base_url`, feeds, taxonomies, and deployment branch expectations before changing `config.toml` or `.github/workflows/pages.yml`.

The site is deployed to Vercel (`https://hibikilogy.vercel.app/`). `vercel.json` includes a Content Security Policy scoped to `/admin/*` for Sveltia CMS OAuth and CDN resources. The GitHub OAuth backend uses the proxy at `https://gh-oauth.interknot.site/`. For local CMS development, the `base_url` in the backend config may need to be removed or pointed to localhost.
