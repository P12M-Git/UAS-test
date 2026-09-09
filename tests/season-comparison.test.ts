import test from "node:test";
import assert from "node:assert/strict";
import { seasonComparison, absoluteSummaryDrivers, summaryLapCount } from "../src/analysis/season-comparison";
import type { Lap } from "../src/models/race";
import type { DriverMetric } from "../src/analysis/driver_metrics";
const m=(category:string,best:number,avgBest:number,stdAll=0.5)=>({category,best,avgBest,stdAll}) as DriverMetric;
test("Spa averages exactly ten laps for driver and category top ten",()=>{
  const laps=Array.from({length:20},(_,i)=>({event:"Spa-Francorchamps 2026",session:"Race",driver:"A",carNumber:"22",className:"LMP2",category:"Gold",lapTime:120+i,valid:true,green:true,pitIn:false,pitOut:false}) as Lap);
  const selected=absoluteSummaryDrivers(laps)[0];
  assert.equal(selected.used,10);
  assert.equal(selected.avgBest,124.5);
  const rows=seasonComparison(selected,[selected],summaryLapCount(laps[0].event));
  assert.equal(rows[2].label,"AVG 10 laps");
  assert.equal(rows[3].label,"AVG 10 laps TOP 10");
  assert.equal(rows[3].gold.value,124.5);
  assert.ok(Number.isNaN(absoluteSummaryDrivers(laps.slice(0,9))[0].avgBest));
  assert.equal(absoluteSummaryDrivers(laps.map(l=>({...l,event:"Barcelona"})))[0].avgBest,129.5);
  assert.equal(summaryLapCount("26ELMSR04_SPAF"),10);
});
test("season event table distinguishes fastest, mean best and top10 average",()=>{
  const selected=m("Silver",91,94,0.3);
  const peers=[m("Gold",90,92),m("Gold",94,96),m("Silver",92,95)];
  const rows=seasonComparison(selected,peers);
  assert.equal(rows[0].gold.value,90);assert.equal(rows[0].gold.delta,1);
  assert.equal(rows[1].gold.value,92);assert.equal(rows[1].gold.delta,-1);
  assert.equal(rows[2].gold.value,94);assert.equal(rows[2].gold.delta,0);
  assert.equal(rows[4].gold.delta,-0.2);
  const top=seasonComparison(selected,Array.from({length:11},(_,i)=>m("Gold",90,90+i)));
  assert.equal(top[3].gold.value,94.5);assert.equal(top[3].gold.count,10);
  assert.ok(Number.isNaN(top[0].silver.value));
  assert.ok(Number.isNaN(seasonComparison(undefined,peers)[0].gold.delta));
});
test("absolute pace ignores clean/flag/pit filters and requires 20 laps",()=>{
  const laps=Array.from({length:21},(_,i)=>({event:"R",session:"Race",driver:"A",carNumber:"22",className:"LMP2",category:"Gold",
    lapNumber:i+1,lapTime:i===20?300:90+i,valid:true,clean:false,green:false,pitIn:true}) as Lap);
  const result=absoluteSummaryDrivers(laps)[0];
  assert.equal(result.best,90);assert.equal(result.avgBest,99.5);assert.equal(result.total,21);
  assert.ok(Number.isNaN(result.stdAll));
  assert.ok(Number.isNaN(absoluteSummaryDrivers(laps.slice(0,19))[0].avgBest));
  assert.equal(absoluteSummaryDrivers([...laps,{...laps[0],lapTime:1,valid:false}])[0].best,90);
});
test("summary STD uses all green non-pit laps without a percentage or best-20 cut",()=>{
  const base={event:"R",session:"Race",driver:"A",carNumber:"22",className:"LMP2",category:"Gold",
    valid:true,clean:false,green:true,pitIn:false,pitOut:false} as Lap;
  const laps=[{...base,lapNumber:1,lapTime:90},{...base,lapNumber:2,lapTime:110},
    {...base,lapTime:300,pitIn:true},{...base,lapTime:310,pitOut:true},
    {...base,lapTime:320,green:false},{...base,lapTime:1,valid:false}];
  const result=absoluteSummaryDrivers(laps)[0];
  assert.equal(result.stdAll,10);
  assert.equal(result.total,5);
  assert.equal(result.best,90);
});
