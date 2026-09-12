import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { aggregateSeason, seasonDelta, comparisonReference } from "../src/analysis/season-aggregate";
const sample=(event:string,driver:string,category:string,t:number,n=20)=>Array.from({length:n},(_,i)=>({event,session:"Race",driver,category,className:"LMP2",carNumber:driver,lapNumber:i+1,lapTime:t,valid:true,green:true,pitIn:false,pitOut:false}) as Lap);
test("season aggregate uses exact samples, category means and manual exclusions",()=>{
 const laps=[...sample("Barcelona","A","Gold",100),...sample("Barcelona","B","Gold",102),...sample("Barcelona","C","Silver",104),...sample("Barcelona","short","Gold",90,19),...sample("Spa","A","Gold",120,10)];
 const rounds=aggregateSeason(laps,["Barcelona","Spa"],[],"LMP2");
 assert.equal(rounds[0].first,100);assert.equal(rounds[0].references[2].value,101);
 assert.equal(rounds[1].count,10);assert.equal(rounds[1].drivers[0].avgBest,120);
 const excluded=aggregateSeason(laps,["Barcelona"],["A"],"LMP2")[0];
 assert.equal(excluded.first,102);assert.equal(excluded.references[2].value,102);
 assert.equal(aggregateSeason(laps,[],[],"LMP2").length,0);
 const d=seasonDelta(102,100);assert.equal(d.seconds,2);assert.ok(Math.abs(d.percent-2)<1e-9);
 assert.ok(Number.isNaN(seasonDelta(NaN,100).seconds));
});
test("comparison references follow metric and own category; missing references stay unavailable",()=>{
 const rows=aggregateSeason([...sample("R","A","Gold",100),...sample("R","B","Gold",104),...sample("R","C","Silver",106)],["R"],[],"LMP2")[0].drivers;
 assert.equal(comparisonReference(rows,"Silver","avgBest","race"),100);
 assert.equal(comparisonReference(rows,"Silver","avgBest","category"),106);
 assert.equal(comparisonReference(rows,"Silver","avgBest","gold"),102);
 assert.equal(comparisonReference(rows,"Gold","best","silver"),106);
 assert.ok(Number.isNaN(comparisonReference(rows,"Bronze","best","category")));
 assert.equal(comparisonReference(rows.filter(m=>m.driver!=="A"),"Silver","best","gold"),104);
});
test("focus exclusions refill top ten and recalculate category gaps across events",()=>{
 const laps=["Barcelona","Spa"].flatMap(event=>[
   ...Array.from({length:11},(_,i)=>sample(event,`G${i}`,"Gold",100+i)).flat(),
   ...sample(event,"Focus","Silver",106),...sample(event,"Other","Silver",110),
 ]);
 const before=aggregateSeason(laps,["Barcelona","Spa"],[],"LMP2");
 const after=aggregateSeason(laps,["Barcelona","Spa"],["G0","Other"],"LMP2");
 for(let i=0;i<2;i++){
   assert.equal(before[i].references[0].value,104.5);
   assert.equal(after[i].references[0].value,105.5);
   assert.equal(after[i].references[0].count,10);
   assert.equal(after[i].references[2].value,105.5);
   assert.equal(after[i].references[3].value,106);
   assert.equal(after[i].references[3].count,1);
   assert.equal(seasonDelta(106,before[i].references[0].value).seconds,1.5);
   assert.equal(seasonDelta(106,after[i].references[0].value).seconds,0.5);
 }
 const none=aggregateSeason(laps,["Barcelona"],["Focus","Other"],"LMP2")[0];
 assert.ok(Number.isNaN(none.references[3].value));
 assert.equal(none.references[3].count,0);
});
test("excluding a driver in Spa leaves Barcelona references unchanged",()=>{
 const laps=["Barcelona","Spa"].flatMap(event=>[...sample(event,"A","Gold",100),...sample(event,"B","Gold",110),...sample(event,"Focus","Silver",105)]);
 const rounds=aggregateSeason(laps,["Barcelona","Spa"],{Spa:["A"]},"LMP2");
 assert.equal(rounds[0].references[2].value,105);
 assert.equal(rounds[0].references[2].count,2);
 assert.equal(rounds[1].references[2].value,110);
 assert.equal(rounds[1].references[2].count,1);
 assert.equal(rounds[0].drivers.some(m=>m.driver==="A"),true);
 assert.equal(rounds[1].drivers.some(m=>m.driver==="A"),false);
});
test("changing one round to ten laps does not change another round",()=>{
 const laps=["Barcelona","Spa"].flatMap(event=>sample(event,"A","Gold",100).map((l,i)=>({...l,lapTime:100+i})));
 const rounds=aggregateSeason(laps,["Barcelona","Spa"],{},"LMP2",{Barcelona:10,Spa:20});
 assert.equal(rounds[0].drivers[0].avgBest,104.5);
 assert.equal(rounds[1].drivers[0].avgBest,109.5);
 assert.equal(rounds[0].count,10);assert.equal(rounds[1].count,20);
});
