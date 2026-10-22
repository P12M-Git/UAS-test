import { CONFIG, type TopMode } from "../config";
import type { Lap } from "../models/race";
import { buildStints } from "./stints";
import { carClassKey } from "../models/car-class";
import { driverIdentityKey } from "../models/driver-identity";
export const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
export const std = (v: number[]) => {
  const m = mean(v);
  return v.length ? Math.sqrt(mean(v.map((x) => (x - m) ** 2))) : NaN;
};
export const median = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mad = (v: number[]) => {
  const m = median(v);
  return median(v.map((x) => Math.abs(x - m)));
};
export const selectionCount = (n: number, m: TopMode, fallback = true) =>
  m === "all"
    ? n
    : !fallback
      ? Math.min(m, n)
    : m === 10
      ? Math.min(10, n)
      : n >= 20
        ? 20
        : n >= 10
          ? 10
          : n;
export interface DriverMetric {
  key: string;
  driver: string;
  category: string;
  car: string;
  team: string;
  className: string;
  proAm: boolean;
  total: number;
  green: number;
  clean: number;
  used: number;
  lowSample: boolean;
  best: number;
  avgBest: number;
  avgAll: number;
  stdBest: number;
  stdAll: number;
  madBest: number;
  madAll: number;
  cleanAir: number;
  cleanAirKnown: number;
  cleanAirPct: number;
  traffic: number;
  overtakes: number;
  zBest: number;
  zAll: number;
  times: number[];
  bestTimes: number[];
  lapTimeDeg: number;
  timeline: { start: number; end: number; neutralized: boolean }[];
}
export function performanceZ(l: Lap, all: Lap[]) {
  if (l.lapTime === null || !Number.isFinite(l.lapTime)) return NaN;
  const vehicleClass = carClassKey(l.className), driver = driverIdentityKey(l.driver);
  const identities = new Map<string, string>();
  const identity = (name: string) => {
    let key = identities.get(name);
    if (key === undefined) { key = driverIdentityKey(name); identities.set(name, key); }
    return key;
  };
  const r = all
      .filter(
        (x) =>
          x.event === l.event &&
          x.session === l.session &&
          carClassKey(x.className) === vehicleClass &&
          identity(x.driver) !== driver &&
          x.clean &&
          x.lapTime !== null && Number.isFinite(x.lapTime),
      )
      .map((x) => x.lapTime!),
    s = std(r);
  return !r.length || !s ? NaN : (mean(r) - l.lapTime!) / s;
}
export function driverMetrics(laps: Lap[], mode: TopMode, fallback = true): DriverMetric[] {
  const stints = buildStints(laps);
  const g = new Map<string, Lap[]>();
  laps.forEach((l) => {
    const k = `${l.event}|${l.driver}|${l.carNumber}`;
    g.set(k, [...(g.get(k) || []), l]);
  });
  // Reference distribution is identical for every lap of a driver/cohort.
  // Compute it once instead of scanning the complete race for every lap.
  const identities = new Map<string, string>();
  const identity = (name: string) => {
    let value = identities.get(name);
    if (value === undefined) { value = driverIdentityKey(name); identities.set(name, value); }
    return value;
  };
  const cohortKey = (lap: Lap) => JSON.stringify([lap.event, lap.session, carClassKey(lap.className)]);
  const cohorts = new Map<string, { driver: string; time: number }[]>();
  for (const lap of laps) {
    if (!lap.clean || lap.lapTime === null || !Number.isFinite(lap.lapTime)) continue;
    const key = cohortKey(lap), rows = cohorts.get(key) || [];
    rows.push({ driver: identity(lap.driver), time: lap.lapTime });
    cohorts.set(key, rows);
  }
  const zReferences = new Map<string, { mean: number; std: number }>();
  const zFor = (l: Lap) => {
    const cohort = cohortKey(l), driver = identity(l.driver);
    const key = JSON.stringify([cohort, driver]);
    let reference = zReferences.get(key);
    if (!reference) {
      const times = (cohorts.get(cohort) || []).filter(row => row.driver !== driver).map(row => row.time);
      reference = { mean: mean(times), std: std(times) };
      zReferences.set(key, reference);
    }
    return reference.std ? (reference.mean - l.lapTime!) / reference.std : NaN;
  };
  return [...g].map(([key, r]) => {
    const clean = r.filter((l) => l.clean && l.lapTime !== null),
      times = clean.map((l) => l.lapTime!).sort((a, b) => a - b),
      n = selectionCount(times.length, mode, fallback),
      bestTimes = times.slice(0, n),
      ordered = [...clean].sort((a, b) => a.lapTime! - b.lapTime!),
      zs = clean.map(zFor),
      bestZ = ordered.slice(0, n).map(zFor);
    return {
      key,
      driver: r[0].driver,
      category: r[0].category,
      car: r[0].carNumber,
      team: r[0].team,
      className: r[0].className,
      proAm: r[0].proAm,
      total: r.length,
      green: r.filter((l) => l.green).length,
      clean: clean.length,
      used: n,
      lowSample: times.length < CONFIG.MINIMUM_SAMPLE_WARNING,
      best: times[0] ?? NaN,
      avgBest: mean(bestTimes),
      avgAll: mean(times),
      stdBest: std(bestTimes),
      stdAll: std(times),
      madBest: mad(bestTimes),
      madAll: mad(times),
      cleanAir: clean.filter((l) => l.cleanAir).length,
      cleanAirKnown: clean.filter(l => l.cleanAir !== null).length,
      cleanAirPct: clean.some(l=>l.cleanAir!==null)
        ? (100 * clean.filter((l) => l.cleanAir === true).length) / clean.filter(l=>l.cleanAir!==null).length
        : NaN,
      traffic: clean.filter((l) => l.cleanAir === false).length,
      overtakes: r.reduce((a, l) => a + l.overtakes.length, 0),
      zBest: mean(bestZ),
      zAll: mean(zs),
      times,
      bestTimes,
      lapTimeDeg: mean(
        stints
          .filter(
            (s) =>
              s.driver === r[0].driver &&
              s.car === r[0].carNumber &&
              s.laps[0].event === r[0].event,
          )
          .map((s) => s.fit.slope)
          .filter(Number.isFinite),
      ),
      timeline: r
        .filter((l) => l.elapsed !== null && l.lapTime !== null)
        .map((l) => ({
          start: Math.max(0, l.elapsed! - l.lapTime!),
          end: l.elapsed!,
          neutralized: !l.green,
        })),
    };
  });
}
