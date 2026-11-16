# TerraPulse Next: notes for Claude Code sessions

## Start of every session

1. `git status` and `git log --oneline -5`.
2. Read `PROGRESS.md`, `BLOCKERS.md`, `TASK_QUEUE.json`. Do not assume they are right.
3. `npm run status` (tests, build, live URL check). Then take the first `todo` task.

## Hard rules

- **Never modify `crollila/terrapulse`** (the original NASA Space Apps entry) or its deployment.
  A read-only reference clone lives at `../_reference/terrapulse-original` with pushes disabled.
- **$0.** No paid APIs, hosting, credits or sign-ups that need a card.
- **No invented numbers.** Every figure is an observation with a source, a reproducible
  calculation, a documented historical value, or an explicitly hypothetical input. Otherwise show
  "Insufficient validated data". Label everything with `EvidenceClass`.
- **No price or return forecasts** without a validated model.
- Do not claim a deploy or a submission succeeded without checking it.
- No secrets in the repository; the public site must work without AI, accounts or this computer.

## Commands

```bash
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run typecheck
npm run build        # dist/
npm run preview
npm run test:e2e     # Playwright against the production preview
TP_BASE_URL=https://crollila.github.io/terrapulse-next/ npm run test:e2e   # against the live site
npm run snapshot     # refresh fallback snapshots of the live feeds
npm run status       # status report: git, tests, live URL
npm run dashboard    # local engineering dashboard on http://localhost:4600
node scripts/capture.mjs http://localhost:4173/   # screenshots and demo recording
```

## Where things are

- `src/sim/hurricane.ts`: wind field, track, decay, exposure, timeline, `MODEL_CARD`.
- `src/sim/graph.ts`: economic network; every edge needs `meaning`, `basis` and a `source`.
- `src/science/stats.ts`: trend statistics. Changes must keep `stats.test.ts` green.
- `src/data/`: adapters, provenance, freshness, layer catalogue, company listings.
- `src/components/`: UI. `Globe.tsx` owns the MapLibre map.
- `public/data/`: bundled datasets with provenance in each file's `meta`.
- `research/`: how the infrastructure and Harvey data were built, with quoted sources.
- `src/sim/rainfall.ts`, `rainRecord.ts`, `harveyHindcast.ts`, `rainGraph.ts`: observed-rainfall
  screen for Hurricane Harvey, its timeline, hindcast and network. `rcliper.ts`: context only.
- `src/sim/wildfire.ts`: observed wildfire record and proximity screen. No spread model, on purpose.
- `src/sim/graph.ts` `buildExposureGraph`: one economic network for every hazard (`ExposureSet`).
- `src/components/RainfallLab.tsx`, `WildfireLab.tsx`, `ExposureNetwork.tsx`, `globe/*Layers.ts`.
- `research/RAINFALL_FLOOD.md`, `research/WILDFIRE.md`, `docs/HAZARD_SIM_BRANCH.md`: the science
  record and branch status. Rebuild data with the `research/scripts/build_*.py` scripts.

## Gotchas

- The built-in browser pane throttles animation frames when hidden; the map then loads very
  slowly. Use Playwright for timing-sensitive checks.
- MapLibre 6 exports are named (`import { Map } from "maplibre-gl"`); its worker is served from
  `public/vendor/` (copied by `scripts/copy-map-worker.mjs`).
- Style expressions are validated strictly: `["case", ["get", x], …]` needs
  `["boolean", ["get", x], false]`.
- The Bash tool mangles heredocs that contain backticks or mixed quotes; write files with the
  Write tool.
- React StrictMode is intentionally off (see DECISIONS.md).
- gridMET point subsets return packed integers without scale factors; read them from the `.das`.
- Run browser tests for a worktree against its own preview port
  (`npx vite preview --port 4183` and `TP_BASE_URL=http://localhost:4183/`), or Playwright may reuse
  another checkout's server on 4173.
- Pin test values from program output, never from a number read off a chart.
