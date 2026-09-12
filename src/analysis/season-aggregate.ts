import type { Lap } from "../models/race";
import { absoluteSummaryDrivers, summaryLapCount, type SeasonLapCounts } from "./season-comparison";
import { mean } from "./driver_metrics";

export const seasonReferences = ["Top 10 Gold", "Top 10 Silver", "Gold", "Silver"] as const;
export type SeasonExclusions = string[] | Record<string,string[]>;
export const exclusionsForEvent=(excluded:SeasonExclusions,event:string)=>Array.isArray(excluded)?excluded:excluded[event]||[];
export function aggregateSeason(laps: Lap[], events: string[], excluded: SeasonExclusions, className: string, counts:SeasonLapCounts={}) {
  return events.map(event=>{
    const drivers=absoluteSummaryDrivers(laps.filter(l=>l.event===event),counts)
      .filter(m=>!exclusionsForEvent(excluded,event).includes(m.driver) && m.className===className && Number.isFinite(m.avgBest));
    const first=drivers.length?Math.min(...drivers.map(m=>m.avgBest)):NaN;
    const references=seasonReferences.map(label=>{
      let rows=drivers.filter(m=>m.category===(label.includes("Gold")?"Gold":"Silver")).sort((a,b)=>a.avgBest-b.avgBest);
      if(label.startsWith("Top"))rows=rows.slice(0,10);
      return {label,value:mean(rows.map(m=>m.avgBest)),count:rows.length};
    });
    return {event,count:summaryLapCount(event,counts),drivers,first,references};
  });
}
export function seasonDelta(value:number, reference:number) {
  return {seconds:value-reference,percent:reference>0?(value/reference-1)*100:NaN};
}
export type SeasonReference = "race" | "category" | "gold" | "silver";
export function comparisonReference(drivers:ReturnType<typeof absoluteSummaryDrivers>, category:string, metric:"best"|"avgBest", reference:SeasonReference) {
  const group=drivers.filter(m=>Number.isFinite(m[metric]) && (reference==="race" || m.category===(reference==="category"?category:reference==="gold"?"Gold":"Silver")));
  return reference==="gold"||reference==="silver"?mean(group.map(m=>m[metric])):group.length?Math.min(...group.map(m=>m[metric])):NaN;
}
