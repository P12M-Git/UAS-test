import type { Lap } from "../models/race";

const driverKey = (l: Lap) => `${l.event}|${l.session}|${l.className}|${l.carNumber}|${l.driver}`;

export function trafficSample(allLaps: Lap[], className: string) {
  const rows = allLaps.filter(l => l.className === className);
  const best = new Map<string, number>();
  for (const l of rows) {
    if (l.clean && l.valid && l.lapTime !== null && Number.isFinite(l.lapTime) && l.lapTime > 0) {
      best.set(driverKey(l), Math.min(best.get(driverKey(l)) ?? Infinity, l.lapTime));
    }
  }
  const sample = rows.filter(l => l.green && l.valid && l.lapNumber > 1 &&
    l.lapTime !== null && Number.isFinite(l.lapTime) &&
    best.has(driverKey(l)) && l.lapTime <= best.get(driverKey(l))! * 1.05);
  // Bounds depend on the whole class, never on the selected driver/category.
  const values = [...best.values()];
  const low = values.length ? Math.floor(Math.min(...values, ...sample.map(l => l.lapTime!))) : 0;
  const high = values.length ? Math.ceil(Math.max(...values) * 1.05) : 1;
  return { sample, yMin: low, yMax: Math.max(low + 1, high) };
}
