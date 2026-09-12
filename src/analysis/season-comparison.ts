import { mean, std, driverMetrics, type DriverMetric } from "./driver_metrics";
import type { Lap } from "../models/race";
type ComparisonDriver = Pick<DriverMetric,"driver"|"car"|"className"|"category"|"best"|"avgBest"|"stdAll"|"total"|"used">;

export type SeasonLapCounts = Record<string,10|20>;
export const summaryLapCount = (event: string, counts:SeasonLapCounts={}): 10 | 20 =>
  counts[event] ?? (/\bspa\b|SPAF/i.test(event) ? 10 : 20);

// Keep traffic/consistency diagnostics intact, but share absolute pace values
// with the multi-event and season comparison tables.
export function summaryDriverMetrics(laps:Lap[], counts:SeasonLapCounts={}) {
  return driverMetrics(laps,20).map(m=>{
    const rows=laps.filter(l=>l.driver===m.driver&&l.carNumber===m.car&&l.className===m.className&&m.key===`${l.event}|${l.driver}|${l.carNumber}`);
    const pace=absoluteSummaryDrivers(rows,counts)[0];
    const times=rows.filter(l=>l.valid&&l.lapTime!==null&&Number.isFinite(l.lapTime)&&l.lapTime>0).map(l=>l.lapTime!).sort((a,b)=>a-b);
    return {...m,best:pace?.best??NaN,avgBest:pace?.avgBest??NaN,used:pace?.used??0,
      absoluteAvg10:times.length>=10?mean(times.slice(0,10)):NaN};
  });
}

export function absoluteSummaryDrivers(laps: Lap[], counts:SeasonLapCounts={}): ComparisonDriver[] {
  const validTime=(l:Lap)=>l.valid && l.lapTime!==null && Number.isFinite(l.lapTime) && l.lapTime>0;
  const cohort=(l:Lap)=>`${l.event}|${l.session}|${l.className}`;
  const fastest=new Map<string,number>();
  for(const l of laps)if(validTime(l))fastest.set(cohort(l),Math.min(fastest.get(cohort(l))??Infinity,l.lapTime!));
  const groups=new Map<string,Lap[]>();
  for(const l of laps){const key=`${cohort(l)}|${l.carNumber}|${l.driver}`;const rows=groups.get(key)||[];rows.push(l);groups.set(key,rows);}
  return [...groups.values()].map(rows=>{
    const first=rows[0],validRows=rows.filter(validTime);
    const count=summaryLapCount(first.event,counts);
    const times=validRows.map(l=>l.lapTime!).sort((a,b)=>a-b);
    // STD uses a common event/session/car-class reference, not each driver's best.
    // Absolute pace metrics and total lap counts remain unfiltered.
    const limit=(fastest.get(cohort(first))??NaN)*1.05;
    const spreadTimes=validRows.filter(l=>l.green && !l.pitIn && !l.pitOut && l.lapTime!<=limit).map(l=>l.lapTime!);
    return {driver:first.driver,car:first.carNumber,className:first.className,category:first.category,
      total:times.length,used:times.length>=count?count:0,best:times[0]??NaN,
      avgBest:times.length>=count?mean(times.slice(0,count)):NaN,stdAll:std(spreadTimes)};
  });
}

export function seasonComparison(selected: ComparisonDriver | undefined, peers: ComparisonDriver[], count: 10 | 20 = 20) {
  const average=(rows:ComparisonDriver[],key:"best"|"avgBest"|"stdAll")=>mean(rows.map(m=>m[key]).filter(Number.isFinite));
  const definitions = [
    {label:"Best Race Lap", key:"best" as const, kind:"fastest"},
    {label:"AVG Fastest Lap", key:"best" as const, kind:"average"},
    {label:`AVG ${count} laps`, key:"avgBest" as const, kind:"average"},
    {label:`AVG ${count} laps TOP 10`, key:"avgBest" as const, kind:"top10"},
    {label:"ST deviation", key:"stdAll" as const, kind:"average"},
  ];
  return definitions.map(row=>{
    const value=selected?.[row.key] ?? NaN;
    const benchmark=(category:string)=>{
      let group=peers.filter(m=>m.category===category && Number.isFinite(m[row.key]));
      if(row.kind==="top10")group=[...group].sort((a,b)=>a.avgBest-b.avgBest).slice(0,10);
      const reference=row.kind==="fastest" ? (group.length?Math.min(...group.map(m=>m.best)):NaN) : average(group,row.key);
      return {value:reference,delta:value-reference,count:group.length};
    };
    return {label:row.label,spread:row.key==="stdAll",value,gold:benchmark("Gold"),silver:benchmark("Silver")};
  });
}
