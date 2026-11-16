# NASA Space Apps 2026: submission kit

Prepared 15 November 2026 (MST). **Nothing has been submitted by this repository or by the AI
assistant.** The Team Owner submits. The window closes **Sunday 15 November 2026 at 23:59 in the
Team Owner's local time (MST)**; only the last saved version is judged.

## V3 demo video (final cut), 15 November 2026, 22:35 MST

**https://crollila.github.io/terrapulse-next/media/terrapulse-demo-v3.mp4**

- **29.30 s**, 879 frames at 30 fps, 1920×1080 (picture 1920×900 above a caption band), H.264. **Silent on purpose**: no audio track, so
  there is no synthetic voice to disclose. Captions are burned in and match the narration script
  word for word.
- Recorded from the deployed application with the computer's graphics card
  (`scripts/demo-v3/record.mjs`), then zooms, captions, context labels and the closing overlay
  were added (`scripts/demo-v3/render.mjs`). Nothing is mocked; no video or image is AI-generated.
- Additions that are not part of the app: blue highlight outlines around existing elements (drawn
  by the recorder for emphasis), camera zooms, the caption band, the one-line context labels and the
  closing "TerraPulse / See the change. Trace the impact." overlay. No value on screen is altered.
- Narration cue times, the shot list and how to add your own recording:
  [DEMO_V3_CUES.md](DEMO_V3_CUES.md). Subtitles: `…/media/terrapulse-demo-v3.srt`.
- To add your narration: `node scripts/demo-v3/add-voice.mjs path/to/voice.wav` writes
  `terrapulse-demo-v3-voice.mp4` with the picture untouched.
- V2 (narrated and silent) and the first video are unchanged at their URLs.

## 0. Revised demo video (science first), 15 November 2026, 22:05 MST

**https://crollila.github.io/terrapulse-next/media/terrapulse-demo-v2.mp4**

- Runtime **29.30 s** (879 frames at 30 fps), 1280×720, H.264 video, AAC audio. Under the 30-second limit.
- Real footage: a screen recording of the deployed application (https://crollila.github.io/terrapulse-next/)
  made by `scripts/demo-v2/record.mjs`, then a title card, captions and narration added by
  `scripts/demo-v2/render.mjs`. Nothing is mocked and no video is AI-generated.
- **The narration voice is synthetic**: the Windows built-in text-to-speech voice ("Microsoft Zira").
  The narration text was written by the AI assistant because no narration text was supplied. If the
  submission form asks about SI-generated audio, say so.
- **Silent, captions-only copy** (same footage, title card and captions, no audio track, 29.30 s):
  https://crollila.github.io/terrapulse-next/media/terrapulse-demo-v2-silent.mp4
- The earlier video (`terrapulse-next-demo-30s.mp4`, 29.4 s, no audio) is unchanged and remains
  available as a fallback at its original URL.

Scenes: title card (TerraPulse, "Earth intelligence. Economic foresight.") → the four answers for
Amazon rainfall → The Amazon Rainfall Mystery (MERRA-2 against GPCP) → the 2005 break and its
figures → Northern Alaska warming → the Houston hurricane scenario and its economic network.

Narration transcript and captions:

| Time | Narration | Caption |
|---|---|---|
| 0.3–6.1 s | Four questions of NASA Earth data: what is changing, where, how much, and is it significant? | What is changing? Where? How much? Is it significant? |
| 6.4–14.0 s | In one Amazon study box, MERRA-2 shows rainfall falling fast. A second record agrees on direction, at about half the rate. | MERRA-2: −0.541 mm/day per decade · GPCP: −0.282 · same direction, about half the rate |
| 14.3–18.4 s | The gap opens in 2005, when the rain-gauge input changed. | The records part in 2005: a documented change in the rain-gauge input |
| 18.6–21.3 s | In northern Alaska, two records agree. | Northern Alaska warming: supported by two independent records |
| 21.6–26.4 s | Then a what-if hurricane over real Houston refineries: exposure, not a forecast. | Hypothetical hurricane · real refineries (EIA) · exposure, not a forecast |

Accuracy check of every statement against the app: −0.541 and −0.282 mm/day per decade are the
published MERRA-2 and GPCP trends for the south-western Amazon study box (ratio 1.9); the 2005
break is the team's level-shift result (gap −0.13 before, −0.99 from 2005) and the documented
change in the gauge input is Reichle et al. (2017); Northern Alaska is "supported by a second
dataset" (+0.51 MERRA-2, +0.41 GISTEMP); the hurricane is labelled hypothetical and the 4.40
million b/d is exposure, not a forecast.

Re-create it:

```bash
powershell -ExecutionPolicy Bypass -File scripts/demo-v2/tts.ps1     # narration clips (Windows)
node scripts/demo-v2/plan.mjs                                        # timeline from clip lengths
node scripts/demo-v2/record.mjs https://crollila.github.io/terrapulse-next/
node scripts/demo-v2/render.mjs
```

## 1. What is being submitted

The team's entry is the original **TerraPulse** (challenge: *Be an Earth System Trend Detective!*):

- Live tool: https://crollila.github.io/terrapulse/
- Source: https://github.com/crollila/terrapulse
- Form text, ready to paste: `docs/SUBMISSION_DRAFT.md` in that repository.

**TerraPulse Next** (this repository) is a separate extension built on 15 November 2026. It does
not replace or change the original. Whether to mention it in the submission is the Team Owner's
decision; see section 6.

## 2. Two things only the Team Owner can do tonight

1. **Demo link.** A video of 30 seconds or less, or at most 7 slides including the title, at a
   public link that opens without a login. Over either limit makes the project ineligible for
   Global Judging. Options, fastest first:
   - Use the revised 29.3-second video (section 0), which leads with the science:
     https://crollila.github.io/terrapulse-next/media/terrapulse-demo-v2.mp4
     Fallback, earlier 29.4-second silent capture (section 4):
     https://crollila.github.io/terrapulse-next/media/terrapulse-next-demo-30s.mp4
     (uploading the same file to YouTube as "unlisted" also works and is the more usual format).
   - Or the 7-slide outline in section 5, with the real screenshots in `docs/screenshots/`.
   - Or the shot list for the original tool in the original repository's `docs/DEMO.md`.
2. **Press "Submit for Judging"** and confirm the confirmation screen. Do not save the page again
   afterwards.

Before submitting, read the SI (AI) statement in the original `SUBMISSION_DRAFT.md` and correct
anything that is not accurate. The submission guide says SI "should not be used to (come up with
your idea of how to solve the challenge)"; only the team knows how the idea developed.

