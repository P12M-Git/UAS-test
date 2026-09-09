import { mean, type DriverMetric } from "./driver_metrics";

export function seasonComparison(selected: DriverMetric | undefined, peers: DriverMetric[]) {
  const average=(rows:DriverMetric[],key:"best"|"avgBest"|"stdBest")=>mean(rows.map(m=>m[key]).filter(Number.isFinite));
  const definitions = [
    {label:"Best Race Lap", key:"best" as const, kind:"fastest"},
    {label:"AVG Fastest Lap", key:"best" as const, kind:"average"},
    {label:"AVG 20 laps", key:"avgBest" as const, kind:"average"},
    {label:"AVG 20 laps TOP 10", key:"avgBest" as const, kind:"top10"},
    {label:"ST deviation", key:"stdBest" as const, kind:"average"},
  ];
  return definitions.map(row=>{
    const value=selected?.[row.key] ?? NaN;
    const benchmark=(category:string)=>{
      let group=peers.filter(m=>m.category===category && Number.isFinite(m[row.key]));
      if(row.kind==="top10")group=[...group].sort((a,b)=>a.avgBest-b.avgBest).slice(0,10);
      const reference=row.kind==="fastest" ? (group.length?Math.min(...group.map(m=>m.best)):NaN) : average(group,row.key);
      return {value:reference,delta:value-reference,count:group.length};
    };
    return {label:row.label,spread:row.key==="stdBest",value,gold:benchmark("Gold"),silver:benchmark("Silver")};
  });
}
