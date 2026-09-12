import type { Lap } from "../models/race";
const cls=(s:string)=>/^lmp2/i.test(s)?"LMP2":s;
export function gapInFront(all:Lap[],selected:Lap[]){
  const groups=new Map<string,Map<string,Lap[]>>();
  const key=(l:Lap)=>`${l.event}|${l.session}|${cls(l.className)}`;
  for(const l of all){if(l.elapsed===null||!Number.isFinite(l.elapsed))continue;
    const group=groups.get(key(l))||new Map<string,Lap[]>();const car=group.get(l.carNumber)||[];
    car.push(l);group.set(l.carNumber,car);groups.set(key(l),group);
  }
  for(const group of groups.values())for(const rows of group.values())rows.sort((a,b)=>a.lapNumber-b.lapNumber);
  return [...selected].sort((a,b)=>(a.elapsed??0)-(b.elapsed??0)).map(l=>{
    let ahead:Lap|undefined;
    // Nearest prior completion of the same race lap, never a different-lap crossing.
    for(const [car,rows] of groups.get(key(l))||[]){if(car===l.carNumber)continue;
      const i=rows.findIndex(r=>r.lapNumber===l.lapNumber);
      if(i<0||l.elapsed===null||rows[i].elapsed!>=l.elapsed)continue;
      if(!ahead||rows[i].elapsed!>ahead.elapsed!)ahead=rows[i];
    }
    let reason="";
    if(l.elapsed===null||!Number.isFinite(l.elapsed))reason="Missing elapsed timing";
    else if(!ahead)reason="No same-class car ahead on this race lap";
    return {lap:l,ahead:ahead?.carNumber??null,gap:reason?null:l.elapsed!-ahead!.elapsed!,reason};
  });
}
