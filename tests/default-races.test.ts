import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_RACES, mergeRaceDatasets } from "../src/default-races";
import { parseTimingCsv, applyDriverCategories } from "../src/parser/uraice_adapter";
import { driverMetrics, performanceZ, mean } from "../src/analysis/driver_metrics";

test("Barcelona hour-less elapsed times are unwrapped without changing the other races", () => {
  for (const name of DEFAULT_RACES) {
    const data = parseTimingCsv(readFileSync(`public/races/${name}`, "utf8"), name);
    assert.ok(Math.max(...data.laps.map(l=>l.elapsed!))>14000, name);
    const previous=new Map<string,number>();
    for(const l of data.laps) {
      if(previous.has(l.carNumber)) assert.ok(l.elapsed!>previous.get(l.carNumber)!, `${name} #${l.carNumber} lap ${l.lapNumber}`);
      previous.set(l.carNumber,l.elapsed!);
    }
    if(name.includes("BARC"))assert.equal(data.laps.find(l=>l.carNumber==="10"&&l.lapNumber===20)!.elapsed,3639.4);
    if(name.includes("SPAF"))assert.ok(Math.abs(data.laps.find(l=>l.carNumber==="10"&&l.lapNumber===1)!.elapsed!-145.717)<1e-9);
  }
});

test("four bundled races load with valid timing data and imports preserve defaults", () => {
  const sets = DEFAULT_RACES.map(name => parseTimingCsv(readFileSync(`public/races/${name}`, "utf8"), name));
  sets.forEach(s => assert.ok(s.laps.length > 1000));
  assert.equal(new Set(sets.flatMap(s => s.laps.map(l => l.event))).size, 4);
  const base = { laps: sets.flatMap(s => s.laps), diagnostics: sets.flatMap(s => s.diagnostics) };
  const merged = mergeRaceDatasets(base, sets[0]);
  assert.equal(merged.laps.length, base.laps.length);
  assert.equal(merged.diagnostics.length, 4);
  const updated = { ...sets[0].laps[0], tyreSet: "new" };
  const next = mergeRaceDatasets(base, { laps: [updated], diagnostics: [] });
  assert.equal(next.laps.length, base.laps.length);
  assert.equal(next.laps[0].tyreSet, "new");
});

test("cached Z computation preserves the previous reference definition", () => {
  const data = parseTimingCsv(readFileSync(`public/races/${DEFAULT_RACES[0]}`, "utf8"), DEFAULT_RACES[0]);
  const laps = applyDriverCategories(data.laps, readFileSync("public/driver_categories.tsv", "utf8"));
  const metric = driverMetrics(laps, 20).find(m => Number.isFinite(m.zAll))!;
  assert.ok(metric);
  const rows = laps.filter(l => l.driver === metric.driver && l.carNumber === metric.car && l.clean && l.lapTime !== null);
  assert.ok(Math.abs(mean(rows.map(l => performanceZ(l, laps))) - metric.zAll) < 1e-10);
});
