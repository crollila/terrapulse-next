import type { RainRecord } from "../state/rainDerived";

/** Placeholder until the shared exposure-network builder is connected to the rainfall screen. */
export function ExposureNetwork({ rec }: { rec: RainRecord }) {
  void rec;
  return (
    <div className="section">
      <div className="callout warn">Insufficient validated data: the economic network is not yet connected to the rainfall screen in this build.</div>
    </div>
  );
}
