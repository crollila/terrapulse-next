// Single source of truth for the V3 demo: narration cues (exact script), scene times, camera
// zooms and on-screen labels. Used by the recorder and the renderer.
export const TOTAL = 29.3;
export const FPS = 30;
export const VIEW = { width: 1800, height: 900 }; // CSS pixels of the app while recording (2:1)

/** Narration, word for word as supplied by the team lead, split into caption cues (seconds). */
export const CUES = [
  { start: 0.15, end: 3.35, text: "Earth is changing. But what can NASA data actually prove?" },
  { start: 3.55, end: 6.3, text: "TerraPulse measures trends across six variables and eight regions," },
  { start: 6.3, end: 8.7, text: "testing significance and independent evidence." },
  { start: 8.9, end: 13.2, text: "In the Amazon, two rainfall records agree on a decline—not its size." },
  { start: 13.4, end: 16.6, text: "A documented 2005 data shift helps explain the gap." },
  { start: 16.9, end: 19.5, text: "Then we simulate a hypothetical Houston hurricane," },
  { start: 19.5, end: 22.4, text: "tracing refinery exposure through energy supply chains" },
  { start: 22.4, end: 24.3, text: "and financial risk—not predicted losses." },
  { start: 26.5, end: 29.3, text: "TerraPulse. See the change. Trace the impact." },
];

/** Scene boundaries (seconds). */
export const SCENES = [
  { id: "hook", start: 0, end: 3.0, title: "Opening: the live Earth interface with NASA sea-surface-temperature imagery and event feeds" },
  { id: "four", start: 3.0, end: 7.2, title: "Trend Detective: the four NASA questions answered for Amazon rainfall (what, where, how much, significant)" },
  { id: "amazon", start: 7.2, end: 12.3, title: "The Amazon Rainfall Mystery: MERRA-2 −0.541 against GPCP −0.282 mm/day per decade; direction supported, size not confirmed" },
  { id: "break", start: 12.3, end: 15.2, title: "The 2005 shift: both records charted, MERRA-2 minus GPCP steps down from 2005" },
  { id: "alaska", start: 15.2, end: 16.7, title: "Northern Alaska warming: supported by a second dataset (+0.51 against +0.41 °C per decade)" },
  { id: "houston", start: 16.7, end: 22.0, title: "Disaster Simulator: hypothetical Category 5 hurricane crosses the Texas coast; 4.40 million b/d of refining capacity inside the modelled footprint" },
  { id: "network", start: 22.0, end: 27.6, title: "Economic network builds: hurricane → refineries and ports → refining activity → operators → commodities → industries and funds; Markets view states the price impact cannot be estimated" },
  { id: "close", start: 27.6, end: TOTAL, title: "Closing: pull back to the globe; TerraPulse, \"See the change. Trace the impact.\"" },
];

/** Camera keyframes over the recorded frame: zoom factor and focus point (0..1 of the frame). */
export const ZOOM = [
  [0.0, 1.0, 0.5, 0.5],
  [3.4, 1.0, 0.5, 0.5],
  [4.1, 1.75, 0.286, 0.714],
  [7.1, 1.75, 0.286, 0.714],
  [7.9, 1.7, 0.706, 0.36],
  [12.3, 1.7, 0.706, 0.36],
  [12.9, 1.7, 0.706, 0.43],
  [15.1, 1.7, 0.706, 0.43],
  [15.5, 1.7, 0.706, 0.36],
  [16.6, 1.7, 0.706, 0.36],
  [17.3, 1.0, 0.5, 0.5],
  [19.3, 1.0, 0.5, 0.5],
  [20.0, 1.6, 0.3125, 0.38],
  [21.8, 1.6, 0.3125, 0.38],
  [22.6, 1.45, 0.655, 0.455],
  [27.4, 1.45, 0.655, 0.455],
  [28.0, 1.0, 0.5, 0.5],
  [TOTAL + 1, 1.0, 0.5, 0.5],
];

/** Short labels in the top-left of the picture. */
export const LABELS = [
  { start: 0.3, end: 2.85, text: "NASA sea-surface-temperature imagery with live natural-event feeds (NASA EONET, USGS)", color: "0x0b4fd6" },
  { start: 3.35, end: 7.05, text: "What is changing?  Where?  How much?  Is it significant?", color: "0x0b4fd6" },
  { start: 7.45, end: 12.15, text: "South-western Amazon study box, rainfall 1981–2025: two records", color: "0x0b4fd6" },
  { start: 12.5, end: 15.05, text: "MERRA-2 minus GPCP: the gap opens in 2005", color: "0xb76a00" },
  { start: 15.35, end: 16.55, text: "Northern Alaska: two independent records agree", color: "0x1f8a57" },
  { start: 16.95, end: 27.45, text: "HYPOTHETICAL scenario  ·  MODELED exposure  ·  not a forecast", color: "0x6941c6" },
];

export const CLOSING = { start: 27.9, title: "TerraPulse", tagline: "See the change. Trace the impact." };
