# Deployment Guide — Land Plots Explorer

A static site. No server, no runtime, no build server — `dist/` is published as-is
to any static host.

## Prerequisites

| Requirement | Version | Needed for |
|---|---|---|
| Google Maps API Key | Maps JavaScript API enabled | viewing the map |
| Node.js | 18+ | regenerating `dist/data/` only |

Node is **not** required to deploy. The data artifacts in `dist/data/` are
committed, so a fresh clone can be published without running anything.

---

## 1. Configure the API key

Edit `dist/js/config.js`:

```js
window.APP_CONFIG = {
  googleMapsApiKey: 'YOUR_KEY_HERE',
  ...
};
```

### Restrict the key first

This file is **public** — it ships to every visitor in plain text. That is normal
and unavoidable for the Maps JavaScript API, but an unrestricted key can be lifted
from the page and billed to your project.

In Google Cloud Console → APIs & Services → Credentials → your key:

- **Application restrictions:** HTTP referrers (web sites)
- **Website restrictions:** your deployment origin, e.g. `https://your-domain.example/*`
- **API restrictions:** restrict to *Maps JavaScript API*

Do this **before** the site goes live. Referrer restriction is what makes a public
key safe; nothing else in a static site can protect it.

---

## 2. Deploy

Publish the contents of `dist/`. No build command, no server configuration.

- **GitHub Pages** — serve the repo with `/dist` as the publishing directory.
- **Netlify / Vercel / Cloudflare Pages** — publish directory `dist`, build
  command empty.
- **Any web server / IIS** — copy `dist/` into the document root. No application
  pool, hosting bundle, or runtime install is needed; these are plain files.

### Serve over HTTP, not `file://`

`index.html` loads ES modules and fetches JSON, both blocked under `file://`.
For a local preview:

```bash
cd dist && python -m http.server 8080
```

### Recommended server settings

`dist/data/plots.json` is 1.7 MB uncompressed and ~277 KB gzipped.

- **Enable gzip or brotli** — by far the largest win.
- Cache `data/*.json` aggressively; it changes only when the data is rebuilt.

---

## 3. Regenerating the data

Only needed when `Data/plots.json` changes.

```bash
npm install
npm run build:data
```

Reads `Data/plots.json` (41 MB, UTM zone 37N), projects geometry to WGS84, strips
unused columns, and writes `dist/data/`.

The build asserts its expectations and **fails loudly** rather than emitting bad
data if the source drifts — wrong spatial reference, unexpected record count,
missing tender fields, or coordinates outside the Northern Borders bounding box.
If it fails after a data refresh, verify the new counts before relaxing the
constants at the top of `tools/build-data.mjs`.

Expected output:

```
plots:        4592
drawable:     4544
centre-only:  1
unmapped:     47
never drawn:  48
districts:    67
activities:   13 main / 39 sub
```

---

## 4. Verifying a change

`tools/test-map.html` exercises map rendering against a stubbed Google Maps API,
so it needs no API key and incurs no billing:

```bash
python -m http.server 8080      # from the repo root
# open http://localhost:8080/tools/test-map.html
```

It asserts polygon lifecycle, polygon reuse across filter changes, info-window
contents for both plot types, and that hostile URLs and markup in the source data
are neutralised. All 26 checks should pass.

---

## 4b. AI assistant (the chat widget)

The bottom-left chat widget calls an LLM (OpenRouter → Cerebras `gpt-oss-120b`).
The OpenRouter key **must not** ship to the browser, so the call is proxied through
a serverless function at **`/api/chat`** (`api/chat.py`, Python + LiteLLM). This is
the one part of the site that is no longer purely static.

**Deploy on Vercel** (its Python runtime matches the function):

1. Import the repo into Vercel. `vercel.json` already sets the static output to
   `dist/` and Vercel auto-detects `api/chat.py` + `requirements.txt`.
2. In **Project → Settings → Environment Variables**, set `OPENROUTER_API_KEY`.
   This is the only place the production key should live — never in the repo.
3. Deploy. The static site serves from `dist/`; the widget POSTs to `/api/chat`
   (same origin, no CORS).

**Local development:**

```bash
cp .env.example .env        # then paste your key into .env (it is gitignored)
npm i -g vercel             # or: pnpm/yarn
vercel dev                  # serves dist/ AND runs api/chat.py, loading .env
```

Plain `python -m http.server` (from §4) still serves the map and filters, but the
chat widget will fail its `/api/chat` request because no function is running.

The key never appears in browser traffic: open DevTools → Network and confirm the
widget only calls `/api/chat`, and that no request or source file contains the key.

> **Netlify instead of Vercel?** Netlify functions are Node-first. Replace
> `api/chat.py` with a Node function that calls OpenRouter directly (it is
> OpenAI-compatible) using the same `provider: { order: ["cerebras"] }` body; the
> browser code is unchanged.

---

## 5. Go-live checklist

- [ ] API key set in `dist/js/config.js`
- [ ] Key restricted by HTTP referrer to the deployment origin
- [ ] Key restricted to the Maps JavaScript API only
- [ ] HTTPS enabled
- [ ] gzip/brotli enabled for `dist/data/*.json`
- [ ] Open the site: dashboard cards show 2584 / 1964 / 44
- [ ] Click a card — polygons filter in place, card gets a coloured ring
- [ ] Click a polygon — info window shows plot details
- [ ] Click a قيد الطرح polygon — info window also shows تفاصيل الفرصة
- [ ] Filters sidebar updates the results count
- [ ] `OPENROUTER_API_KEY` set in the Vercel dashboard (not committed)
- [ ] Chat widget opens (bottom-left) and answers a test question
- [ ] DevTools → Network shows the key only reaches `/api/chat`, never the browser
- [ ] Browser console is free of errors

---

## Known data characteristics

- **48 of 4592 records never draw** — they have no geometry. One (OBJECTID 4978)
  has fallback coordinates but no rings, so it still produces no polygon.
- **The results count reflects matching records, not drawn polygons.** A filter
  including those 48 reports more than the map shows. This is intentional.
- **Two records have a negative `Shape_Area`** (OBJECTID 5549, 5767) — reversed
  ring winding upstream. Excluded from the filter's advertised range and listed
  under `anomalies` in `dist/data/meta.json`.
- **`Data/plots.json` carries a UTF-8 BOM** and must keep it or be re-tested; the
  build strips it explicitly.
