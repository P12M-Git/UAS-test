import type { Lap } from "../src/models/race";
import { driverIdentityKey } from "../src/models/driver-identity";

export default function WorkspaceOverview({ laps }: { laps: Lap[] }) {
  const scope = [
    ["Races", new Set(laps.map(lap => lap.event)).size],
    ["Years", new Set(laps.flatMap(lap => lap.event.match(/20\d{2}/)?.[0] || [])).size],
    ["Categories", new Set(laps.map(lap => lap.className)).size],
    ["Drivers", new Set(laps.map(lap => driverIdentityKey(lap.driver)).filter(Boolean)).size],
  ] as const;
  return <section className="workspace-scope" aria-label="Dataset scope">
    <h2>Dataset scope</h2>
    <dl>{scope.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString()}</dd></div>)}</dl>
  </section>;
}
