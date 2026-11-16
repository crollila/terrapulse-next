import { useStore, type HazardType } from "../state/store";

/** One list of hazard views for every simulator panel, so the options cannot drift apart. */
export const HAZARD_OPTIONS: { value: HazardType; label: string }[] = [
  { value: "hurricane", label: "Hurricane · wind-exposure model v0.1" },
  { value: "rainfall", label: "Hurricane rainfall · Harvey 2017, observed record" },
  { value: "wildfire", label: "Wildfire · observed record, three U.S. fires" },
  { value: "drought", label: "Drought · regional index v0.1" },
];

export function HazardSelect({ id }: { id: string }) {
  const hazard = useStore((s) => s.hazard);
  const setHazard = useStore((s) => s.setHazard);
  return (
    <div className="field">
      <label htmlFor={id}>Disaster type</label>
      <select id={id} value={hazard} onChange={(e) => setHazard(e.target.value as HazardType)} data-testid="hazard-type">
        {HAZARD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option disabled>Wildfire spread simulation · not offered (no validated model)</option>
        <option disabled>Earthquake, flood depth, other · not built yet</option>
      </select>
    </div>
  );
}
