// Fetches last-known-valid snapshots of the live hazard feeds so the public site still works
// when a provider is unreachable. Snapshots carry their real retrieval time and are always
// labelled CACHED in the UI. Run: npm run snapshot
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("../public/data/snapshots/", import.meta.url);
const FEEDS = {
  earthquakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
  eonet: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20",
};

await mkdir(OUT, { recursive: true });
for (const [name, url] of Object.entries(FEEDS)) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "terrapulse-snapshot" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const n = (data.features ?? data.events ?? []).length;
    if (!n) throw new Error("empty feed; keeping previous snapshot");
    await writeFile(new URL(`${name}.json`, OUT), JSON.stringify({ retrievedAt: new Date().toISOString(), sourceUrl: url, data }));
    console.log(`${name}: ${n} records saved`);
  } catch (err) {
    console.error(`${name}: FAILED (${err.message}); previous snapshot left untouched`);
    process.exitCode = 1;
  }
}
