import { useEffect } from "react";
import { useStore } from "../state/store";
import { useScenario, useTimeline } from "../state/derived";
import { PHYSICAL_FRACTION, STAGES, posForHour } from "../sim/hurricane";
import { Badge, Icon } from "./ui";

/** Seconds for a full run of the timeline. */
const DURATION_S = 26;

export function Timeline() {
  const pos = useStore((s) => s.simPos);
  const playing = useStore((s) => s.simPlaying);
  const setPos = useStore((s) => s.setSimPos);
  const tl = useTimeline();
  const { result } = useScenario();

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.75, (now - last) / 1000); // cap so a background tab does not jump to the end
      last = now;
      const st = useStore.getState();
      const next = st.simPos + dt / DURATION_S;
      if (next >= 1) {
        st.setSimPos(1);
        st.setSimPlaying(false);
        return;
      }
      st.setSimPos(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const st = useStore.getState();
  const clock = tl.tH === null ? "after the modelled window" : Math.abs(tl.tH) < 0.13 ? "landfall" : `${Math.abs(tl.tH).toFixed(0)} h ${tl.tH < 0 ? "before" : "after"} landfall`;
  const bounds = [0, result.firstOnset34H !== null ? posForHour(result.firstOnset34H) : PHYSICAL_FRACTION, result.firstThresholdH !== null ? posForHour(result.firstThresholdH) : PHYSICAL_FRACTION];
  const n = STAGES.length - 3;
  for (let i = 0; i < n; i++) bounds.push(PHYSICAL_FRACTION + (i * (1 - PHYSICAL_FRACTION)) / n);
  bounds.push(1);

  return (
    <section className="timeline" aria-label="Scenario timeline" data-testid="timeline">
      <div className="tl-top">
        <button
          className="btn primary sm icon-btn"
          aria-label={playing ? "Pause" : pos >= 1 ? "Replay" : "Play"}
          data-testid="tl-play"
          onClick={() => {
            if (playing) st.setSimPlaying(false);
            else {
              if (pos >= 0.999) st.setSimPos(0);
              st.startSim();
            }
          }}
        >
          {playing ? Icon.pause : Icon.play}
        </button>
        <button className="btn sm icon-btn" aria-label="Rewind to start" data-testid="tl-rewind" onClick={() => { st.setSimPlaying(false); st.setSimPos(0); }}>
          {Icon.rewind}
        </button>
        <span className="tl-stage" data-testid="tl-stage">
          {tl.stageIndex + 1}. {tl.stage.label}
        </span>
        <Badge kind={tl.stage.basis === "MODELED" ? "MODELED" : "ILLUSTRATIVE"} />
        <span className="spacer" />
        {tl.tH !== null && (
          <span className="tl-clock" data-testid="tl-clock">
            {clock}
          </span>
        )}
      </div>
      <div className="tl-track">
        <div className="tl-seg" style={{ left: 0, width: `${PHYSICAL_FRACTION * 100}%`, background: "rgba(29,107,255,0.16)" }} />
        <div className="tl-seg" style={{ left: `${PHYSICAL_FRACTION * 100}%`, right: 0, background: "repeating-linear-gradient(135deg, rgba(183,106,0,0.22) 0 5px, rgba(183,106,0,0.08) 5px 10px)" }} />
        <div className="tl-seg" style={{ left: `${posForHour(0) * 100}%`, width: 2, top: 4, height: 18, background: "#d93a3f", borderRadius: 1 }} title="Landfall" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={pos}
          aria-label="Scrub the scenario timeline"
          data-testid="tl-scrub"
          style={{ ["--fill" as any]: `${pos * 100}%` }}
          onChange={(e) => {
            st.setSimPlaying(false);
            useStore.setState({ simStarted: true });
            setPos(Number(e.target.value));
          }}
        />
      </div>
      <div className="tl-ticks" aria-hidden="true">
        {STAGES.map((s, i) => (
          <span key={s.key} className={i === tl.stageIndex ? "on" : ""} style={{ width: `${Math.max(0, bounds[i + 1] - bounds[i]) * 100}%` }} title={s.label}>
            {bounds[i + 1] - bounds[i] > 0.07 ? s.label : ""}
          </span>
        ))}
      </div>
      {tl.tH === null && <div className="tiny muted" style={{ marginTop: 4 }}>Stages after the modelled storm window are an illustrative sequence. Their order is reasoned; their timing is not forecast.</div>}
    </section>
  );
}
