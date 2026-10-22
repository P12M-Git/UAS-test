import { CONFIG } from "../config";
import type { Lap, SectorGap } from "../models/race";

const EPSILON = 1e-6;
const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: number | null | undefined): value is number => finite(value) && value > 0;
interface Timing {
  lap: Lap;
  points: (number | null)[];
  complete: boolean;
  onTrack: boolean;
}
interface Crossing { time: number; lap: number; actual: boolean; onTrack: boolean }
interface Segment { start: number; end: number }
interface Car {
  number: string;
  crossings: Crossing[][];
  segments: Segment[][];
  coverage: Timing[];
  incompleteClock: boolean;
}

function timing(lap: Lap): Timing {
  const onTrack = !lap.pitIn && !lap.pitOut;
  if (!finite(lap.elapsed) || lap.elapsedReliable === false) return { lap, points: [null, null, null, null], complete: false, onTrack };
  const end = lap.elapsed;
  const start = positive(lap.lapTime) ? end - lap.lapTime : null;
  let s1 = finite(start) && positive(lap.s1) ? start + lap.s1 : positive(lap.s2) && positive(lap.s3) ? end - lap.s2 - lap.s3 : null;
  let s2 = positive(lap.s3) ? end - lap.s3 : finite(start) && positive(lap.s1) && positive(lap.s2) ? start + lap.s1 + lap.s2 : null;
  // Contradictory clocks must not produce fictitious sector encounters.
  if ((finite(s1) && (s1 >= end || finite(start) && s1 <= start)) ||
      (finite(s2) && (s2 >= end || finite(start) && s2 <= start)) ||
      (finite(s1) && finite(s2) && s2 <= s1) ||
      (positive(lap.s1) && positive(lap.s2) && positive(lap.s3) && positive(lap.lapTime) && Math.abs(lap.s1 + lap.s2 + lap.s3 - lap.lapTime) > 0.05)) {
    s1 = null;
    s2 = null;
  }
  const points = [start, s1, s2, end];
  return { lap, points, complete: points.every(finite), onTrack };
}

function firstAfter<T>(rows: T[], time: number, clock: (row: T) => number): number {
  let low = 0, high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (clock(rows[middle]) <= time + EPSILON) low = middle + 1;
    else high = middle;
  }
  return low;
}

function indexCar(number: string, timings: Timing[]): Car {
  const unique = new Map<number, Timing>();
  for (const row of timings) {
    const previous = unique.get(row.lap.lapNumber);
    if (!previous || row.complete && !previous.complete) unique.set(row.lap.lapNumber, row);
  }
  const rows = [...unique.values()].sort((a,b)=>a.lap.lapNumber - b.lap.lapNumber);
  const points = [new Map<number, Crossing>(), new Map<number, Crossing>(), new Map<number, Crossing>()];
  const segments: Segment[][] = [[], [], []];
  for (const row of rows) {
    row.points.forEach((time, sector) => {
      if (!finite(time)) return;
      const checkpoint = sector === 3 ? 0 : sector;
      const lap = row.lap.lapNumber - (sector === 0 ? 1 : 0);
      const point = { time, lap, actual: sector !== 0, onTrack: row.onTrack };
      const previous = points[checkpoint].get(lap);
      if (!previous || point.actual) points[checkpoint].set(lap, point);
    });
    if (row.onTrack) for (let sector = 1; sector <= 3; sector++) {
      const start = row.points[sector - 1], end = row.points[sector];
      if (finite(start) && finite(end) && end > start) segments[sector % 3].push({ start, end });
    }
  }
  return {
    number,
    crossings: points.map(values => [...values.values()].filter(point => point.onTrack).sort((a,b)=>a.time - b.time)),
    segments: segments.map(values => values.sort((a,b)=>a.end - b.end)),
    coverage: rows.filter(row => finite(row.points[0]) && finite(row.points[3])).sort((a,b)=>a.points[3]! - b.points[3]!),
    incompleteClock: rows.some(row => !finite(row.points[0]) || !finite(row.points[3])),
  };
}