## 3. Verified feature inventory (TerraPulse Next)

Each item was exercised in a real browser by the automated suite (`tests/e2e/app.spec.ts`).

| Feature | Status |
|---|---|
| 3D globe: rotate, zoom, fly to places and coordinates | Works |
| Live hazards: USGS earthquakes, NASA EONET events, with real timestamps and freshness labels | Works; falls back to a labelled snapshot offline |
| NASA GIBS imagery layers (precipitation, land and sea surface temperature, NDVI, true colour) | Works |
| U.S. refineries (EIA) and ports (USACE) | Works; U.S. only |
| Trend explorer: 6 variables × 8 regions, any window of 15+ years, two significance tests, second opinion, 2005 Amazon data-quality case | Works; reproduces the original pipeline's published numbers |
| Houston Energy Shock: hypothetical Category 5 hurricane, wind field, exposure of real facilities | Works; experimental model, not validated against historical storms |
| Timeline: play, pause, rewind, scrub; drives globe and network together | Works |
| Economic network with sourced, modelled and hypothesis links; globe ↔ network selection | Works |
| Hurricane Harvey historical record with real EIA series | Works |
| Portfolio exposure screen with local save, JSON import and export | Works; physical exposure only |
| Drought what-if: precipitation index, record episodes, soil and NDVI response (8 NASA regions) | Works; experimental; no economic exposure |
| Hindcast of the hurricane screen against Harvey and Ike | Done; the model **failed** on Harvey and is inconclusive on Ike, and the app says so |
| Wildfire and other hazard models | **Not built** |
| Infrastructure outside the United States | **Not included** |
| Price or return forecasts | **Deliberately withheld** ("cannot be estimated") |

## 4. Demo video (real footage)

`public/media/terrapulse-next-demo-30s.mp4`: 29.4 s, 1280×720, H.264, no audio, captions burned
in. It is a screen recording of the running application made by `scripts/capture.mjs`; nothing is
mocked or pre-rendered, and it is not AI-generated video.

| Time | Scene | Caption |
|---|---|---|
| 0.0–3.4 s | Globe turns; live earthquake, wildfire and storm markers | TerraPulse · live hazards on one globe (NASA EONET, USGS) |
| 3.4–9.8 s | Trend explorer on the south-western Amazon rainfall series; the 2005 marker and the data-quality panel | NASA MERRA-2 trend test · a 2005 rainfall break traced to the data, not the weather |
| 9.8–13.2 s | Camera flies to the Texas coast; refineries and ports appear | Scenario 001 · a hypothetical Category 5 hurricane on the Texas coast |
| 13.2–20.4 s | Wind field crosses the coast; facilities change colour as modelled wind reaches them | A modelled wind field reaches real refineries (EIA) and ports (USACE) |
| 20.4–26.2 s | Network builds: activity, operators, commodities, industries, funds; one chain highlighted | Exposure traced through a sourced economic network |
| 26.2–29.4 s | Markets panel: "cannot be estimated" plus the Hurricane Harvey record | Evidence first · capacity exposed, never an invented price forecast |

