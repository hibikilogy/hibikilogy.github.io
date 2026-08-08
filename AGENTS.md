# Repository Guidelines

## Project Structure & Module Organization

This repository is a Zola static site using the built-in `hibikilogy` theme. The theme lives in `themes/hibikilogy/` and contains templates, Sass, static assets, TypeScript source (`src/`), and Web Components (`components/`).

### Site-level (overrides theme defaults)
- `zola.toml` — site configuration (base_url, title, taxonomies, extra settings)
- `content/` — Markdown pages and posts
- `static/` — site-specific static files (logos, favicons, images, opensearch.xml, site.manifest, build caches). Files here override theme `static/` by path.

### Theme (`themes/hibikilogy/`)
- `templates/` — Tera 2 templates: reusable `{% component %}` definitions under `components/` (globally registered; Zola 0.23 removed macros and shortcodes), grouped as page components at the top level, markdown-body components under `content/`, and helpers under `util/`; taxonomy views under `tags/` and `author/`
- `styles/` — SCSS stylesheets organized as `base/`, `components/`, `layouts/`
- `static/` — theme static assets (JS bundle, CSS, SVG icons, fonts, KaTeX files)
- `src/` — TypeScript source organized as `app/` (lifecycle, composition), `features/` (search), `ui/` (DOM adapters), `infrastructure/` (Swup integration, network), `shared/` (utilities, runtime config); compiled to `static/js/` by Vite. TS layering/review rules: `themes/hibikilogy/src/README.md`
- `components/` — Lit Web Components (lazy-image, site-pagination, tags-list)
- `i18n/zh.toml` — theme default translations. Templates look up `{{<i18n.t key="..." lang={lang} />}}` (defined in `templates/components/i18n.html`) in order: `zola.toml [languages.<lang>].translations` → `[translations]` (default language only) → this file; a missing key fails the build via Tera 2's `throw()`. Default-language site translations come from either `[translations]` or `[languages.<default>.translations]`, never both (same rule as Zola's `LanguageOptions::merge()`). Components only see their own parameters; callers pass `config`/`lang` explicitly.
- `theme.toml` — theme metadata and default `[extra]` values

`public/` is the generated site output. Prefer editing source files, then regenerate output, rather than hand-editing `public/`.

### Build tooling (`scripts/`)

`scripts/` holds the build-time tooling: a Rust crate (`hibikilogy-tools`, see `Cargo.toml`) plus TypeScript scripts. The Rust code runs only during builds — never in the site runtime. `scripts/README.md` is the authoritative developer guide for it.

- `scripts/lib.rs` + `scripts/shared/` — shared library modules (front matter, content files, URL encoding, managed file/JSON writes)
- `scripts/bin/<tool>/` — five CLI binaries (`main.rs` + `app.rs` + domain modules):
  - `title-font-subset` / `body-font-subset` (feature `font-tools`) — subset fonts to glyphs actually used in content
  - `site-artifact-rewrite` (feature `artifact-rewrite`) — post-process `public/` per `scripts/artifact-rewrite.toml` (URL cache busting, image attrs, thumbhash)
  - `article-short-links` — assign `/s/YYNNN/` short links and sync Zola `aliases` (ledger: `scripts/data/short-link-reservations.json`)
  - `deploy-markdown` — export articles/docs to `.md` routes with relative links
- `scripts/integration/` — Rust smoke tests (run via nextest)
- Heavy dependencies are optional, gated behind the `font-tools` and `artifact-rewrite` cargo features (default = none)

`plans/` holds numbered implementation plans; read `plans/README.md` for their execution order. `dist/` is gitignored Vite output. Tests live with the code they cover: Vitest suites at `themes/hibikilogy/src/**/*.test.ts` and `scripts/**/*.test.ts` (run via `pnpm test:ts`), Rust unit tests as inline `#[cfg(test)]` modules plus `scripts/integration/cli_smoke.rs` (run via nextest).

