import test from "node:test";
import assert from "node:assert/strict";
import {gradingComparison,lapHeatColour} from "../src/analysis/grading-comparison";
import type {GradingDriver} from "../src/analysis/workbook-grading";
const row=(driver:string,car:string,category:string,value:number,team="Team A",className="LMP2"):GradingDriver=>({driver,car,category,value,team,className,total:20});
const rows=[row("Focus","1","Bronze",100),row("Silver","2","Silver",110),row("Gold","3","Gold",120),row("Platinum","4","Platinum",140,"Team B"),row("No sample","5","Silver",NaN," team-a "),row("Other class","6","Gold",50,"Team A","GT3")];
test("Overall and category columns have independent cohorts and correction intervals",()=>{
 const result=gradingComparison(rows,"Focus");const get=(key:string)=>result.columns.find(c=>c.key===key)!.values;
 assert.equal(get("overall").average,117.5);assert.equal(get("silver").average,110);assert.equal(get("goldPlatinum").average,130);assert.equal(get("bronze").average,100);
 assert.equal(get("overall").corrected,115);assert.equal(get("goldPlatinum").corrected,130);assert.ok(Number.isNaN(get("bronze").std));
 assert.equal(get("overall").deltaAverage,-17.5);assert.equal(get("silver").deltaAverage,-10);assert.equal(get("goldPlatinum").deltaAverage,-30);
});
test("team spans actual cars in the same class, reports missing samples and retains context if focus is excluded",()=>{
 const result=gradingComparison(rows,"Focus");const team=result.columns[0].values;
 assert.deepEqual(result.team.cars,["1","2","3","5"]);assert.equal(team.teamCount,4);assert.equal(result.team.timed,3);assert.equal(team.teamAverage,110);
 assert.equal(result.columns.find(c=>c.key==="silver")!.values.teamCount,2);
 const filtered=gradingComparison(rows.slice(1),"Focus",rows);assert.equal(filtered.team.name,"Team A");assert.equal(filtered.columns[0].values.teamAverage,115);assert.ok(Number.isNaN(filtered.columns[0].values.deltaTeamAverage));
 const unknown=gradingComparison(rows.map(r=>({...r,team:"Unknown team"})),"Focus");assert.equal(unknown.team.members.length,0);assert.ok(Number.isNaN(unknown.columns[0].values.teamCount));
});
test("lap counts use Excel red-yellow-green endpoints and a stable equal-sample colour",()=>{
 assert.equal(lapHeatColour(10,[10,20,30]),"rgb(248,105,107)");assert.equal(lapHeatColour(20,[10,20,30]),"rgb(255,235,132)");assert.equal(lapHeatColour(30,[10,20,30]),"rgb(99,190,123)");assert.equal(lapHeatColour(20,[20,20]),"rgb(255,235,132)");assert.equal(lapHeatColour(NaN,[20]),"transparent");
});
