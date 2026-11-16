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
| 2026-11-15 20:57 | `10abb08` | 13 browser tests against the live URL; live bundle contains the hindcast statement | 13 passed |
| 2026-11-15 21:05 | `de15eb5` | 14 browser tests against the live URL (includes the drought what-if) | 14 passed |
| 2026-11-15 21:57 | `44220c1` | 18 browser tests against the live URL (opens on Earth-System Trends; Amazon and Alaska investigations; guided tour to Houston) | 18 passed |
| 2026-11-15 22:00 | `d8f34f0` | Revised video URL: HTTP 200, `video/mp4`, 4,273,133 bytes, 29.300 s, SHA-256 identical to the local render; plays in a browser without sign-in (readyState 4, audio decoded). Earlier video still 200 | OK |
| 2026-11-15 22:35 | `dcd525d` | V3 video URL: HTTP 200, `video/mp4`, 17,799,243 bytes, 29.300 s, 879 frames, 1920×1080, video only; SHA-256 identical to the local render; plays in a browser without sign-in. V2 files unchanged (same SHA-256) | OK |
| 2026-11-15 23:19 | `2130053` | Final narrated demo: `media/terrapulse-demo-final.mp4` HTTP 200, `video/mp4`, 15,349,928 bytes, 29.312 s, 1920×1080 H.264 + AAC; audio stream bit-identical to the team lead's file; plays in a browser without sign-in. Original HEVC copy also published. Earlier videos unchanged | OK |
| 2026-11-15 23:36 | `bdf762f` | Showcase (About, `#about`) merged from branch `showcase` after 357 unit and 22 browser tests passed there; 22 browser tests against the live URL | 22 passed |

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
