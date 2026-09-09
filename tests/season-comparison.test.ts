import test from "node:test";
import assert from "node:assert/strict";
import { seasonComparison } from "../src/analysis/season-comparison";
import type { DriverMetric } from "../src/analysis/driver_metrics";
const m=(category:string,best:number,avgBest:number,stdBest=0.5)=>({category,best,avgBest,stdBest}) as DriverMetric;
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
