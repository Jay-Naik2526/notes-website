# TEE Hall

A study-notes site: hall ticket → desk of folders → reader. Everything is pre-rendered, so the browser only shows images (no PDF engine, no lag).

> The converted notes (`static/lib`, ~400 MB) are **not** in this repository: they are generated on your own machine
> by `npm run library` from your notes folder, and uploaded straight to the host. Only the site's code lives here.

## Everyday commands

```bash
npm run library   # convert ~/Downloads/09 TEE/Ultimate Notes into static/lib (re-run after adding notes)
npm run dev       # develop locally
npm run build     # static site into ./build
```

Subjects and their folder colours live in `scripts/subjects.json`. Set the exam date in `src/lib/config.ts`.
PPT/PPTX/DOC/DOCX files need LibreOffice installed (`brew install --cask libreoffice`).

## Deploy to GitHub Pages

GitHub Pages serves the pre-rendered notes using standard HTTP Range requests (`206 Partial Content`), completely free with no bandwidth limits.

```bash
# 1. Rebuild library and production bundle
npm run library
npm run build

# 2. Deploy to GitHub Pages (.deploy repo)
python3 scripts/push-batches.py
```

The `push-batches.py` script automatically stages app files and page packs, pushes them in small ~15–20 MB batches to avoid GitHub's HTTP timeouts on slow connections, and verifies the deploy.

## Deploy free on Cloudflare Pages (alternative)

```bash
npm run library && npm run build
npx wrangler login
npx wrangler pages deploy build --project-name tee-hall
```

Optional passcode (friends enter it once, remembered 30 days):

```bash
npx wrangler pages secret put PASSCODE --project-name tee-hall
```

The gate keeps strangers and search engines out. It is not a vault: page images are excluded from the gate
(`static/_routes.json`) so they don't use the free Functions quota.

## How the renderer works

1. `scripts/build-library.mjs` rasterises every page (poppler) into WebP at two sizes, packs each document into a few large files, and writes a manifest with byte offsets plus a blur preview per page.
2. `src/lib/platen/pack.ts` fetches single pages with HTTP Range requests, decodes them before showing, and keeps a small LRU cache.
3. `src/lib/platen/Viewer.svelte` keeps only the pages near the screen in the DOM, so a 300-page document costs the same as a 3-page one. The sharper size loads only when zoomed or on a high-density screen.
