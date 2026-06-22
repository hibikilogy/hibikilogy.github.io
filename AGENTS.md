# Repository Guidelines

## Project Structure & Module Organization

This repository is a Zola static site. Source content lives in `content/` as Markdown pages and posts. Tera templates live in `templates/`, with reusable partials under `templates/components/` and taxonomy views under `templates/tags/` and `templates/author/`. Sass source is in `sass/`; static files that should be copied as-is are in `static/`. `public/` is the generated site output. Prefer editing source files, then regenerate output, rather than hand-editing `public/`.

## Build, Test, and Development Commands

- `zola serve -c config.dev.toml`: run the local development server at `http://127.0.0.1:1111/`. Uses `config.dev.toml` which disables `minify_html` and `build_search_index` for faster rebuilds. **Do NOT use plain `zola serve`** — it rebuilds the full-text search index on every change (~15s overhead).
- `zola build`: build the site into `public/` (uses default `config.toml`).
- `zola build --drafts`: match the GitHub Pages workflow build behavior.
- `npx pagefind --source public`: rebuild the search index after `zola build`.
- `zola check`: validate pages, links, templates, and configuration without producing a deployment artifact.

Requires Zola 0.18+ and Node.js 18+.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, final newline for code/config files, and trimmed trailing whitespace. Markdown files may omit the final newline and may keep intentional trailing whitespace. Use TOML for site configuration in `config.toml`, Tera syntax in `templates/`, and Sass/SCSS in `sass/`. Name posts with a date prefix when adding articles, for example `content/2024-07-01-title.md`; keep asset folders grouped by post or date under `static/imgs/`.

## Testing Guidelines

There is no separate unit test suite. Treat static-site validation as the required test path: run `zola check`, then `zola build`, and run Pagefind when search output changes. For template, Sass, or navigation changes, inspect the local site with `zola serve` before opening a PR.

## Commit & Pull Request Guidelines

The repository includes `.github/commit-convention.md`, based on Conventional Commits. Prefer headers like `docs(content): add article guide`, `fix(template): correct pagination`, or `build(search): update pagefind output`. Keep the subject imperative, lowercase, and under 50 characters when practical. Recent history contains generic `update` commits, but new work should use the documented convention.

PRs should describe the change, note affected content/templates/assets, link related issues, and include screenshots for visible layout changes. Mention whether `zola check`, `zola build`, and Pagefind were run.

## Security & Configuration Tips

Do not commit local secrets or analytics changes without review. Confirm `base_url`, feeds, taxonomies, and deployment branch expectations before changing `config.toml` or `.github/workflows/pages.yml`.

### Dual Config Maintenance

The project uses two configuration files:

| File | Purpose | `minify_html` | `build_search_index` |
|------|---------|---------------|---------------------|
| `config.toml` | Production build (also CI) | `true` | `true` |
| `config.dev.toml` | Local `zola serve` | `false` | `false` |

`config.dev.toml` is a **full copy** of `config.toml` — Zola does not support config inheritance. When changing `config.toml`, copy the same changes to `config.dev.toml` except for the two performance toggles above. Production search is provided by Pagefind (run separately in CI), so disabling Zola's built-in search index in dev does NOT affect the live site.
