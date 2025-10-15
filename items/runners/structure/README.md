# README.md

# ClearRound Travel — DOCS/BLOG lane (Go-Live Overview)

## Purpose
Run a simple, reliable publication lane that **reads from Items** and **publishes to Docs** for the public blog at **https://blog.clearroundtravel.com**. Keep lanes separate and predictable:
- **Items** = data + runner logic (triggers, content, events, images, templates-as-source if needed)
- **Docs**  = published, static site outputs (HTML pages, publish JSON, feeds, sitemap, manifest)

## Domains & hosting
- **Public site:** `https://blog.clearroundtravel.com` (GitHub Pages, branch: `main`, folder: `/docs`, HTTPS enforced)
- **Data proxy:** `https://items.clearroundtravel.com` (Heroku proxy that exposes `/items/*` reads and `/docs/*` commits)

## Endpoints in scope (DOCS/BLOG ONLY)
- **Read (public):** `https://blog.clearroundtravel.com/...` (final site)
- **Read (proxy):** `GET https://items.clearroundtravel.com/items/{path}` (triggers, content, events, images)
- **Read (proxy):** `GET https://items.clearroundtravel.com/docs/{path}` (already-published docs)
- **Write (proxy):** `POST https://items.clearroundtravel.com/docs/commit-bulk` (single Git commit for multiple docs)

> **Do not** write to `/items/*` from the runner. Airtable uses `/items/commit` for data maintenance only.

## Runner model: “Runner-Light”
- **Input:** One trigger URL in `items/triggers/...` providing `content_link`, `event_link`, optional `images_link`, `year`, `post_folder_slug`, `commit_message`.
- **Work:** Fetch content/event/images from **Items**; render a **full blog post page** + a **publish JSON**.
- **Output (exactly 2 files per publish):**
  1) `docs/blogs/<brand>-blogs-<year>/<post-folder>/<slug>-publish.json`
  2) `docs/blogs/<brand>-blogs-<year>/<post-folder>/index.html`

> Global artifacts (blogs index, year index, RSS, sitemap, manifest) will be handled by a separate scheduled indexer after go-live. Keep the runner’s scope small to de-risk launch.

## Templates
- **Location (read-only):** `docs/blogs/templates/`
  - `blog.index.html.tmpl` (post page template)
  - Others may exist but are **not** required for runner-light.
- Access as raw text (OK if browsers download them; they are not user-facing navigation).

## Guardrails (write)
- **Deny:** any `*-blog*.json` under any path (source-of-truth; never mutate).
- **Allow:** only `docs/blogs/**/index.html` and `docs/blogs/**/**-publish(.json|-YYYY-MM-DD.json)`.
- **Manifest/feeds/sitemap**: handled later by indexer; not written by the runner-light path.

## Canonical & feeds
- **Canonical base:** `https://blog.clearroundtravel.com`
- Ensure the post page and JSON point to **blog.** URLs, not `docs.` or raw GitHub.

## Known pitfalls (watch-outs)
- **XML prolog must be first byte**: no comments/whitespace/BOM before `<?xml ...?>` for RSS/Sitemap.
- **CNAME/HTTPS:** GitHub Pages supports **one** custom domain; keep only `blog.clearroundtravel.com`.
- **Templates:** If linked directly, browsers may download `.tmpl`; this is fine—don’t link them from pages.
- **Paths:** Keep `/docs/...` structure stable; public URLs resolve under `https://blog.clearroundtravel.com/...` (no leading `/docs` in public links).
- **Airtable:** Use `/items/commit` for **Items** data only; runner writes go exclusively to `/docs/commit-bulk`.

## Smoke test (post-publish)
- `https://blog.clearroundtravel.com/blogs/` loads.
- Post folder exists: `.../blogs/<brand>-blogs-<year>/<post-folder>/`
- Post JSON: `.../<slug>-publish.json` is valid JSON and matches the content.
- Canonical/meta tags reflect `blog.` domain.