function coverageKnown(car: Car, time: number): boolean {
  // Find the lap containing this instant, independent of the focal car's lap number.
  let index = firstAfter(car.coverage, time - EPSILON * 2, row => row.points[3]!);
  const row = car.coverage[index];
  if (row && row.points[0]! <= time + EPSILON) return !row.onTrack || row.complete;
  if (car.incompleteClock || !car.coverage.length) return false;
  if (index === 0) return car.coverage[0].lap.lapNumber === 1;
  if (index === car.coverage.length) return true; // Retired/finished cars no longer have an active lap.
  return false; // A missing lap between two reported laps.
}

function passingBetween(car: Car, checkpoint: number, start: number, end: number): boolean {
  const segments = car.segments[checkpoint];
  let index = firstAfter(segments, start - EPSILON * 2, segment => segment.end);
  for (; index < segments.length && segments[index].start <= end + EPSILON; index++) {
    const segment = segments[index];
    const before = segment.start - start, after = segment.end - end;
    if (before < -EPSILON && after > EPSILON || before > EPSILON && after < -EPSILON) return true;
  }
  return false;
}

/** Reconstruct common-clock sector encounters, including cars on different race laps. */
export function reconstructSectorTraffic(laps: Lap[]): void {
  const sessions = new Map<string, Lap[]>();
  for (const lap of laps) {
    const key = JSON.stringify([lap.event, lap.session]);
    const group = sessions.get(key) || [];
    group.push(lap);
    sessions.set(key, group);
  }
  for (const session of sessions.values()) {
    const timings = new Map<Lap, Timing>();
    const byCar = new Map<string, Timing[]>();
    for (const lap of session) {
      const row = timing(lap);
      timings.set(lap, row);
      const car = byCar.get(lap.carNumber) || [];
      car.push(row);
      byCar.set(lap.carNumber, car);
    }
    const cars = [...byCar].map(([number, rows]) => indexCar(number, rows));
    for (const lap of session) {
      lap.cleanAir = null;
      lap.trafficCount = 0;
      lap.trafficCars = [];
      lap.sectorPasses = [];
      lap.sectorGaps = [];
      if (!lap.clean) { lap.cleanAirReason = "not-clean"; continue; }
      const row = timings.get(lap)!;
      const nearby = new Set<string>();
      const passes = new Set<string>();
      const gaps: SectorGap[] = row.points.map((time, sector) => {
        const result: SectorGap = { sector, elapsed: time, gapAhead: null, carAhead: null, carAheadLap: null, lapDifference: null, complete: finite(time) };
        if (!finite(time)) return result;
        const checkpoint = sector === 3 ? 0 : sector;
        for (const car of cars) {
          if (car.number === lap.carNumber) continue;
          if (!coverageKnown(car, time)) result.complete = false;
          const crossings = car.crossings[checkpoint];
          const crossing = crossings[firstAfter(crossings, time, value => value.time) - 1];
          if (!crossing) continue;
          const gap = Math.max(0, time - crossing.time);
          if (result.gapAhead === null || gap < result.gapAhead) {
            result.gapAhead = gap;
            result.carAhead = car.number;
            result.carAheadLap = crossing.lap;
            result.lapDifference = lap.lapNumber - (sector === 0 ? 1 : 0) - crossing.lap;
          }
          if (gap + EPSILON < CONFIG.CLEAN_AIR_THRESHOLD_SECONDS) nearby.add(car.number);
        }
        return result;
      });
      for (let sector = 1; sector <= 3; sector++) {
        const start = row.points[sector - 1], end = row.points[sector];
        if (!finite(start) || !finite(end)) continue;
        for (const car of cars) {
          if (car.number !== lap.carNumber && passingBetween(car, sector % 3, start, end)) {
            nearby.add(car.number);
            passes.add(car.number);
          }
        }
      }
      lap.sectorGaps = gaps;
      lap.trafficCars = [...nearby].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      lap.sectorPasses = [...passes].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      lap.trafficCount = nearby.size;
      if (nearby.size) {
        lap.cleanAir = false;
        lap.cleanAirReason = passes.size ? "sector-pass" : "sector-gap";
      } else if (row.complete && gaps.every(gap => gap.complete)) {
        lap.cleanAir = true;
        lap.cleanAirReason = "clear";
      } else lap.cleanAirReason = "missing-sector-timing";
    }
  }
}
