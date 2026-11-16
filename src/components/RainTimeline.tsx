import { useEffect } from "react";
import { RAIN_WINDOW_H, useStore } from "../state/store";
import type { RainRecord } from "../state/rainDerived";
import { fmtUtc, statusLabel } from "../sim/rainRecord";
import { Badge, Icon } from "./ui";

/** Seconds for a full run of the record. */
const DURATION_S = 24;
const HOUR_MS = 3_600_000;

export interface RecordMarker {
  /** Time of the marker, ms since the epoch. */
  ms: number;
  label: string;
  color: string;
}

/** Timeline of the observed record: real dates, daily rainfall steps, hourly storm position. */
export function RainTimeline({ rec, markers }: { rec: RainRecord | null; markers: RecordMarker[] }) {
  const hours = useStore((s) => s.rain.hours);
  const playing = useStore((s) => s.rain.playing);
  const setRain = useStore((s) => s.setRain);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.75, (now - last) / 1000); // cap so a background tab does not jump to the end
      last = now;
      const st = useStore.getState();
      const next = st.rain.hours + (dt / DURATION_S) * RAIN_WINDOW_H;
      if (next >= RAIN_WINDOW_H) {
        st.setRain({ hours: RAIN_WINDOW_H, playing: false });
        return;
      }
      st.setRain({ hours: next });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const w = rec?.window;
  const pos = hours / RAIN_WINDOW_H;
  const stage = !rec ? "Loading the record…" : rec.count === 0 ? "No rainfall day complete yet" : `Rainfall through ${fmtUtc(rec.window.startMs + rec.count * 24 * HOUR_MS, false)}`;
  const storm = rec?.now ? `${statusLabel(rec.now.status)}${rec.now.vmaxKt != null ? `, ${Math.round(rec.now.vmaxKt)} kt` : ""}` : "";
  const frac = (ms: number) => (w ? (ms - w.startMs) / (w.hours * HOUR_MS) : 0);

  return (
    <section className="timeline" aria-label="Record timeline" data-testid="rain-timeline">
      <div className="tl-top rain-top">
        <button
          className="btn primary sm icon-btn"
          aria-label={playing ? "Pause" : hours >= RAIN_WINDOW_H ? "Replay" : "Play"}
          data-testid="rain-play"
          onClick={() => (playing ? setRain({ playing: false }) : setRain({ hours: hours >= RAIN_WINDOW_H - 0.01 ? 0 : hours, playing: true }))}
        >
          {playing ? Icon.pause : Icon.play}
        </button>
        <button className="btn sm icon-btn" aria-label="Rewind to start" data-testid="rain-rewind" onClick={() => setRain({ hours: 0, playing: false })}>
          {Icon.rewind}
        </button>
        <span className="tl-stage" data-testid="rain-stage">
          {stage}
        </span>
        <Badge kind="OBSERVED" />
        <span className="spacer" />
        {rec && (
          <span className="tl-clock" data-testid="rain-clock">
            {fmtUtc(rec.ms).replace(" 2017", "")}
            {storm ? ` · ${storm}` : ""}
          </span>
        )}
      </div>
      <div className="tl-track">
        <div className="tl-seg" style={{ left: 0, right: 0, background: "rgba(29,107,255,0.16)" }} />
        {w &&
          markers
            .filter((m) => m.ms >= w.startMs && m.ms <= w.startMs + w.hours * HOUR_MS)
            .map((m) => <div key={`${m.ms}${m.label}`} className="tl-seg" style={{ left: `${frac(m.ms) * 100}%`, width: 2, top: 4, height: 18, background: m.color, borderRadius: 1 }} title={m.label} />)}
        <input
          type="range"
          min={0}
          max={RAIN_WINDOW_H}
          step={1}
          value={Math.round(hours)}
          aria-label="Scrub the record timeline"
          data-testid="rain-scrub"
          style={{ ["--fill" as any]: `${pos * 100}%` }}
          onChange={(e) => setRain({ hours: Number(e.target.value), playing: false })}
        />
      </div>
      <div className="tl-ticks" aria-hidden="true">
        {w &&
          Array.from({ length: w.nDays }, (_, i) => (
            <span key={i} className={i === rec!.count - 1 ? "on" : ""} style={{ width: `${100 / w.nDays}%` }}>
              {fmtUtc(w.startMs + (i + 1) * 24 * HOUR_MS, false).replace(/ \d{4}$/, "")}
            </span>
          ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        Rainfall advances in whole days (24 hours ending 12:00 UTC on the date shown); the storm position is hourly, from the NHC best track.
      </div>
    </section>
  );
}
