import type {Lap} from "../models/race";
import {driverIdentityKey} from "../models/driver-identity";
const fields = ['lapTime','s1','s2','s3'] as const;
export function lapImprovements(laps:Lap[]){
  const best=new Map<string,number>();
  const result=new Map<string,Set<string>>();
  for(const lap of [...laps].sort((a,b)=>a.lapNumber-b.lapNumber)){
    const improved=new Set<string>();
    for(const field of fields){
      const value=lap[field];
      if(value===null||!Number.isFinite(value)||value<=0)continue;
      const key=JSON.stringify([lap.event,lap.session,driverIdentityKey(lap.driver),field]);
      const previous=best.get(key);
      if(previous!==undefined&&value<previous)improved.add(field);
      if(previous===undefined||value<previous)best.set(key,value);
    }
    result.set(lap.id,improved);
  }
  return result;
}
