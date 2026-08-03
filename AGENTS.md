# Repository Guidelines

## Project Structure & Module Organization

This repository is a Zola static site using the built-in `hibikilogy` theme. The theme lives in `themes/hibikilogy/` and contains templates, Sass, static assets, TypeScript source (`src/`), and Web Components (`components/`).

### Site-level (overrides theme defaults)
- `config.toml` — site configuration (base_url, title, taxonomies, extra settings)
- `content/` — Markdown pages and posts
- `static/` — site-specific static files (logos, favicons, images, opensearch.xml, site.manifest, build caches). Files here override theme `static/` by path.

### Theme (`themes/hibikilogy/`)
- `templates/` — Tera templates with reusable partials under `components/`, taxonomy views under `tags/` and `author/`, macros under `macros/`, and shortcodes under `shortcodes/`
- `styles/` — SCSS stylesheets organized as `base/`, `components/`, `layouts/`
- `static/` — theme static assets (JS bundle, CSS, SVG icons, fonts, KaTeX files)
- `src/` — TypeScript source organized as `app/` (lifecycle, composition), `features/` (search), `ui/` (DOM adapters), `shared/` (utilities, runtime config); compiled to `static/js/` by Vite
- `components/` — Lit Web Components (lazy-image, site-pagination, tags-list)
- `i18n/zh.toml` — theme default translations. Site can override via `[translations]` in `config.toml`, or replace by adding `i18n/<lang>.toml` files. Templates use `tr::t(key="...")` macro which loads from theme i18n first, falls back to Zola's built-in `trans()`.
- `theme.toml` — theme metadata and default `[extra]` values

`public/` is the generated site output. Prefer editing source files, then regenerate output, rather than hand-editing `public/`.

### Sveltia CMS (`static/admin/` + `cms/`)

The site includes a Sveltia CMS setup at `/admin/` for visual content editing. The CMS runtime is bundled as an npm dependency, and the preview UI is authored in TypeScript + JSX under `cms/`, built by Vite into `static/admin/admin.js`.

#### Runtime
- `static/admin/index.html` — CMS entry point. Loads the bundled `admin.js` module.
- `static/admin/config.yml` — CMS configuration. Defines `posts` (articles), `docs` (documentation pages), and `tags` (tag library) collections. Includes singletons for `config.toml` site settings and `themes/hibikilogy/i18n/zh.toml` translations. Uses GitHub backend for OAuth-authenticated content editing.

#### CMS source (`cms/`)
- `cms/bootstrap.ts` — entry point. Initialises the CMS, registers preview templates and styles.
- `cms/runtime.ts` — bridges Sveltia CMS's React-compatible JSX runtime (`window.h`) to the module system.
- `cms/components.tsx` — presentational components (`PreviewPage`, `PostHero`, `AuthorHero`, `SimpleHero`) that replicate the actual Zola template DOM structure so the site's real CSS applies correctly in the preview pane.
- `cms/previews/*.tsx` — preview template adapters (`PostPreview`, `DocsPreview`, `AuthorsPreview`). Each maps CMS entry data to the corresponding presentational component.
- `cms/adapters.ts` — CMS type adapters (`getField`, `toArray`, `resolveAsset`) for working with Immutable.js entry data.
- `cms/shared.ts` — shared constants (`PREVIEW_FONT_STYLES`, `DEFAULT_COVER`) and formatting helpers.
- `cms/preview.scss` — imports theme SCSS partials (`critical.scss`, `page.scss`, `author-profile.scss`) into the preview pane stylesheet.

#### Build
- `vite.admin.config.ts` — dedicated Vite config for the CMS admin bundle. Outputs to `static/admin/admin.js` (ES module) and `static/admin/admin.css` with source maps. Dev mode resolves `/admin/admin.js` to `cms/bootstrap.ts` with HMR.
- `pnpm build:admin` — production build of the admin bundle.
- `pnpm dev:admin` — dev server with HMR for CMS development.

## Build, Test, and Development Commands

