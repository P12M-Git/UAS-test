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

test("traffic Top 10 / Top 20 select each driver's fastest clean laps without falling back to ten", () => {
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => lap("A", 100 + i / 10, { lapNumber: i + 2 })),
    ...Array.from({ length: 25 }, (_, i) => lap("B", 110 + i / 10, { lapNumber: i + 2 })),
    lap("A", 101, { clean: false, lapNumber: 99 }),
  ];
  const top10 = trafficSample(rows, "LMP2", 10);
  const top20 = trafficSample(rows, "LMP2", 20);
  const clean = trafficSample(rows, "LMP2", "all");
  assert.equal(top10.sample.length, 20);
  assert.equal(top20.sample.filter(l => l.driver === "A").length, 15);
  assert.equal(top20.sample.filter(l => l.driver === "B").length, 20);
  assert.equal(clean.sample.length, 40);
  assert.ok(clean.sample.every(l => l.clean));
  assert.equal(top10.yMin, clean.yMin);
  assert.equal(top10.yMax, clean.yMax);
});
