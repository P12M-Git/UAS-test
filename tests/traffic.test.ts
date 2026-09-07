import test from "node:test";
import assert from "node:assert/strict";
import { trafficSample } from "../src/analysis/traffic";
import type { Lap } from "../src/models/race";
const lap = (driver: string, time: number, extra: Partial<Lap> = {}) => ({
  driver, carNumber: driver, event: "R", session: "Race", className: "LMP2",
  lapTime: time, green: true, clean: true, valid: true, lapNumber: 2, ...extra,
}) as Lap;
test("traffic uses each driver's own 105 percent cutoff, with common class bounds", () => {
  const rows = [lap("A", 100), lap("A", 105), lap("A", 105.01),
    lap("B", 110), lap("B", 115), lap("B", 115.51),
    lap("C", 140, { className: "GT3" }), lap("D", 130, {clean:false})];
  const result = trafficSample(rows, "LMP2");
  assert.deepEqual(result.sample.map(l => l.lapTime), [100,105,110,115]);
  assert.equal(result.yMin, 100);
  assert.equal(result.yMax, 116);
  assert.equal(trafficSample(rows, "GT3").yMin, 140);
  assert.deepEqual(trafficSample([], "LMP2"), {sample:[], yMin:0, yMax:1});
});
