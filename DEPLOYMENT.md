# Deployment

- **Live URL:** https://crollila.github.io/terrapulse-next/
- **Host:** GitHub Pages (free, no card), published by GitHub Actions from `main`.
- **Workflow:** `.github/workflows/deploy.yml`: `npm ci` → type-check → unit tests → refresh feed
  snapshots (failure tolerated) → build → upload `dist/` → deploy.
- **Base path:** Vite `base: "./"`, so the same build works at `/terrapulse-next/` and locally.
  There is no client-side routing; the only hash used is `#methods`.
- **Map worker:** `public/vendor/maplibre-gl-worker.mjs`, copied from `node_modules` on install,
  dev and build.

## Deploy

```bash
npm run test:all          # type-check, unit tests, build, browser tests
git push origin main      # Actions builds and deploys
gh run watch --repo crollila/terrapulse-next
npm run check:live        # browser tests against the live URL; records the result in status/
```

A successful local build is not a successful deployment. Only `npm run check:live` (or opening the
URL) counts.

## Verification log

| When (MST) | Commit | Check | Result |
|---|---|---|---|
| 2026-11-15 20:17 | `2b60e9e` | HTTP 200 on the live URL after the first Actions run | OK |
| 2026-11-15 20:35 | `713bcc4` | 12 browser tests against the live URL (Chromium) | 12 passed |
| 2026-11-15 20:38 | `3dff26e` | Demo video URL returns 200, `video/mp4`, 2,579,983 bytes | OK |
| 2026-11-15 20:50 | `ce70ac8` | 13 browser tests against the live URL (Chromium) | 13 passed |

What the live browser tests cover: page and assets load; globe renders; layers toggle; a hazard
opens its details; the Houston scenario runs with play, pause, rewind and scrub; parameters change
results; network and globe selection sync; markets and portfolio panes; trend explorer; command
bar; methods dialog; cached fallback when feeds are blocked; laptop, tablet and mobile layouts.

Firefox and WebKit were run against the local production build (13 passed each), not against the live URL. Not verified: real Safari, real phones, slow networks.

## Secrets

None exist. The site calls only keyless public endpoints. The repository was scanned for keys,
tokens, passwords and local paths before the first push. `window.__tpStore` and `window.__tpMap`
are exposed for tests and hold no credentials.

## Rollback

```bash
git revert <bad commit> && git push origin main      # redeploys the previous state
```

or re-run an earlier successful workflow run from the Actions tab. Never force-push.

## The original project

`https://crollila.github.io/terrapulse/` is deployed from `crollila/terrapulse` and is not touched
by anything here. This repository has no remote, workflow or script that points at it.

## Cost

$0. GitHub Pages and Actions on a public repository; NASA, USGS and OpenFreeMap endpoints are free
and keyless. No paid tier is required at any traffic level the free services allow.