- `zola serve`: run the local development server at `http://127.0.0.1:1111/`. The `-f` (fast) flag enables incremental rebuilds. Zola watches `themes/` directory for live reload since v0.9.0.
- `zola build`: build the site into `public/` (uses default `config.toml`).
- `zola build --drafts`: match the GitHub Pages workflow build behavior.
- Search index (`search_index.zh.json`) is generated automatically by Zola during `zola build` via `build_search_index = true` and `index_format = "fuse_json"` in `config.toml`. The client-side search engine (Fuse.js + Web Worker + IndexedDB cache) lives at `themes/hibikilogy/src/features/search/`.
- `zola check --skip-external-links`: validate pages, internal links, templates, and configuration without producing a deployment artifact. The `--skip-external-links` flag skips external link verification for significantly faster checks; use plain `zola check` only when you've added or changed external links.
- `pnpm build:all`: full build pipeline (Vite → UnoCSS → font subset → Zola → image rewrite → short links).
- `pnpm dev:all`: start all dev servers in parallel (Zola + Vite watch + UnoCSS watch).
- `pnpm build:admin`: build the Sveltia CMS admin bundle to `static/admin/admin.js`.
- `pnpm dev:admin`: start the CMS admin dev server with HMR.
- `pnpm dev:cms`: watch `static/` and sync changes to `public/` for CMS config development.

Requires Zola 0.19+ and Node.js 24+ (see `.nvmrc`; Node 24 runs TypeScript entry scripts directly via type stripping).

## i18n / Translations

Translations live in `themes/hibikilogy/i18n/zh.toml`. Templates access them via the `tr::t(key, default)` macro (defined in `themes/hibikilogy/templates/macros/i18n.html`). The macro loads theme i18n via `load_data()`, then falls back to Zola's `trans()` (which reads site `config.toml` `[translations]`), then to the inline `default` parameter.

To override a translation, add a `[translations]` section in site `config.toml` with the specific key. To add a new language, create `i18n/<lang>.toml` in the theme.

The Vite plugin at `scripts/vite/hibikilogy-config/index.ts` also reads i18n for client-side JS search messages. It loads from `config.toml` `[translations]` first, then falls back to `themes/<theme>/i18n/<lang>.toml`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, final newline for code/config files, and trimmed trailing whitespace. Markdown files may omit the final newline and may keep intentional trailing whitespace. Use TOML for site configuration in `config.toml`, Tera syntax in `templates/`, and Sass/SCSS in `styles/`. Name posts with a date prefix when adding articles, for example `content/2024-07-01-title.md`; keep asset folders grouped by post or date under `static/imgs/`.

## Testing Guidelines

TypeScript has a Vitest suite (`pnpm test:ts`, happy-dom environment) covering shared utilities, search runtime, and build-script logic; run `pnpm typecheck && pnpm test:ts && pnpm lint:ts` before opening a PR. Static-site validation is the required path for template, Sass, or navigation changes: run `zola check --skip-external-links`, then `zola build`, and inspect the local site with `zola serve` before opening a PR.

## Commit & Pull Request Guidelines

Follow [Angular's commit convention](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular): `<type>(<scope>): <subject>`. Allowed scopes are: `theme/themes`, `script/scripts`, `content`, `docs`, `build`, `template/templates`, `search`, `ui`, `component/components`, `i18n`, `static`, `cms`, `article/articles`. Examples: `feat(theme): add dark mode support`, `fix(scripts): correct build cache path`, `docs(content): add article guide`. Keep the subject imperative, lowercase, and under 50 characters when practical. See `.github/commit-convention.md` for the full format.

PRs should describe the change, note affected content/templates/assets, link related issues, and include screenshots for visible layout changes. Mention whether `zola check --skip-external-links` and `zola build` were run.

## Security & Configuration Tips

Do not commit local secrets or analytics changes without review. Confirm `base_url`, feeds, taxonomies, and deployment branch expectations before changing `config.toml` or `.github/workflows/pages.yml`.

The site is deployed to Vercel (`https://hibikilogy.vercel.app/`). `vercel.json` includes a Content Security Policy scoped to `/admin/*` for Sveltia CMS OAuth and CDN resources. The GitHub OAuth backend uses the proxy at `https://gh-oauth.interknot.site/`. For local CMS development, the `base_url` in the backend config may need to be removed or pointed to localhost.
