/**
 * R-CLIPER (Rainfall CLImatology and PERsistence): the simple statistical tropical-cyclone rainfall
 * model run operationally by the U.S. National Hurricane Center as a baseline. Pure and deterministic.
 *
 * Source of every equation and constant: Tuleya, R. E., M. DeMaria and R. J. Kuligowski (2007),
 * "Evaluation of GFDL and simple statistical model rainfall forecasts for U.S. landfalling tropical
 * storms", Weather and Forecasting, 22, 56-70, Eqs. (3)-(5) and Table 2 ("NHC" rows, the
 * bias-corrected constants of the operational version). Checked against the publisher's equation
 * and table images.
 *
 *   TRR(r, V) = T0 + (Tm - T0) (r / rm)        r <  rm     (3a)
 *   TRR(r, V) = Tm exp[-(r - rm) / re]         r >= rm     (3b)
 *   T0 = a1 + b1 U,  Tm = a2 + b2 U,  rm = a3 + b3 U,  re = a4 + b4 U     (4)
 *   U = 1 + (Vm - 35) / 33,  Vm = maximum wind in knots                   (5)
 *
 * TRR is a rain rate in inches per day; r, rm and re are in km.
 *
 * What the model is NOT: it is symmetric about the centre, knows nothing of terrain, fronts, shear
 * or moisture, and was fitted to satellite rain rates over the ocean for storms of 45, 80 and 115 kt.
 * Its own authors report that it captures about 60% of observed rain volume and is biased low for
 * heavy rain. For Hurricane Harvey it gives a small fraction of the observed rainfall at the
 * refineries (research/RAINFALL_FLOOD.md), so the app shows its output as context only and never
 * counts exposure with it.
 */
import { haversineKm } from "./geo";
import { T_END_H, T_START_H, stormCenter, vmaxAtKt, type HurricaneParams } from "./hurricane";

/** Tuleya et al. (2007), Table 2, rows "NHC". a1, b1, a2, b2 in inches per day; a3, b3, a4, b4 in km. */
export const RCLIPER_NHC = { a1: -1.1, b1: 3.96, a2: -1.6, b2: 4.8, a3: 64.5, b3: -13.0, a4: 150, b4: -16.0 } as const;

/** 1 inch per day in millimetres per hour. */
export const MM_PER_H_PER_IN_PER_DAY = 25.4 / 24;

/** "By 500-km radius, the rain rates become very small ... the R-CLIPER model only used the rain rates out to 500-km radius" (p. 60). */
export const RCLIPER_MAX_RADIUS_KM = 500;

/** The fit rests on three mean profiles assumed to represent 45, 80 and 115 kt (p. 62). */
export const RCLIPER_FIT_RANGE_KT = [45, 115] as const;

/** Time step of the storm-total integration, hours ("0.5 h", Tuleya et al. 2007). */
export const RCLIPER_STEP_H = 0.5;

/** Eq. (5): normalised maximum wind. */
export const normalisedWind = (vmaxKt: number): number => 1 + (vmaxKt - 35) / 33;

export interface RcliperParams {
  /** Rain rate at the centre, inches per day. */
  t0: number;
  /** Maximum rain rate, at r = rm, inches per day. */
  tm: number;
  /** Radius of maximum rain rate, km. */
  rm: number;
  /** e-folding radius of the outer decay, km. */
  re: number;
}

/** Eq. (4) with the NHC constants. */
export function rcliperParams(vmaxKt: number): RcliperParams {
  const u = normalisedWind(vmaxKt);
  const c = RCLIPER_NHC;
  return { t0: c.a1 + c.b1 * u, tm: c.a2 + c.b2 * u, rm: c.a3 + c.b3 * u, re: c.a4 + c.b4 * u };
}

/**
 * Eq. (3): rain rate (mm per hour) at radius rKm for a storm with maximum wind vmaxKt.
 * Implementation choices that are not in the paper, all conservative: the rate is zero beyond
 * 500 km (the radius the fit used), a negative rate is zero, and if rm or re is not positive
 * (maximum wind far outside the fitted range) the rate is zero rather than extrapolated.
 */
export function rcliperRateMmH(rKm: number, vmaxKt: number): number {
  if (!(rKm >= 0) || !Number.isFinite(vmaxKt) || rKm > RCLIPER_MAX_RADIUS_KM) return 0;
  const { t0, tm, rm, re } = rcliperParams(vmaxKt);
  if (!(rm > 0) || !(re > 0)) return 0;
  const inPerDay = rKm < rm ? t0 + (tm - t0) * (rKm / rm) : tm * Math.exp(-(rKm - rm) / re);
  return Math.max(0, inPerDay) * MM_PER_H_PER_IN_PER_DAY;
}

