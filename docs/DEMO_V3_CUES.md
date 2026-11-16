# TerraPulse demo V3: narration cues and shot list

Video: `public/media/terrapulse-demo-v3.mp4`, 29.30 s at 30 fps, 1920×1080, silent.
Captions are burned in and match the script word for word. Speak each line inside its window.

## Narration cues

| Start | End | Words | Line |
|---|---|---|---|
| 0.15 s | 3.35 s | 10 | Earth is changing. But what can NASA data actually prove? |
| 3.55 s | 6.30 s | 9 | TerraPulse measures trends across six variables and eight regions, |
| 6.30 s | 8.70 s | 5 | testing significance and independent evidence. |
| 8.90 s | 13.20 s | 12 | In the Amazon, two rainfall records agree on a decline—not its size. |
| 13.40 s | 16.60 s | 9 | A documented 2005 data shift helps explain the gap. |
| 16.90 s | 19.50 s | 7 | Then we simulate a hypothetical Houston hurricane, |
| 19.50 s | 22.40 s | 7 | tracing refinery exposure through energy supply chains |
| 22.40 s | 24.30 s | 5 | and financial risk—not predicted losses. |
| 26.50 s | 29.30 s | 7 | TerraPulse. See the change. Trace the impact. |

Full script:

> Earth is changing. But what can NASA data actually prove? TerraPulse measures trends across six variables and eight regions, testing significance and independent evidence. In the Amazon, two rainfall records agree on a decline—not its size. A documented 2005 data shift helps explain the gap. Then we simulate a hypothetical Houston hurricane, tracing refinery exposure through energy supply chains and financial risk—not predicted losses. TerraPulse. See the change. Trace the impact.

## Shot list

| Time | Shot |
|---|---|
| 0.0–3.0 s | Opening: the live Earth interface with NASA sea-surface-temperature imagery and event feeds |
| 3.0–7.2 s | Trend Detective: the four NASA questions answered for Amazon rainfall (what, where, how much, significant) |
| 7.2–12.3 s | The Amazon Rainfall Mystery: MERRA-2 −0.541 against GPCP −0.282 mm/day per decade; direction supported, size not confirmed |
| 12.3–15.2 s | The 2005 shift: both records charted, MERRA-2 minus GPCP steps down from 2005 |
| 15.2–16.7 s | Northern Alaska warming: supported by a second dataset (+0.51 against +0.41 °C per decade) |
| 16.7–22.0 s | Disaster Simulator: hypothetical Category 5 hurricane crosses the Texas coast; 4.40 million b/d of refining capacity inside the modelled footprint |
| 22.0–27.6 s | Economic network builds: hurricane → refineries and ports → refining activity → operators → commodities → industries and funds; Markets view states the price impact cannot be estimated |
| 27.6–29.3 s | Closing: pull back to the globe; TerraPulse, "See the change. Trace the impact." |

## Adding your recorded narration

```bash
node scripts/demo-v3/add-voice.mjs path/to/your-voice.wav
```

This keeps the picture untouched, lays your recording under it from 0:00 and writes
`public/media/terrapulse-demo-v3-voice.mp4`. Record against the silent video so your timing follows
the captions; a recording longer than 29.3 s is cut at the end of the picture.
