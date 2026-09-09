import type { Lap } from "../models/race";
import { buildStints, fitLaps } from "./stints";
import { median } from "./driver_metrics";

export type Stint = ReturnType<typeof buildStints>[number];
export type RelativePoint = { lap: Lap; reference: number | null; rivals: number; delta: number | null; smooth: number | null;
  baseline: number; normalised: number | null; normalisedSmooth: number | null };
const cohort = (l: Lap) => `${l.event}|${l.session}|${/^lmp2/i.test(l.className) ? "LMP2" : l.className}`;

/** Timing timestamps may be rounded to tenths; never bridge an actual break. */
export function consecutiveObservedLaps(previous: Lap, next: Lap) {
  return previous.event === next.event && previous.session === next.session &&
    previous.carNumber === next.carNumber && previous.driver === next.driver &&
    next.lapNumber === previous.lapNumber + 1 &&
    previous.elapsed !== null && next.elapsed !== null && next.lapTime !== null &&
    Number.isFinite(previous.elapsed) && Number.isFinite(next.elapsed) && Number.isFinite(next.lapTime) &&
    next.elapsed > previous.elapsed && Math.abs(next.elapsed-next.lapTime-previous.elapsed) <= 1;
}

export function relativePace(stints: Stint[], cutoffPercent?: number) {
  const all = stints.flatMap(s => s.clean).filter(l => l.lapTime !== null && Number.isFinite(l.lapTime) && l.elapsed !== null && Number.isFinite(l.elapsed));
  const fastest = new Map<string, number>();
  for (const l of all) fastest.set(cohort(l), Math.min(fastest.get(cohort(l)) ?? Infinity, l.lapTime!));
  const eligible = all.filter(l => cutoffPercent === undefined || l.lapTime! <= fastest.get(cohort(l))! * cutoffPercent/100);
  const byClass = new Map<string, Lap[]>();
  for (const l of eligible) { const rows=byClass.get(cohort(l)) || []; rows.push(l); byClass.set(cohort(l),rows); }
  const observations = new Map<Lap, RelativePoint>();
  for (const rows of byClass.values()) {
    const driverTimes = new Map<string, number[]>();
    for (const l of rows) { const times=driverTimes.get(l.driver)||[]; times.push(l.lapTime!); driverTimes.set(l.driver,times); }
    // Fixed common event/class pace anchor; equal weight for each driver.
    const baseline = median([...driverTimes.values()].map(median));
    rows.sort((a,b)=>a.elapsed!-b.elapsed!);
    let lo=0, hi=0;
    for (const l of rows) {
      // Centred offline 5-minute window, truncated naturally at race boundaries.
      while (lo<rows.length && rows[lo].elapsed!<l.elapsed!-150) lo++;
      while (hi<rows.length && rows[hi].elapsed!<=l.elapsed!+150) hi++;
      const peers=new Map<string,number[]>();
      for(let i=lo;i<hi;i++) {
        const peer=rows[i];
        if(peer.driver===l.driver) continue;
        const times=peers.get(peer.driver)||[]; times.push(peer.lapTime!); peers.set(peer.driver,times);
      }
      const reference=peers.size>=3 ? median([...peers.values()].map(median)) : null;
      observations.set(l,{lap:l,reference,rivals:peers.size,delta:reference===null?null:l.lapTime!-reference,smooth:null,
        baseline,normalised:reference===null?null:l.lapTime!-reference+baseline,normalisedSmooth:null});
    }
  }
  return stints.map(s=>{
    const points=s.clean.flatMap(l=>observations.has(l)?[observations.get(l)!]:[]).sort((a,b)=>a.lap.lapNumber-b.lap.lapNumber);
    points.forEach((p,i)=>{
      const window=points.slice(i-2,i+1);
      if(i>=2 && window.every((x,j)=>x.delta!==null && (j===0 || consecutiveObservedLaps(window[j-1].lap,x.lap)))) {
        p.smooth=window.reduce((sum,x)=>sum+x.delta!,0)/3;
        p.normalisedSmooth=p.smooth+p.baseline;
      }
    });
    const matched=points.filter(p=>p.delta!==null);
    return {stint:s, points, rawFit:fitLaps(points.map(p=>p.lap)),
      timeFit:fitLaps(matched.map(p=>({...p.lap,lapNumber:p.lap.elapsed!/60,lapTime:p.normalised}))),
      relativeFit:fitLaps(matched.map(p=>({...p.lap,lapTime:p.delta}))),
      matchedRawFit:fitLaps(matched.map(p=>p.lap))};
  });
}
