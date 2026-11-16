// Copies the original TerraPulse team's independent regional series (GPCP v2.3 rainfall and NASA
// GISTEMP v4 temperature anomalies) into this app, unchanged, so the case studies can chart them.
// Source: ../_reference/terrapulse-original/backend/data/crosscheck (read-only clone of crollila/terrapulse).
//   node scripts/build-crosscheck.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../../_reference/terrapulse-original/backend/data/crosscheck/", import.meta.url);
const OUT = new URL("../public/data/trends/crosscheck/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const prov = JSON.parse(readFileSync(new URL("provenance.json", SRC), "utf8"));
for (const id of ["gpcp", "gistemp"]) {
  const [head, ...rows] = readFileSync(new URL(`${id}.csv`, SRC), "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const year = [];
  const month = [];
  const regions = Object.fromEntries(cols.slice(2).map((c) => [c, []]));
  for (const r of rows) {
    const v = r.split(",");
    year.push(Number(v[0]));
    month.push(Number(v[1]));
    cols.slice(2).forEach((c, i) => regions[c].push(v[i + 2] === "" ? null : Number(v[i + 2])));
  }
  const { regions: _r, ...meta } = prov.datasets[id];
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify({ meta: { id, ...meta, copiedFrom: "crollila/terrapulse backend/data/crosscheck (unchanged values)" }, year, month, regions }));
  console.log(id, year.length, "months", Object.keys(regions).length, "regions");
}
