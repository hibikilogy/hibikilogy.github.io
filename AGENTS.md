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
- `src/` — TypeScript source for search, UI components, and utilities (compiled to `static/js/` by Vite)
- `components/` — Lit Web Components (lazy-image, site-pagination, tags-list)
- `i18n/zh.toml` — theme default translations. Site can override via `[translations]` in `config.toml`, or replace by adding `i18n/<lang>.toml` files. Templates use `tr::t(key="...")` macro which loads from theme i18n first, falls back to Zola's built-in `trans()`.
- `theme.toml` — theme metadata and default `[extra]` values

`public/` is the generated site output. Prefer editing source files, then regenerate output, rather than hand-editing `public/`.

## Build, Test, and Development Commands

- `zola serve`: run the local development server at `http://127.0.0.1:1111/`. The `-f` (fast) flag enables incremental rebuilds. Zola watches `themes/` directory for live reload since v0.9.0.
- `zola build`: build the site into `public/` (uses default `config.toml`).
- `zola build --drafts`: match the GitHub Pages workflow build behavior.
- `npx pagefind --source public`: rebuild the search index after `zola build`.
- `zola check`: validate pages, links, templates, and configuration without producing a deployment artifact.
- `pnpm build:all`: full build pipeline (Vite → UnoCSS → font subset → Zola → image rewrite → short links).
- `pnpm dev:all`: start all dev servers in parallel (Zola + Vite watch + UnoCSS watch).

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

PRs should describe the change, note affected content/templates/assets, link related issues, and include screenshots for visible layout changes. Mention whether `zola check`, `zola build`, and Pagefind were run.

## Security & Configuration Tips

Do not commit local secrets or analytics changes without review. Confirm `base_url`, feeds, taxonomies, and deployment branch expectations before changing `config.toml` or `.github/workflows/pages.yml`.
