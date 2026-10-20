"use client";
import { useState } from "react";
import { compareRacesByRound, type AlkamelRace } from "../src/alkamel";
import { eventLabel } from "../src/models/event-identity";

export type WorkspaceRace = AlkamelRace & { status: string; error?: string };

export default function WorkspaceRaces({ races, selected, active, onSelect, onActivate }: {
  races: WorkspaceRace[];
  selected: string[];
  active: string;
  onSelect: (ids: string[]) => void;
  onActivate: (id: string) => void;
}) {
  const [series, setSeries] = useState("ELMS");
  const [chosenYear, setYear] = useState("");
  const [search, setSearch] = useState("");
  const seasons = [...new Set(races.filter(race => race.championship === series).map(race => race.season))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const year = seasons.includes(chosenYear) ? chosenYear : seasons[0] || "";
  const visible = races.filter(race => race.championship === series && race.season === year && race.event.toLowerCase().includes(search.toLowerCase()))
    .sort(compareRacesByRound);
  const chosen = races.filter(race => selected.includes(race.id)).sort(compareRacesByRound);
  const available = (race: WorkspaceRace) => race.status === "loaded" || race.status === "cached";
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  return <section className="workspace-races" aria-label="Race selection">
    <details className="workspace-race-dropdown">
      <summary>Load races <span>{selected.length} selected</span></summary>
      <div className="workspace-race-controls">
        <label>Competition<select value={series} onChange={e => setSeries(e.target.value)}>{["ELMS", "WEC", "ALMS", "IMSA"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Season<select value={year} onChange={e => setYear(e.target.value)}>{seasons.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Race<input type="search" placeholder="Search circuit" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      <div className="workspace-race-actions">
        <button type="button" disabled={!visible.length} onClick={() => onSelect([...new Set([...selected, ...visible.map(race => race.id)])])}>Add shown races</button>
        <button type="button" disabled={!selected.length} onClick={() => onSelect([])}>Clear selection</button>
      </div>
      <div className="workspace-race-options">{visible.map(race => <label key={race.id}>
        <input type="checkbox" checked={selected.includes(race.id)} onChange={() => toggle(race.id)} />
        <span>{race.event}</span>
        {selected.includes(race.id) && <small>{available(race) ? "Ready" : race.status === "failed" ? "Failed" : "Loading"}</small>}
        {race.error && selected.includes(race.id) && <small className="race-error">{race.error}</small>}
      </label>)}{!visible.length && <p>{races.length ? "No races match these filters." : "Finding available races…"}</p>}</div>
    </details>
    {!!chosen.length && <div className="workspace-loaded-races" role="group" aria-label="Active race">
      {chosen.map(race => <div key={race.id} className="workspace-race-chip">
        <button type="button" aria-pressed={active === race.id} disabled={!available(race)} onClick={() => onActivate(race.id)}>
          {eventLabel(race.sourceFile)}{!available(race) && ` · ${race.status === "failed" ? "Failed" : "Loading…"}`}
        </button>
        <button type="button" aria-label={`Remove ${eventLabel(race.sourceFile)}`} onClick={() => toggle(race.id)}>×</button>
      </div>)}
    </div>}
  </section>;
}
