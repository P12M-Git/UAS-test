import { csvRecords, timeToSeconds } from "../parser/uraice_adapter";
export interface QualifyingLap {
  car:string; driver:string; team:string; className:string; lap:number;
  time:number|null; s1:number|null; s2:number|null; s3:number|null;
  elapsed:number|null; valid:boolean; flag:string;
}
export function parseQualifying(csv:string): QualifyingLap[] {
  const [header=[],...rows]=csvRecords(csv.replace(/^\uFEFF/,""),";");
  const index=new Map(header.map((name,i)=>[name.trim().toUpperCase(),i]));
  const get=(row:string[],key:string)=>row[index.get(key)??-1]?.trim()||"";
  return rows.filter(row=>get(row,"NUMBER") && Number(get(row,"LAP_NUMBER"))>0).map(row=>{
    const sector=(n:number)=>timeToSeconds(get(row,`S${n}_SECONDS`))??timeToSeconds(get(row,`S${n}`));
    const time=timeToSeconds(get(row,"LAP_TIME"));
    const flag=get(row,"FLAG_AT_FL");
    const pit=/^(B|1|true|yes)$/i.test(get(row,"CROSSING_FINISH_LINE_IN_PIT")) || (timeToSeconds(get(row,"PIT_TIME"))??0)>0;
    const deleted=/^(1|true|yes)$/i.test(get(row,"LAP_TIME_DELETED")||get(row,"DELETED"));
    return {car:get(row,"NUMBER"),driver:get(row,"DRIVER_NAME")||"Unknown driver",team:get(row,"TEAM"),className:get(row,"CLASS"),
      lap:Number(get(row,"LAP_NUMBER")),time,s1:sector(1),s2:sector(2),s3:sector(3),elapsed:timeToSeconds(get(row,"ELAPSED")),flag,
      valid:time!==null && time>0 && !pit && !deleted && !/^(RF|YF|FCY|SF|SC)$/i.test(flag)};
  });
}
const minimum=(values:(number|null)[])=>{
  const known=values.filter((n):n is number=>n!==null && n>0);
  return known.length?Math.min(...known):null;
};
export function qualifyingResults(laps:QualifyingLap[]) {
  const groups=new Map<string,QualifyingLap[]>();
  for(const lap of laps){const key=JSON.stringify([lap.car,lap.driver,lap.className]);const group=groups.get(key)||[];group.push(lap);groups.set(key,group);}
  return [...groups.values()].map(rows=>{
    const timed=rows.filter(l=>l.valid);
    const best=minimum(timed.map(l=>l.time));
    const bestLap=timed.find(l=>l.time===best);
    const s1=minimum(timed.map(l=>l.s1)),s2=minimum(timed.map(l=>l.s2)),s3=minimum(timed.map(l=>l.s3));
    const theoretical=s1!==null && s2!==null && s3!==null?s1+s2+s3:null;
    return {...rows[0],best,bestLap,bestS1:s1,bestS2:s2,bestS3:s3,theoretical,
      potential:best!==null && theoretical!==null?best-theoretical:null,validLaps:timed.length,laps:rows.length};
  }).sort((a,b)=>(a.best??Infinity)-(b.best??Infinity)||a.car.localeCompare(b.car,undefined,{numeric:true}));
}
