import { useMemo } from "react";
import type { AlkamelRace } from "../src/alkamel";
import { datasetScope } from "../src/analysis/dataset-scope";

export default function WorkspaceOverview({ races, driverCsv }: { races: AlkamelRace[]; driverCsv: string }) {
  const totals = useMemo(() => datasetScope(races, driverCsv), [races, driverCsv]);
  const scope = [
    ["Races", totals.races],
    ["Years", totals.years],
    ["Driver categories", totals.categories],
    ["Drivers", totals.drivers],
  ] as const;
  return <section className="workspace-scope" aria-label="Dataset scope">
    <h2>Dataset scope</h2>
    <dl>{scope.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString()}</dd></div>)}</dl>
  </section>;
}
