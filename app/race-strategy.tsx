"use client";
import { useState } from "react";
import type { Lap } from "../src/models/race";
import { buildStints, average, fitLaps } from "../src/analysis/stints";
import { CONFIG } from "../src/config";
type Stint = ReturnType<typeof buildStints>[number];
const fmt = (n: number) =>
  Number.isFinite(n)
    ? `${Math.floor(n / 60)}:${(n % 60).toFixed(3).padStart(6, "0")}`
    : "—";
const clock = (n: number) =>
  `${Math.floor(n / 3600)}:${Math.floor((n % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
const num = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) ? n.toFixed(1) : "—";
export default function RaceStrategy({
  allLaps,
  stints,
  driver,
  setDriver,
}: {
  allLaps: Lap[];
  stints: Stint[];
  driver: string;
  setDriver: (d: string) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [detail, setDetail] = useState<Stint | null>(null);
  const cars = [...new Set(stints.map((s) => s.car))];
  const full = buildStints(allLaps);
  const end = Math.max(14400, ...allLaps.map((l) => l.elapsed ?? 0));
  const ranked = [...new Set(allLaps.map((l) => l.carNumber))]
    .map((car) => {
      const rows = allLaps
        .filter((l) => l.carNumber === car)
        .sort((a, b) => b.lapNumber - a.lapNumber);
      return { car, last: rows[0] };
    })
    .sort(
      (a, b) =>
        b.last.lapNumber - a.last.lapNumber ||
        (a.last.elapsed ?? Infinity) - (b.last.elapsed ?? Infinity),
    );
  const state = Array.from({ length: Math.ceil(end / 60) }, (_, i) => {
    const states = allLaps
      .filter(
        (l) =>
          l.elapsed !== null &&
          l.lapTime !== null &&
          l.elapsed > i * 60 &&
          l.elapsed - l.lapTime < (i + 1) * 60,
      )
      .map((l) => l.raceState);
    return states.includes("RED")
      ? "RED"
      : states.includes("SC")
        ? "SC"
        : states.includes("FCY/VSC")
          ? "FCY/VSC"
          : "GREEN";
  });
  const tyreStatus = (s: Stint) => {
    const flag = s.laps.find((l) => l.tyreChange !== undefined)?.tyreChange;
    if (flag === true) return "changed";
    const previous = full
      .filter((x) => x.car === s.car && x.ordinal < s.ordinal)
      .at(-1);
    if (previous?.tyreSet && s.tyreSet)
      return previous.tyreSet !== s.tyreSet ? "changed" : "retained";
    return flag === false ? "retained" : "unknown";
  };
  const contents = (s: Stint) => {
    const timed = s.laps.filter(
      (l) => l.lapTime !== null && Number.isFinite(l.lapTime),
    );
    const values = timed.map((l) => l.lapTime!);
    const fit = fitLaps(timed);
    const pit =
      s.laps.find(
        (l) => l.pitDuration !== undefined || l.refuelLitres !== undefined,
      ) || s.laps[0];
    return (
      <>
        <div className="strategyBlockTop">
          <span
            className={`tyreIcons ${tyreStatus(s)}`}
            title={`Tyres: ${tyreStatus(s)}`}
          >
            {[0, 1, 2, 3].map((i) => (
              <i key={i} />
            ))}
          </span>
          <span>
            Fuel {num(pit.refuelSeconds)}s / {num(pit.refuelLitres)}L
          </span>
        </div>
        <b>{s.driver}</b>
        <span>
          Avg {fmt(average(values))} · Best {fmt(Math.min(...values))}
        </span>
        <span>
          Deg{" "}
          {Number.isFinite(fit.slope)
            ? `${fit.slope >= 0 ? "+" : ""}${fit.slope.toFixed(3)}`
            : "—"}{" "}
          s/lap · {s.laps.length} laps
        </span>
        <strong>PIT {num(pit.pitDuration)}s</strong>
        {pit.stopNote && <small>{pit.stopNote}</small>}
      </>
    );
  };
  return (
    <section className="raceStrategy">
      <div className="strategyControls">
        <label>
          Zoom{" "}
          <input
            type="range"
            min="1"
            max="4"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <span>
          ● Red: tyre change · ○ White: retained · Grey: unknown. All laps
          included in Avg / Best / Deg. Click a stint for details.
        </span>
      </div>
      <div className="strategyScroll">
        <div style={{ minWidth: 1800 * zoom }}>
          <div className="strategyRow strategyHeader">
            <b>CAR / TEAM</b>
            <b>P / PIC</b>
            <div className="strategyAxis">
              {Array.from({ length: Math.floor(end / 900) + 1 }, (_, i) => (
                <span key={i} style={{ left: `${((i * 900) / end) * 100}%` }}>
                  {clock(i * 900)}
                </span>
              ))}
              <div
                className="strategyFlags"
                title="Race-control indication in one-minute intervals"
              >
                {state.map((s, i) => (
                  <i
                    key={i}
                    title={`${clock(i * 60)} ${s}`}
                    style={{
                      background:
                        s === "RED"
                          ? "#dc2626"
                          : s === "GREEN"
                            ? "#405262"
                            : "#f4bb00",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          {ranked
            .filter((r) => cars.includes(r.car))
            .map((r) => {
              const position = ranked.indexOf(r) + 1,
                pic =
                  ranked
                    .filter((x) => x.last.className === r.last.className)
                    .indexOf(r) + 1;
              return (
                <div className="strategyRow" key={r.car}>
                  <div
                    className="strategyCar"
                    style={{
                      background:
                        CONFIG.CAR_COLOURS[
                          r.car as keyof typeof CONFIG.CAR_COLOURS
                        ] || "#657787",
                    }}
                  >
                    <b>{r.car}</b>
                    <span>{r.last.team}</span>
                  </div>
                  <div className="strategyPositions">
                    P<strong>{r.last.reportedPosition ?? position}</strong>PIC
                    <strong>{pic}</strong>
                  </div>
                  <div className="strategyTrack">
                    {stints
                      .filter(
                        (s) =>
                          s.car === r.car &&
                          Number.isFinite(s.start) &&
                          Number.isFinite(s.end),
                      )
                      .map((s) => (
                        <button
                          key={s.id}
                          className={`strategyBlock ${s.driver === driver ? "focused" : ""}`}
                          style={{
                            left: `${(Math.max(0, s.start) / end) * 100}%`,
                            width: `${(Math.max(0, s.end - Math.max(0, s.start)) / end) * 100}%`,
                            background:
                              CONFIG.CATEGORY_COLOURS[
                                s.category as keyof typeof CONFIG.CATEGORY_COLOURS
                              ] || "#ddd",
                          }}
                          onClick={() => {
                            setDetail(s);
                            setDriver(s.driver);
                          }}
                          title={`${s.driver} · ${clock(s.start)}–${clock(s.end)} · ${s.laps.length} laps`}
                        >
                          {contents(s)}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      {detail && (
        <div className="strategyDetails">
          <button onClick={() => setDetail(null)}>Close details ×</button>
          <h3>
            #{detail.car} · Stint {detail.ordinal} · {clock(detail.start)}–
            {clock(detail.end)}
          </h3>
          {contents(detail)}
        </div>
      )}
    </section>
  );
}
