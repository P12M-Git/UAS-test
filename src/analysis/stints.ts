import type { Lap } from "../models/race";

export const average = (a: number[]) =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
export function fitLaps(laps: Lap[]) {
  const mx = average(laps.map((l) => l.lapNumber)),
    my = average(laps.map((l) => l.lapTime!));
  const xx = laps.reduce((s, l) => s + (l.lapNumber - mx) ** 2, 0);
  const slope =
    laps.length >= 2 && xx > 0
      ? laps.reduce((s, l) => s + (l.lapNumber - mx) * (l.lapTime! - my), 0) /
        xx
      : NaN;
  return { slope, intercept: my - slope * mx, n: laps.length };
}
export function overlaps(a: Lap[], b: Lap[]) {
  const intervals = (laps: Lap[]) => laps.flatMap(l => {
    if (l.elapsed === null || l.lapTime === null || !Number.isFinite(l.elapsed) ||
        !Number.isFinite(l.lapTime) || l.lapTime <= 0) return [];
    // Outlap duration includes stationary pit time. Without pit duration we
    // cannot reliably infer the exit timestamp, so omit that interval.
    if (l.pitOut && (l.pitDuration == null || !Number.isFinite(l.pitDuration))) return [];
    const start = Math.max(0, l.elapsed - l.lapTime + (l.pitOut ? Math.max(0, l.pitDuration!) : 0));
    return start < l.elapsed ? [{ start, end: l.elapsed, event: `${l.event}|${l.session || "Race"}`, car: l.carNumber, driver: l.driver }] : [];
  }).sort((x, y) => x.event.localeCompare(y.event) || x.start - y.start);
  const left = intervals(a), right = intervals(b);
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const x = left[i], y = right[j], eventOrder = x.event.localeCompare(y.event);
    if (eventOrder < 0) { i++; continue; }
    if (eventOrder > 0) { j++; continue; }
    if (!(x.car === y.car && x.driver !== y.driver) &&
        Math.max(x.start, y.start) < Math.min(x.end, y.end)) return true;
    if (x.end <= y.end) i++; else j++;
  }
  return false;
}
export function buildStints(laps: Lap[]) {
  const cars = new Map<string, Lap[]>();
  laps.forEach((l) => {
    const k = `${l.event}|${l.carNumber}`;
    const a = cars.get(k) || [];
    a.push(l);
    cars.set(k, a);
  });
  const groups: {
    id: string;
    laps: Lap[];
    ordinal: number;
    tyreStint: number | null;
  }[] = [];
  for (const [car, rows] of cars) {
    rows.sort((a, b) => a.lapNumber - b.lapNumber);
    let current: (typeof groups)[number] | undefined,
      ordinal = 0;
    const tyreCounts = new Map<string, number>();
    rows.forEach((l, i) => {
      const prev = rows[i - 1];
      const stop =
        !prev ||
        (l.stintId ? l.stintId !== prev.stintId : l.pitOut || prev.pitIn);
      const tyreChange = !!prev && l.tyreSet !== prev.tyreSet;
      if (!current || l.driver !== prev?.driver || stop || tyreChange) {
        ordinal++;
        const tyreStint = l.tyreSet
          ? (tyreCounts.get(l.tyreSet) || 0) + (stop || tyreChange ? 1 : 0)
          : null;
        if (l.tyreSet) tyreCounts.set(l.tyreSet, tyreStint!);
        current = { id: `${car}|${ordinal}`, laps: [], ordinal, tyreStint };
        groups.push(current);
      }
      current.laps.push(l);
    });
  }
  return groups.map((s) => {
    const base = s.laps.filter(
      (l) =>
        l.valid &&
        l.lapTime !== null &&
        !l.pitIn &&
        !l.pitOut &&
        (l.sourceRaceState
          ? ["GF", "GREEN", "SF"].includes(l.sourceRaceState) &&
            !(l.sourceRaceState === "SF" && l.lapNumber > 1)
          : l.green),
    );
    const limit = average(base.map((l) => l.lapTime!)) * 1.2;
    const clean = base.filter((l) => l.lapTime! <= limit);
    const first = s.laps[0];
    return {
      ...s,
      clean,
      fit: fitLaps(clean),
      driver: first.driver,
      car: first.carNumber,
      category: first.category,
      className: first.className,
      tyreSet: first.tyreSet,
      tyreAge: first.tyreAge,
      start: Math.min(
        ...s.laps.map((l) =>
          l.elapsed !== null && l.lapTime !== null
            ? l.elapsed - l.lapTime
            : Infinity,
        ),
      ),
      end: Math.max(...s.laps.map((l) => l.elapsed ?? -Infinity)),
    };
  });
}

export function raceTimeBounds(
  stints: ReturnType<typeof buildStints>,
  className: string,
): [number, number] {
  const times = stints
    .filter((s) => className === "All" || s.className === className)
    .flatMap((s) => s.clean.map((l) => l.lapTime!))
    .filter(Number.isFinite);
  if (!times.length) return [0, 1];
  const low = Math.floor(Math.min(...times)),
    high = Math.ceil(Math.max(...times));
  return [low, Math.max(low + 1, high)];
}
