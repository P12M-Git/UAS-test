import test from "node:test";
import assert from "node:assert/strict";
import reference from "./fixtures/workbook-grading-reference.json";
import {workbookGrading,type GradingMode,type GradingDriver} from "../src/analysis/workbook-grading";
const unchanged=["focus","average","deltaAverage","top10","deltaTop10","deltaFastest","driverCount"];
for(const block of reference)test(`Unchanged workbook formulas: ${block.sheet} ${block.event}`,()=>{
 const metrics=workbookGrading(block.rows.map(row=>({...row,total:row.total??0})),block.focus,block.mode as GradingMode);
 for(const key of unchanged){
  const value=block.expected[key as keyof typeof block.expected];const actual=metrics.find(m=>m.key===key)!.value;
  if(value===null)assert.ok(!Number.isFinite(actual),`${key}: ${actual}`);
  else assert.ok(Math.abs(actual-value)<1e-8,`${key}: got ${actual}, Excel ${value}`);
 }
});
const row=(driver:string,car:string,category:string,value:number,team:string):GradingDriver=>({driver,car,category,value,team,total:30,className:"LMP2"});
const value=(rows:GradingDriver[],mode:GradingMode,key:string)=>workbookGrading(rows,rows[0].driver,mode).find(m=>m.key===key)!.value;
test("all three modes include the full field and Silver drivers beyond former row limits",()=>{
 const rows=Array.from({length:60},(_,i)=>row(`Driver ${i}`,String(i),i>=49?"Silver":"Gold",100+i,"Team"));
 for(const mode of ["Qualifying","Race","Race 20"] as const){
  assert.equal(value(rows,mode,"driverCount"),60);assert.equal(value(rows,mode,"silverCount"),11);
  assert.equal(value(rows,mode,"silverAvg"),154);assert.equal(value(rows,mode,"silverTop10"),153.5);
 }
});
test("category conditions are evaluated per driver and teams span multiple cars",()=>{
 const rows=[row("Focus","1","Bronze",100,"Racing A"),row("Silver A","2","Silver",102,"Racing B"),row("Gold","3","Gold",104," racing  a "),row("Platinum","4","Platinum",106,"Racing B"),row("Silver B","5","Silver",108,"Racing C")];
 assert.ok(Math.abs(value(rows,"Qualifying","std")-Math.sqrt(18))<1e-10);
 assert.equal(value(rows,"Qualifying","corrected"),103);
 for(const mode of ["Race","Race 20"] as const){assert.ok(Math.abs(value(rows,mode,"std")-Math.sqrt(2))<1e-10);assert.equal(value(rows,mode,"corrected"),104);}
 assert.equal(value(rows,"Race","teamCount"),2);assert.equal(value(rows,"Race","teamAverage"),102);
 assert.equal(value(rows,"Race","deltaTeamAverage"),-2);assert.equal(value(rows,"Race","teamBest"),100);
 assert.ok(Number.isNaN(value(rows,"Race","silverTop10")));
 const unknown=rows.map(r=>({...r,team:"Unknown team"}));assert.ok(Number.isNaN(value(unknown,"Race","teamCount")));
});