### Sveltia CMS (`static/admin/` + `cms/`)

The site includes a Sveltia CMS setup at `/admin/` for visual content editing. The CMS runtime is bundled as an npm dependency, and the preview UI is authored in TypeScript + JSX under `cms/`, built by Vite into `static/admin/admin.js`.

#### Runtime
- `static/admin/index.html` — CMS entry point. Loads the bundled `admin.js` module.
- `static/admin/config.yml` — CMS configuration. Defines `posts` (articles), `docs` (documentation pages), and `tags` (tag library) collections. Includes singletons for `zola.toml` site settings and `themes/hibikilogy/i18n/zh.toml` translations. Uses GitHub backend for OAuth-authenticated content editing.

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
- `zola build`: build the site into `public/` (uses default `zola.toml`).
- `zola build --drafts`: match the GitHub Pages workflow build behavior.
- Search index (`search_index.zh.json`) is generated automatically by Zola during `zola build` via `build_search_index = true` and `index_format = "fuse_json"` in `zola.toml`. The client-side search engine (Fuse.js + Web Worker + IndexedDB cache) lives at `themes/hibikilogy/src/features/search/`.
- `zola check --skip-external-links`: validate pages, internal links, templates, and configuration without producing a deployment artifact. The `--skip-external-links` flag skips external link verification for significantly faster checks; use plain `zola check` only when you've added or changed external links.
- `pnpm build:all`: full production pipeline — Vite bundle → CMS admin bundle → title/body font subsetting → short-link check → Zola build → beasties inlining → artifact rewrite → markdown export (exact chain in `package.json`).
- `pnpm dev:all`: start dev servers in parallel (Zola + Vite watch).
- `pnpm build:admin`: build the Sveltia CMS admin bundle to `static/admin/admin.js`.
- `pnpm dev:admin`: start the CMS admin dev server with HMR.
- `pnpm dev:cms`: watch `static/` and sync changes to `public/` for CMS config development.
- `pnpm lint:zh`: run zhlint over `content/**/*.md` for Chinese typography.
- `pnpm verify:ts`: full TypeScript gate — typecheck + Vitest + scoped lint + theme/CMS builds.

Rust build tools (the `hibikilogy-tools` crate, invoked via pnpm):
- `pnpm build:subset-titlefont` / `pnpm build:subset-bodyfont` — subset fonts to glyphs used in content
- `pnpm build:rewrite-artifacts` — post-process `public/` per `scripts/artifact-rewrite.toml`
- `pnpm sync:short-links` / `pnpm check:short-links` — assign or verify `/s/YYNNN/` short links against `scripts/data/short-link-reservations.json`
- `pnpm build:markdown` — export `.md` routes from content
- `pnpm test:rust` — cargo nextest + doc tests (all features)
- `pnpm verify:rust` — fmt check + clippy `-D warnings` + `pnpm test:rust`
- `pnpm coverage:rust` — llvm-cov HTML report

Requires Zola 0.23.2 (as pinned in `.github/actions/setup-tools`), Node.js 24+ (see `.nvmrc`; Node 24 runs TypeScript entry scripts directly via type stripping), and Rust 1.97.1 (pinned by `rust-toolchain.toml`) with `cargo-nextest` 0.9.140 and `cargo-llvm-cov` 0.8.7 installed.

## i18n / Translations

Translations live in `themes/hibikilogy/i18n/zh.toml`. Templates access them via the `i18n.t` component (defined in `themes/hibikilogy/templates/components/i18n.html`), with the lookup chain:

1. `zola.toml [languages.<lang>].translations` — per-language site overrides
2. `zola.toml [translations]` — only when `lang == default_language` (top-level `[translations]` belongs to the default language; it is not a fallback for other languages)
3. `themes/hibikilogy/i18n/<lang>.toml` — theme baseline

