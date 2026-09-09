import test from "node:test";
import assert from "node:assert/strict";
import {
  fitLaps,
  buildStints,
  overlaps,
  sharedTrackFraction,
  raceTimeBounds,
} from "../src/analysis/stints";
import { parseTimingCsv } from "../src/parser/uraice_adapter";
import type { Lap } from "../src/models/race";
const lap = (n: number, t: number, extra: Partial<Lap> = {}) =>
  ({
    id: String(n),
    event: "R",
    carNumber: "22",
    driver: "A",
    className: "LMP2",
    category: "Silver",
    lapNumber: n,
    lapTime: t,
    elapsed: n * 100,
    valid: true,
    green: true,
    pitIn: false,
    pitOut: false,
    overtakes: [],
    ...extra,
  }) as Lap;
test("linear fit returns seconds per lap and insufficient sample is unavailable", () => {
  assert.ok(
    Math.abs(fitLaps([lap(2, 90), lap(3, 90.2), lap(4, 90.4)]).slope - 0.2) <
      1e-9,
  );
  assert.ok(Number.isNaN(fitLaps([lap(1, 90)]).slope));
});
test("stint fit excludes pits neutralisation and >120 percent outlier", () => {
  const s = buildStints([
    lap(1, 90),
    lap(2, 90.2),
    lap(3, 90.4),
    lap(4, 150),
    lap(5, 200, { green: false }),
    lap(6, 180, { pitIn: true }),
  ]);
  assert.deepEqual(
    s[0].clean.map((l) => l.lapNumber),
    [1, 2, 3],
  );
  assert.ok(Math.abs(s[0].fit.slope - 0.2) < 1e-9);
});
test("tyre set carries across a pit while stint usage increments", () => {
  const s = buildStints([
    lap(1, 90, { tyreSet: "1" }),
    lap(2, 90, { tyreSet: "1", pitIn: true }),
    lap(3, 120, { tyreSet: "1", pitOut: true }),
    lap(4, 90, { tyreSet: "1" }),
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[1].tyreStint, 2);
});
test("parallel comparison needs positive overlapping elapsed intervals in same event", () => {
  assert.equal(overlaps([lap(1, 90)], [lap(1, 80)]), true);
  assert.equal(overlaps([lap(1, 90)], [lap(2, 90)]), false);
  assert.equal(overlaps([lap(1, 90)], [lap(1, 90, { event: "other" })]), false);
});
test("parallel threshold uses reference time, unions duplicates and includes exactly 30 percent", () => {
  const focus=[lap(1,100,{elapsed:100}),lap(2,100,{elapsed:300})];
  const rival=[lap(1,60,{elapsed:60,carNumber:"9",driver:"B"})];
  assert.equal(sharedTrackFraction(focus,rival),0.3);
  assert.equal(sharedTrackFraction(rival,focus),1);
  assert.equal(sharedTrackFraction([...focus,...focus],[...rival,...rival]),0.3);
  assert.ok(sharedTrackFraction(focus,[{...rival[0],lapTime:59}])<0.3);
  assert.equal(sharedTrackFraction(focus,[{...rival[0],event:"different"}]),0);
  assert.equal(sharedTrackFraction(focus,[{...rival[0],carNumber:"22"}]),0);
  assert.equal(sharedTrackFraction([],rival),0);
});
test("parallel excludes stationary pit dwell, different sessions and same-car driver changes", () => {
  const focus = [lap(1, 90, { elapsed: 190 })];
  assert.equal(overlaps(focus, [lap(1, 200, { elapsed: 300, pitOut: true, pitDuration: 100, carNumber: "9" })]), false);
  assert.equal(overlaps([lap(1, 90, { elapsed: 290 })], [lap(1, 200, { elapsed: 300, pitOut: true, pitDuration: 100, carNumber: "9" })]), true);
  assert.equal(overlaps(focus, [lap(1, 90, { elapsed: 190, driver: "B" })]), false);
  assert.equal(overlaps(focus, [lap(1, 90, { elapsed: 190, session: "Qualifying" })]), false);
  assert.equal(overlaps(focus, [lap(1, NaN)]), false);
});
test("processed database preserves tyre and stint annotations", () => {
  const d = parseTimingCsv(
    "EVENT_CODE,CATEGORY,NUMBER,DRIVER_NAME,LAP_NUMBER,LAP_TIME,ELAPSED,STINT_ID,TYRE_SET_NUMBER,TYRE_SET_LAP_NUMBER,LAP_TYPE\n26ELMSR01_BARC,LMP2,22,A,1,90,90,2,1,23,GF",
    "processed.csv",
  );
  assert.equal(d.laps[0].tyreSet, "1");
  assert.equal(d.laps[0].stintId, "2");
  assert.equal(d.laps[0].tyreAge, 23);
});
test("axis uses integer-second limits from the entire class sample", () => {
  const stints=buildStints([lap(1,90.3),lap(2,91.7),lap(3,115,{className:'GT3',carNumber:'55'})]);
  assert.deepEqual(raceTimeBounds(stints,'LMP2'),[90,92]);
});
test("driver label changes do not advance tyre usage without a stop", () => {
  const stints=buildStints([lap(1,90,{tyreSet:'1',stintId:'1'}),lap(2,91,{tyreSet:'1',stintId:'1',driver:'B'}),lap(3,92,{tyreSet:'1',stintId:'2',driver:'B',pitOut:true})]);
  assert.deepEqual(stints.map(s=>s.tyreStint),[1,1,2]);
});
