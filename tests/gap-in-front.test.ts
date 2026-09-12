import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { gapInFront } from "../src/analysis/gap-in-front";
const lap=(car:string,n:number,t:number,extra:Partial<Lap>={})=>({id:`${car}-${n}`,event:"Race 2026",session:"Race",className:"LMP2",carNumber:car,driver:car,lapNumber:n,elapsed:t,lapTime:100,valid:true,green:true,pitIn:false,pitOut:false,...extra}) as Lap;
test("absolute gap uses same-class same-lap timestamps without requiring a following crossing",()=>{
 const a=lap("A",2,200),b=lap("B",2,198,{className:"LMP2 Pro-Am"}),bn=lap("B",3,298,{className:"LMP2 Pro-Am"});
 const rows=[a,b,bn,lap("GT",2,199,{className:"GT3"}),lap("GT",3,300,{className:"GT3"})];
 const p=gapInFront(rows,[a])[0];assert.equal(p.gap,2);assert.equal(p.ahead,"B");
 assert.equal(gapInFront([a,b,{...bn,elapsed:199}],[a])[0].gap,2);
 assert.equal(gapInFront([a,b],[a])[0].gap,2);
});
test("absolute gap retains pits, flags, first laps and invalid lap-time rows with valid elapsed",()=>{
 const a=lap("A",2,200),b=lap("B",2,198),bn=lap("B",3,298);
 assert.equal(gapInFront([a,{...b,pitIn:true},bn,lap("C",2,190),lap("C",3,290)],[a])[0].gap,2);
 assert.equal(gapInFront([a,{...b,green:false},bn],[a])[0].gap,2);
 const start=lap("A",1,100,{valid:false,lapTime:null,pitOut:true,green:false});
 assert.equal(gapInFront([start,lap("B",1,95)],[start])[0].gap,5);
 assert.equal(gapInFront([a,b],[{...a,elapsed:null}])[0].gap,null);
 assert.equal(gapInFront([a,{...b,event:"Other"},{...bn,event:"Other"}],[a])[0].gap,null);
});
