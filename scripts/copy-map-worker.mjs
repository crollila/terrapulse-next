// MapLibre runs tile and GeoJSON work in a web worker loaded by URL. Serving the vendor file
// untouched from public/ is the reliable path under both the dev server and a GitHub Pages sub-path.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public", "vendor"), { recursive: true });
copyFileSync(join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"), join(root, "public", "vendor", "maplibre-gl-worker.mjs"));
console.log("copied maplibre-gl-worker.mjs to public/vendor/");
