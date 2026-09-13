import test from "node:test";
import assert from "node:assert/strict";
import {raceResults} from "../src/analysis/results";
import type {Lap} from "../src/models/race";
const lap=(car:string,driver:string,lapNumber:number,elapsed:number,className="LMP2",event="Race 2026")=>({carNumber:car,driver,lapNumber,elapsed,className,event,session:"Race",clean:false,pitIn:true} as Lap);
test("results use whole-car distance and time and give co-drivers identical positions",()=>{
 const result=raceResults([lap("1","A",1,100),lap("1","B",10,1000),lap("2","C",9,800),lap("3","D",10,990),lap("4","E",11,1100,"GT3")])[0];
 const a=result.drivers.find(d=>d.driver==="A")!,b=result.drivers.find(d=>d.driver==="B")!;
 assert.equal(a.position,3);assert.equal(a.classPosition,2);assert.equal(a.laps,10);
 assert.equal(b.position,a.position);assert.equal(b.classPosition,a.classPosition);
 assert.equal(result.drivers.find(d=>d.driver==="C")!.position,4);
});
test("results isolate events and sessions, and group explicit driver aliases",()=>{
 const result=raceResults([lap("1","Ben Hanley",1,100),lap("1","Benjamin Hanley",2,200),lap("1","Other",1,110,"LMP2","Other race"),{...lap("1","Ben Hanley",1,90),session:"Qualifying"}]);
 assert.equal(result.length,3);assert.equal(result[0].drivers.length,1);assert.equal(result[0].drivers[0].laps,2);
 assert.deepEqual(raceResults([]),[]);
});
