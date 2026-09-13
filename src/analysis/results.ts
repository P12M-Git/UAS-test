import type { Lap } from "../models/race";
import { driverIdentityKey } from "../models/driver-identity";

// Timing-derived classification; never use last-lap position, which omits retired cars.
export function raceResults(laps:Lap[]){
  const rounds=new Map<string,Lap[]>();
  for(const lap of laps){
    const key=JSON.stringify([lap.event,lap.session]);
    const rows=rounds.get(key)||[];rows.push(lap);rounds.set(key,rows);
  }
  return [...rounds].map(([key,rows])=>{
    const cars=new Map<string,{last:Lap;drivers:Map<string,Lap>}>();
    for(const lap of rows){
      const car=cars.get(lap.carNumber)||{last:lap,drivers:new Map<string,Lap>()};
      car.drivers.set(driverIdentityKey(lap.driver),lap);
      if(lap.lapNumber>car.last.lapNumber || lap.lapNumber===car.last.lapNumber && (lap.elapsed??-1)>(car.last.elapsed??-1))car.last=lap;
      cars.set(lap.carNumber,car);
    }
    const sorted=[...cars.values()].sort((a,b)=>b.last.lapNumber-a.last.lapNumber||(a.last.elapsed??Infinity)-(b.last.elapsed??Infinity)||a.last.carNumber.localeCompare(b.last.carNumber));
    const classCounts=new Map<string,number>();
    const drivers=sorted.flatMap((car,index)=>{
      const classPosition=(classCounts.get(car.last.className)||0)+1;
      classCounts.set(car.last.className,classPosition);
      return [...car.drivers].map(([identity,lap])=>({identity,driver:lap.driver,category:lap.category,car:lap.carNumber,team:lap.team,className:lap.className,position:index+1,classPosition,laps:car.last.lapNumber,elapsed:car.last.elapsed}));
    });
    return {key,event:rows[0].event,session:rows[0].session,drivers};
  });
}
