import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { buildStints } from "../src/analysis/stints";
import { relativePace, consecutiveObservedLaps } from "../src/analysis/relative-pace";
const lap=(driver:string,n:number,t:number,elapsed:number,extra:Partial<Lap>={})=>({
  id:`${driver}-${n}`,event:"R",session:"Race",className:"LMP2",driver,carNumber:driver,
  category:"Gold",lapNumber:n,lapTime:t,elapsed,valid:true,green:true,pitIn:false,pitOut:false,...extra,
}) as Lap;
test("reference is leave-one-driver-out median of driver medians, not pooled laps",()=>{
  const stints=buildStints([lap("A",2,80,500),lap("B",2,90,490),lap("B",3,90,510),lap("B",4,90,520),
    lap("C",2,100,500),lap("D",2,110,500,{className:"LMP2 Pro-Am"}),
    lap("GT",2,400,500,{className:"GT3"}),lap("far",2,500,1000)]);
  const a=relativePace(stints).find(r=>r.stint.driver==="A")!.points[0];
  assert.equal(a.rivals,3);assert.equal(a.reference,100);assert.equal(a.delta,-20);
});
test("less than three rivals is unavailable, not zero; events cannot mix",()=>{
  const s=buildStints([lap("A",2,90,500),lap("B",2,91,500),lap("C",2,92,500),lap("D",2,93,500,{event:"Other"})]);
  const a=relativePace(s).find(r=>r.stint.driver==="A")!;
  assert.equal(a.points[0].delta,null);assert.equal(a.relativeFit.n,0);assert.ok(Number.isNaN(a.relativeFit.slope));
});
test("relative fit removes common trend and smoothing requires three consecutive matched laps",()=>{
  const laps:Lap[]=[];
  for(const driver of ["A","B","C","D"])for(let n=1;n<=4;n++)laps.push(lap(driver,n,90+n+(driver==="A"?-1:0),n*400));
  const a=relativePace(buildStints(laps)).find(r=>r.stint.driver==="A")!;
  assert.equal(a.matchedRawFit.slope,1);assert.equal(a.relativeFit.slope,0);
  assert.equal(a.points[0].baseline,92.5);
  assert.deepEqual(a.points.map(p=>p.normalised),[91.5,91.5,91.5,91.5]);
  assert.equal(a.timeFit.slope,0);
  assert.equal(a.timeFit.intercept,91.5);
  assert.deepEqual(a.points.map(p=>p.delta),[-1,-1,-1,-1]);
  // These timestamps have 300-second gaps: do not join them despite sequential lap numbers.
  assert.deepEqual(a.points.map(p=>p.smooth),[null,null,null,null]);
  const gapped=relativePace(buildStints(laps.filter(l=>l.driver!=="A"||l.lapNumber!==2))).find(r=>r.stint.driver==="A")!;
  assert.ok(gapped.points.every(p=>p.smooth===null));
});
test("plot continuity rejects missing laps and elapsed gaps, allowing timing rounding",()=>{
  const first=lap("A",1,90,90), next=lap("A",2,91,181);
  assert.equal(consecutiveObservedLaps(first,next),true);
  assert.equal(consecutiveObservedLaps(first,{...next,elapsed:181.1}),true);
  assert.equal(consecutiveObservedLaps(first,{...next,lapNumber:3}),false);
  assert.equal(consecutiveObservedLaps(first,{...next,elapsed:400}),false);
  assert.equal(consecutiveObservedLaps(first,{...next,driver:"B"}),false);
});
