import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { driverMetrics, performanceZ } from "../src/analysis/driver_metrics";

const lap=(driver:string,time:number,category:Lap["category"],className="LMP2",extra:Partial<Lap>={})=>({id:driver,event:"R",session:"Race",sourceFile:"R",carNumber:driver,driver,category,className,
  lapNumber:2,lapTime:time,elapsed:time*2,s1:time/3,s2:time/3,s3:time/3,valid:true,green:true,clean:true,pitIn:false,pitOut:false,cleanAir:null,trafficCount:0,overtakes:[],...extra}) as Lap;

test("Class Z pools FIA ratings within the vehicle class and excludes self, other classes and sessions",()=>{
  const focal=lap("Scott Huffaker",89,"Silver");
  const rows=[focal,lap("B",90,"Gold","LMP2 Pro-Am"),lap("C",92,"Bronze"),lap("Scott Huffaker II",10,"Gold"),lap("GT",40,"Platinum","LMGT3"),lap("P3",50,"Gold","LMP3"),lap("Practice",5,"Gold","LMP2",{session:"Practice"})];
  assert.equal(performanceZ(focal,rows),2); // Peer mean 91, population STD 1, focal 89.
  assert.equal(driverMetrics(rows,20,false).find(metric=>metric.driver==="Scott Huffaker")?.zAll,2);
  assert.equal(performanceZ(focal,rows.map(row=>({...row,category:"Platinum"}))),2);
});

test("GT3 vehicle labels share a reference while unrelated classes stay separate",()=>{
  const focal=lap("A",89,"Bronze","LMGT3");
  const rows=[focal,lap("B",90,"Gold","GT3"),lap("C",92,"Silver","GTDPRO"),lap("P2",20,"Gold","LMP2")];
  assert.equal(performanceZ(focal,rows),2);
});