When the key is missing everywhere, the component fails the build via Tera 2's `throw(message=...)` — there is no silent fallback. The component's `lang` parameter is required.

The default language's site translations must be defined in exactly one place: top-level `[translations]` or `[languages.<default>.translations]`. Zola's `LanguageOptions::merge()` rejects both being set, and the Vite plugin enforces the same rule at build time.

The Vite plugin at `scripts/vite/hibikilogy-config/index.ts` bakes client-side JS search messages from the same sources: the default language's site translations (one of the two forms above) override `themes/<theme>/i18n/<default_language>.toml`, flattened to camelCase keys (`search_index_loading` → `searchIndexLoading`) into `virtual:hibikilogy-config`. Only the `default_language` is baked; per-page-language client translations are out of scope. `scripts/check-i18n-keys.test.ts` verifies that template `key` literals, JS `HIBIKILOGY_TRANSLATIONS.*` references, and the CMS i18n fields in `static/admin/config.yml` (names and defaults) stay in sync with `zh.toml`.

To add a new language, create `i18n/<lang>.toml` in the theme.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, final newline for code/config files, and trimmed trailing whitespace. Markdown files may omit the final newline and may keep intentional trailing whitespace. Use TOML for site configuration in `zola.toml`, Tera syntax in `templates/`, and Sass/SCSS in `styles/`. Name posts with a date prefix when adding articles, for example `content/2024-07-01-title.md`; keep asset folders grouped by post or date under `static/imgs/`.

Paragraph first-line indentation is handled by the theme via CSS (`text-indent: 2em` on `article[data-text-indent] > p`, enabled by default): do **not** write `&emsp;&emsp;` or `&emsp;` in Markdown for indentation. To keep an article unindented (e.g. legacy posts), set `extra.text_indent = false` in its front matter.

Rust code follows `rustfmt.toml` (max_width 100). Always use `cargo --locked`, report errors via `anyhow` + `.context()`, use clap with readable `--help`, and keep output reproducible (details in `scripts/README.md`).

## Testing Guidelines

TypeScript has a Vitest suite (`pnpm test:ts`, happy-dom environment) covering shared utilities, search runtime, and build-script logic; run `pnpm typecheck && pnpm test:ts && pnpm lint:ts` before opening a PR. Rust changes require `pnpm verify:rust` (fmt + clippy + nextest); CI (`check.yml`) runs the same checks when Rust files change, and lint-staged runs `cargo fmt --` on `*.rs` pre-commit. Static-site validation is the required path for template, Sass, or navigation changes: run `zola check --skip-external-links`, then `zola build`, and inspect the local site with `zola serve` before opening a PR.

## Commit & Pull Request Guidelines

Follow [Angular's commit convention](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular): `<type>(<scope>): <subject>`. Allowed scopes are: `theme/themes`, `script/scripts`, `content`, `docs`, `build`, `template/templates`, `search`, `ui`, `component/components`, `i18n`, `static`, `cms`, `article/articles`. Examples: `feat(theme): add dark mode support`, `fix(scripts): correct build cache path`, `docs(content): add article guide`. Keep the subject imperative, lowercase, and under 50 characters when practical. See `.github/commit-convention.md` for the full format.

PRs should describe the change, note affected content/templates/assets, link related issues, and include screenshots for visible layout changes. Mention whether `zola check --skip-external-links` and `zola build` were run.

## Security & Configuration Tips

Do not commit local secrets or analytics changes without review. Confirm `base_url`, feeds, taxonomies, and deployment branch expectations before changing `zola.toml` or `.github/workflows/pages.yml`.

The site is deployed to Vercel (`https://hibikilogy.vercel.app/`). `vercel.json` includes a Content Security Policy scoped to `/admin/*` for Sveltia CMS OAuth and CDN resources. The GitHub OAuth backend uses the proxy at `https://gh-oauth.interknot.site/`. For local CMS development, the `base_url` in the backend config may need to be removed or pointed to localhost.
