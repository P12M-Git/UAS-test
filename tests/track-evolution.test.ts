import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { trackEvolution, visibleTimeBounds } from "../src/analysis/track-evolution";
import { buildStints } from "../src/analysis/stints";
const lap = (n:number, t:number, extra:Partial<Lap> = {}) => ({
  event:"R", session:"Race", className:"LMP2", driver:"A", carNumber:"22",
  category:"Gold", lapNumber:n, lapTime:t, elapsed:n*100, valid:true,green:true,
  pitIn:false,pitOut:false, ...extra,
}) as Lap;
test("MA3 pools all observations and combines LMP2 Pro-Am, but separates classes", () => {
  const result=trackEvolution([lap(1,90),lap(2,93),lap(3,96),
    lap(3,99,{className:"LMP2 Pro-Am",carNumber:"9"}),
    lap(1,120,{className:"GT3"}),lap(2,123,{className:"GT3"}),lap(3,126,{className:"GT3"})]);
  assert.equal(result.length,2);
  assert.equal(result[0].points[0].time,94.5);
  assert.equal(result[0].points[0].count,4);
  assert.equal(result[1].points[0].time,123);
});
test("MA3 uses the stint-cleaned sample and does not bridge missing lap bins", () => {
  const stints=buildStints([lap(1,90),lap(2,91),lap(3,92),lap(4,200,{green:false}),lap(5,93),lap(6,94),lap(7,95),lap(8,180),lap(9,120,{pitIn:true})]);
  const result=trackEvolution(stints.flatMap(s=>s.clean));
  assert.deepEqual(result[0].points.map(p=>p.lap),[3,7]);
  assert.deepEqual(visibleTimeBounds([91.2,94.8]),[91,95]);
  assert.deepEqual(visibleTimeBounds([]),[0,1]);
  assert.deepEqual(visibleTimeBounds([NaN,92]),[92,93]);
});