export const outsideFitRange = (vmaxKt: number): boolean => vmaxKt < RCLIPER_FIT_RANGE_KT[0] || vmaxKt > RCLIPER_FIT_RANGE_KT[1];

export interface StormSample {
  /** Hours on any consistent clock. */
  tH: number;
  lat: number;
  lon: number;
  /** Maximum wind, knots; null = unknown (no rain is attributed to that sample). */
  vmaxKt: number | null;
}

/**
 * Storm-total rainfall (mm) at a point: the rain rate integrated in time along a track, by the
 * trapezoid rule between consecutive samples. Samples should be no more than RCLIPER_STEP_H apart.
 */
export function rcliperTotalMm(track: StormSample[], lat: number, lon: number): number {
  let total = 0;
  let prev: { tH: number; rate: number } | null = null;
  for (const s of track) {
    const rate = s.vmaxKt === null ? 0 : rcliperRateMmH(haversineKm(lat, lon, s.lat, s.lon), s.vmaxKt);
    if (prev) {
      const dt = s.tH - prev.tH;
      if (!(dt > 0)) throw new Error("track samples must be in increasing time order");
      total += 0.5 * (prev.rate + rate) * dt;
    }
    prev = { tH: s.tH, rate };
  }
  return total;
}

/** The hypothetical scenario's track, sampled every RCLIPER_STEP_H over the modelled window. */
export function scenarioTrack(p: HurricaneParams): StormSample[] {
  const out: StormSample[] = [];
  const n = Math.round((T_END_H - T_START_H) / RCLIPER_STEP_H);
  for (let i = 0; i <= n; i++) {
    const tH = T_START_H + i * RCLIPER_STEP_H;
    const c = stormCenter(p, tH);
    out.push({ tH, lat: c.lat, lon: c.lon, vmaxKt: vmaxAtKt(p, tH) });
  }
  return out;
}

/** R-CLIPER storm-total rainfall (mm) at a point for the hypothetical scenario. */
export function scenarioRainfallMm(p: HurricaneParams, lat: number, lon: number): number {
  return rcliperTotalMm(scenarioTrack(p), lat, lon);
}

/**
 * Kraft's rule of thumb for the largest storm rainfall. Pfost (2000), National Weather Digest 24,
 * p. 61: "an estimate for the maximum rainfall from a landfalling tropical cyclone in inches is 100
 * divided by the storm speed in knots". A rule of thumb, not a model: it has no place or shape.
 */
export function kraftMaxRainfallInches(forwardSpeedKmh: number): number | null {
  const kt = forwardSpeedKmh / 1.852;
  return kt > 0 ? 100 / kt : null;
}

export const RCLIPER_CARD = {
  name: "R-CLIPER rainfall climatology (context only)",
  status: "EXPERIMENTAL and shown as context only. It is the published operational baseline, implemented exactly as printed; in a hindcast on Hurricane Harvey it reproduced a small fraction of the observed rainfall, so no exposure is counted with it.",
  formula: [
    "TRR(r) = T0 + (Tm - T0)(r / rm)  for r < rm;   Tm exp(-(r - rm) / re)  for r >= rm     [inches per day]",
    "T0 = -1.10 + 3.96 U,  Tm = -1.60 + 4.80 U,  rm = 64.5 - 13.0 U km,  re = 150 - 16.0 U km",
    "U = 1 + (Vmax - 35) / 33,  Vmax in knots",
    "storm total at a site = integral of TRR(distance to the centre) along the track, 0.5-hour steps",
  ],
  limitations: [
    "Symmetric about the centre: no rainbands, fronts, terrain, shear or moisture supply.",
    "Fitted to satellite rain rates over the ocean for storms of 45, 80 and 115 kt, out to 500 km.",
    "Its authors report about 60% of observed rain volume and a low bias for heavy rain (Tuleya et al. 2007).",
    "A slow or stalled storm is its worst case: rain far from the centre, where Harvey flooded Houston, is exactly what it lacks.",
  ],
  references: [
    "Tuleya, R. E., M. DeMaria and R. J. Kuligowski (2007): Evaluation of GFDL and simple statistical model rainfall forecasts for U.S. landfalling tropical storms. Wea. Forecasting, 22, 56-70.",
    "Lonfat, M., F. D. Marks and S. S. Chen (2004): Precipitation distribution in tropical cyclones using the Tropical Rainfall Measuring Mission (TRMM) Microwave Imager: a global perspective. Mon. Wea. Rev., 132, 1645-1660.",
    "Pfost, R. L. (2000): Operational tropical cyclone quantitative precipitation forecasting. National Weather Digest, 24, 61-66.",
  ],
} as const;