Re-create it:

```bash
npm run build
npm run preview -- --port 4173          # in one terminal
node scripts/capture.mjs http://localhost:4173/ video
ffmpeg -y -ss 0.9 -t 29.4 -i docs/media/terrapulse-demo-raw.webm -/filter:v scripts/demo-captions.txt -an -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart public/media/terrapulse-next-demo-30s.mp4
```

Optional narration (about 65 words, fits 29 seconds):

> TerraPulse finds trends in NASA Earth data and tests whether to believe them. In the Amazon it
> caught a rainfall drop that is partly a change in the measurement system. The same evidence
> rules drive a what-if: a hypothetical Category 5 hurricane, real refineries and ports, and a
> sourced chain from exposure to the economy. Where the data stop, it says so.

## 5. Seven-slide fallback (title included)

Screenshots are in `docs/screenshots/` (use the `desktop-1440-*` set).

1. **Title.** TerraPulse: find a trend in NASA Earth data, then find out whether to believe it.
   Team Orbital Alpha. Image: `desktop-1440-1-live-world.png`.
2. **The question.** What is changing, where, how much, and is it significant? Six variables,
   eight regions, 1981–2025 (MERRA-2) and 2000–2026 (MODIS NDVI).
3. **How we test it.** Deseasonalised trend with a 95% range; two tests corrected for
   month-to-month persistence; every start and end year; a second, independent dataset.
4. **What we found.** Temperature rose significantly in seven of eight regions, fastest in northern
   Alaska (+0.51 °C per decade; GISTEMP agrees on the ranking). Image: trend explorer.
5. **The warning.** South-western Amazon rainfall: −0.54 mm/day per decade in MERRA-2, about half
   that in GPCP. A 1.07 mm/day jump in 2005 matches a documented change in the rain-gauge input
   (Reichle et al. 2017). Detected is not validated. Image: `desktop-1440-2-trend-amazon.png`.
6. **From Earth to economy (extension).** A hypothetical Category 5 hurricane on the Texas coast:
   a modelled wind field over real refineries and ports, traced through a sourced economic
   network. Exposure, not a forecast. Images: `desktop-1440-3-houston-exposure.png`,
   `desktop-1440-4-impact-network.png`.
7. **Limits and tools.** Regions are boxes; four variables have no second dataset; the hurricane
   model is wind-only and experimental. NASA data: MERRA-2, MODIS, GISTEMP, GIBS, EONET. AI tool
   used and disclosed: Anthropic Claude.

Numbers on slides 4 and 5 are from the original repository's README (committed data, retrieved
14 November 2026).

## 6. If the Team Owner chooses to mention the extension

Suggested sentence for the detailed description (edit freely):

> As an extension, TerraPulse Next (https://crollila.github.io/terrapulse-next/, source
> https://github.com/crollila/terrapulse-next) puts the same trend analysis on a 3D globe with live
> NASA EONET and USGS hazards and adds a what-if hurricane exposure screen over EIA refinery and
> USACE port data. It reports capacity exposed to a modelled wind field and withholds any price
> forecast.

If it is mentioned, the SI statement must also cover it. Suggested addition:

> The extension TerraPulse Next was generated on 15 November 2026 by an SI coding assistant
> (Anthropic Claude, via Claude Code) from a specification written by the team lead, who reviewed
> the result. Its demo video is a screen recording of the running application, not SI-generated
> video.

Additional data and references to list in that case: NASA EONET v3; NASA GIBS (IMERG, MODIS LST and
NDVI, MUR SST, corrected reflectance); USGS earthquake feeds; U.S. EIA Refinery Capacity Report and
petroleum history series; USACE/BTS Principal Ports; U.S. DOE Hurricane Harvey event reports; NHC
tropical cyclone reports; Holland (1980); Kaplan and DeMaria (1995); OpenFreeMap and OpenStreetMap;
MapLibre GL JS, React, Vite, TypeScript, Zustand, Vitest, Playwright.

**Caution.** The submission guide's rule about SI and the idea of the solution applies to the
extension too. If there is any doubt, leave the extension out of the judged submission; the
original project stands on its own.

## 7. Link check before submitting

Open each in a private browser window:

- https://crollila.github.io/terrapulse/ (the judged tool)
- https://github.com/crollila/terrapulse
- the demo link you chose
- optional: https://crollila.github.io/terrapulse-next/
