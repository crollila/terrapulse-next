/** Spherical-Earth helpers. Mean Earth radius 6371.0088 km (IUGG). */
export const EARTH_RADIUS_KM = 6371.0088;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point reached from (lat, lon) travelling distKm along an initial bearing (degrees clockwise from north). Negative distance goes backwards. */
export function destination(lat: number, lon: number, bearingDeg: number, distKm: number): { lat: number; lon: number } {
  const d = distKm / EARTH_RADIUS_KM;
  const b = bearingDeg * D2R;
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * R2D, lon: ((l2 * R2D + 540) % 360) - 180 };
}

/** Geodesic circle as a closed lon/lat ring. */
export function circleRing(lat: number, lon: number, radiusKm: number, steps = 72): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(lat, lon, (i / steps) * 360, radiusKm);
    ring.push([p.lon, p.lat]);
  }
  return ring;
}

/** Great-circle arc as lon/lat pairs (longitudes unwrapped so lines do not jump at the antimeridian). */
export function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number, steps = 64): [number, number][] {
  const p1 = lat1 * D2R;
  const l1 = lon1 * D2R;
  const p2 = lat2 * D2R;
  const l2 = lon2 * D2R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return [[lon1, lat1]];
  const out: [number, number][] = [];
  let prev = lon1;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lon = Math.atan2(y, x) * R2D;
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    prev = lon;
    out.push([lon, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D]);
  }
  return out;
}
