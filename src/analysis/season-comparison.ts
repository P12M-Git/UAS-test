import { mean, std, type DriverMetric } from "./driver_metrics";
import type { Lap } from "../models/race";
type ComparisonDriver = Pick<DriverMetric,"driver"|"car"|"className"|"category"|"best"|"avgBest"|"stdAll"|"total"|"used">;

export function absoluteSummaryDrivers(laps: Lap[]): ComparisonDriver[] {
  const groups=new Map<string,Lap[]>();
  for(const l of laps){const key=`${l.event}|${l.session}|${l.carNumber}|${l.driver}`;const rows=groups.get(key)||[];rows.push(l);groups.set(key,rows);}
  return [...groups.values()].map(rows=>{
    const first=rows[0],validRows=rows.filter(l=>l.valid && l.lapTime!==null && Number.isFinite(l.lapTime) && l.lapTime>0);
    const times=validRows.map(l=>l.lapTime!).sort((a,b)=>a-b);
    // Only STD excludes pit and non-green laps; absolute pace metrics stay unfiltered.
    const spreadTimes=validRows.filter(l=>l.green && !l.pitIn && !l.pitOut).map(l=>l.lapTime!);
    return {driver:first.driver,car:first.carNumber,className:first.className,category:first.category,
      total:times.length,used:times.length>=20?20:0,best:times[0]??NaN,
      avgBest:times.length>=20?mean(times.slice(0,20)):NaN,stdAll:std(spreadTimes)};
  });
}

export function seasonComparison(selected: ComparisonDriver | undefined, peers: ComparisonDriver[]) {
  const average=(rows:ComparisonDriver[],key:"best"|"avgBest"|"stdAll")=>mean(rows.map(m=>m[key]).filter(Number.isFinite));
  const definitions = [
    {label:"Best Race Lap", key:"best" as const, kind:"fastest"},
    {label:"AVG Fastest Lap", key:"best" as const, kind:"average"},
    {label:"AVG 20 laps", key:"avgBest" as const, kind:"average"},
    {label:"AVG 20 laps TOP 10", key:"avgBest" as const, kind:"top10"},
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
