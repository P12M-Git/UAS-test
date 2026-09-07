import type { DriverMetric } from "./driver_metrics";
import { mean, median } from "./driver_metrics";
export function categoryMetrics(ms: DriverMetric[]) {
  const g = new Map<string, DriverMetric[]>();
  ms.forEach((m) => g.set(m.category, [...(g.get(m.category) || []), m]));
  return [...g].map(([category, r]) => ({
    category,
    drivers: r.length,
    cleanLaps: r.reduce((a, x) => a + x.clean, 0),
    avgBest: mean(r.map((x) => x.avgBest).filter(Number.isFinite)),
    avgAll: mean(r.map((x) => x.avgAll).filter(Number.isFinite)),
    fastest: Math.min(...r.map((x) => x.best).filter(Number.isFinite)),
    stdBest: mean(r.map((x) => x.stdBest).filter(Number.isFinite)),
    stdAll: mean(r.map((x) => x.stdAll).filter(Number.isFinite)),
    madBest: mean(r.map((x) => x.madBest).filter(Number.isFinite)),
    madAll: mean(r.map((x) => x.madAll).filter(Number.isFinite)),
    avgZ: mean(r.map((x) => x.zAll).filter(Number.isFinite)),
    medianZ: median(r.map((x) => x.zAll).filter(Number.isFinite)),
  }));
}
