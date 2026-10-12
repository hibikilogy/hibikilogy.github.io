# CMS reference

Use this reference only for Sveltia CMS handoff work. Treat `static/admin/config.yml` as the current source of truth and re-read it before acting.

## Current repository contract

- CMS entry: `/admin/`
- Production site: `https://hibikilogy.vercel.app/`
- Backend repository: `hibikilogy/hibikilogy.github.io`
- Backend branch: `Refactor/zola`
- Article collection: `posts`
- Article folder: `content/articles`
- Article format: TOML frontmatter
- Article path: `YYYY-MM-DD-slug.md`
- Article media: `static/imgs/YYYY-MM-DD-slug/`
- Public media path: `/imgs/YYYY-MM-DD-slug/`

The configuration can change. Verify these values in `static/admin/config.yml` before constructing the handoff URL.

GitHub is the configured CMS backend, not a separate browser submission route. Do not construct GitHub `/new` or `/edit` web-editor URLs for article submission.

## Article fields

The `posts` collection currently supports:

- `title`, `description`, `slug`, `date`, `updated`, `draft`, `weight`, and `aliases`;
- `taxonomies.tags` and `taxonomies.author`;
- `extra.abstract`, `extra.cover`, `extra.cover_alt`, `extra.toc`, `extra.katex`, and `extra.original`;
- `body`.

Current templates use `extra.toc` and default it to enabled when omitted. Existing articles may still contain legacy `extra.catalog`; do not copy that legacy field into new imports.

The CMS also supplies hidden Zola fields. Do not add them by hand to a local import merely to imitate CMS output.

## CMS handoff workflow

1. Build the configured CMS editor URL and verify any supported prefill parameters against the current runtime.
2. Open the URL with the user's system default browser, not an in-app browser. On Windows, launch the URL as one argument with `Start-Process`; use the platform-equivalent default-browser launcher elsewhere. If system launching is unavailable, provide a clickable URL and disclose that it was not opened automatically.
3. If the body was omitted because of URL length, provide the complete body in a clearly labeled copyable block or point to the exact local draft.
4. Report that the CMS handoff is complete and stop.

After opening the URL, do not authenticate, inspect or edit fields, paste content, upload images, save, publish, inspect repository changes, check deployment, or run local verification. The user and CMS own every subsequent step.

## URL-prefill length handling

URL limits vary by browser, operating system, server, and CMS version. Do not assume a universal maximum or claim that an editor URL has unlimited practical length.

When the remote editor supports query-string prefill:

1. URL-encode all values before constructing the URL.
2. Include the complete body only when the final URL fits the verified working limit.
3. If the complete encoded body exceeds that limit, remove the body parameter entirely. Never silently truncate the article.
4. Keep supported metadata parameters in the URL and open that shorter URL with the user's default browser.
5. Tell the user explicitly that the body could not be passed through the URL and must be copied into the CMS **正文/body** field.
6. Present the complete reviewed body in a clearly labeled copyable Markdown block or point to the exact local draft file containing it.
7. End the workflow after providing the complete body; do not verify the user's later CMS actions.

Never embed credentials or cookies in a URL. Query-string prefill behavior belongs to the installed CMS version and may change, so verify it before relying on it.
