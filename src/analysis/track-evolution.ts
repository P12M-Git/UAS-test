import type { Lap } from "../models/race";
import { average } from "./stints";

export interface EvolutionPoint { lap: number; elapsed: number; time: number; count: number }
export interface EvolutionSeries { name: string; points: EvolutionPoint[] }

export function proDriverLaps(clean: Lap[]): Lap[] {
  return clean.filter(l => /^lmp2/i.test(l.className) && l.category !== "Bronze");
}

// Input is the already-filtered clean stint sample, not raw race timing.
// Pool all observations from race laps n-2, n-1, n; never mix classes/events.
export function trackEvolution(clean: Lap[]): EvolutionSeries[] {
  const groups = new Map<string, Map<number, Lap[]>>();
  for (const l of clean) {
    if (l.lapTime === null || !Number.isFinite(l.lapTime)) continue;
    const cls = /^lmp2/i.test(l.className) ? "LMP2" : l.className;
    const name = `${l.event} · ${cls}`;
    const laps = groups.get(name) || new Map<number, Lap[]>();
    const rows = laps.get(l.lapNumber) || [];
    rows.push(l); laps.set(l.lapNumber, rows); groups.set(name, laps);
  }
  return [...groups].map(([name, laps]) => ({ name,
    points: [...laps.keys()].sort((a,b) => a-b).flatMap(n => {
      // Require three consecutive race-lap bins; no bridging neutralised gaps.
      if (!laps.has(n-2) || !laps.has(n-1)) return [];
      const window = [n-2,n-1,n].flatMap(k => laps.get(k)!);
      return [{ lap:n, elapsed:average(laps.get(n)!.map(l=>l.elapsed ?? NaN).filter(Number.isFinite)),
        time:average(window.map(l=>l.lapTime!)), count:window.length }];
    }),
  }));
}

export function visibleTimeBounds(values: number[]): [number, number] {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return [0,1];
  const low = Math.floor(Math.min(...valid));
  return [low, Math.max(low+1, Math.ceil(Math.max(...valid)))];
}
