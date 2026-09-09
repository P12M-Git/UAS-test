"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import type { Lap } from "../src/models/race";
import {
  buildStints,
  fitLaps,
  average,
  overlaps,
} from "../src/analysis/stints";
import { CONFIG } from "../src/config";
import RaceStrategy from "./race-strategy";
import TrackEvolutionFit from "./track-evolution-fit";
import { trackEvolution, proDriverLaps, visibleTimeBounds, type EvolutionSeries } from "../src/analysis/track-evolution";
const time = (n: number) =>
  Number.isFinite(n)
    ? `${Math.floor(n / 60)}:${(n % 60).toFixed(3).padStart(6, "0")}`
    : "—";
const number = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "—");
type Stint = ReturnType<typeof buildStints>[number];
type ColourMode = "car" | "category";
const seriesColour = (s: Stint, mode: ColourMode) => mode === "category"
  ? CONFIG.CATEGORY_COLOURS[s.category as keyof typeof CONFIG.CATEGORY_COLOURS] || CONFIG.CATEGORY_COLOURS.Unknown
  : CONFIG.CAR_COLOURS[s.car as keyof typeof CONFIG.CAR_COLOURS] || "#61788d";
export default function RaceAnalysis({
  laps,
  driver,
  setDriver,
}: {
  laps: Lap[];
  driver: string;
  setDriver: (s: string) => void;
}) {
  const stints = useMemo(() => buildStints(laps), [laps]);
  const [cls, setCls] = useState("All"),
    [cars, setCars] = useState<string[] | null>(null),
    [cats, setCats] = useState<string[] | null>(null);
  const [visibleDrivers, setVisibleDrivers] = useState<string[] | null>(null);
  const [percent, setPercent] = useState(120),
    [cap, setCap] = useState(false),
    [mode, setMode] = useState("laps"),
    [tab, setTab] = useState("Race plot");
  const [anchor, setAnchor] = useState(""),
    [parallel, setParallel] = useState(false),
    [axis, setAxis] = useState("lap");
  const [tyreUsage, setTyreUsage] = useState("reference");
  const refStint =
    stints.find((s) => s.id === anchor && s.driver === driver) ||
    stints.find((s) => s.driver === driver);
  const usage =
    tyreUsage === "reference" ? refStint?.tyreStint : Number(tyreUsage);
  const [showEvolution, setShowEvolution] = useState(false);
  const [showProEvolution, setShowProEvolution] = useState(false);
  const [colourMode, setColourMode] = useState<ColourMode>("car");
  let filtered = stints.filter(
    (s) =>
      (cls === "All" || s.className === cls) &&
      (cars === null || cars.includes(s.car)) &&
      (visibleDrivers === null || visibleDrivers.includes(s.driver)) &&
      (cats === null || cats.includes(s.category)),
  );
  if (tab === "Tyre conditions")
    filtered = usage
      ? filtered.filter(
          (s) =>
            (cls !== "All" ||
              !refStint ||
              s.className === refStint.className) &&
            s.tyreStint === usage &&
            !!s.tyreSet &&
            (!parallel || (!!refStint && overlaps(s.laps, refStint.laps))),
        )
      : [];
  const fastest = Math.min(
    ...filtered.flatMap((s) => s.clean.map((l) => l.lapTime!)),
  );
  const plotted = filtered.map((s) => {
    const clean = s.clean.filter(
      (l) => !cap || l.lapTime! <= (fastest * percent) / 100,
    );
    return { ...s, clean, fit: fitLaps(clean) };
  });
  const evolution = useMemo(() => {
    const clean = stints.filter(s => cls === "All" || s.className === cls).flatMap(s => s.clean);
    const best = new Map<string, number>();
    clean.forEach(l => best.set(l.className, Math.min(best.get(l.className) ?? Infinity, l.lapTime!)));
    return trackEvolution(clean.filter(l => !cap || l.lapTime! <= best.get(l.className)! * percent / 100));
  }, [stints, cls, cap, percent]);
  const proEvolution = useMemo(() => {
    const clean = proDriverLaps(stints.filter(s => cls === "All" || s.className === cls).flatMap(s => s.clean));
    const fastest = Math.min(...clean.map(l => l.lapTime!));
    return trackEvolution(clean.filter(l => !cap || l.lapTime! <= fastest * percent/100))
      .map(s => ({...s, name: `${s.name} · Pro drivers (no Bronze)`}));
  }, [stints, cls, cap, percent]);
  const evolutionVisible = (showEvolution || mode === "evolution") && ["lap", "elapsed"].includes(axis);
  const proEvolutionVisible = showProEvolution && ["lap", "elapsed"].includes(axis);
  const toggles = (
    label: string,
    options: string[],
    selected: string[] | null,
    set: (s: string[] | null) => void,
  ) => (
    <fieldset className="raceChecks">
      <legend>{label}</legend>
      <label>
        <input
          type="checkbox"
          checked={
            selected === null || options.every((x) => selected.includes(x))
          }
          onChange={() =>
            set(
              selected === null || options.every((x) => selected.includes(x))
                ? []
                : null,
            )
          }
        />
        All
      </label>
      {options.map((x) => (
        <label key={x}>
          <input
            type="checkbox"
            checked={selected === null || selected.includes(x)}
            onChange={() =>
              set(
                (selected ?? options).includes(x)
                  ? (selected ?? options).filter((y) => y !== x)
                  : [...(selected ?? options), x],
              )
            }
          />
          {x}
        </label>
      ))}
    </fieldset>
  );
  return (
    <section className="raceAnalysis">
      <div className="seasonTabs">
        {[
          "Race plot",
          "Track evolution fit",
          "Strategy overview",
          "Race Strategy",
          "Tyre conditions",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              if (t === "Tyre conditions") { setAxis("stint"); setShowEvolution(false); setShowProEvolution(false); if (mode === "evolution") setMode("laps"); }
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="seasonControls">
        <label>
          CLASS
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            {["All", ...new Set(laps.map((l) => l.className))].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          FOCUS DRIVER
          <select value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">None</option>
            {[...new Set(laps.map((l) => l.driver))].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {tab !== "Race Strategy" && tab !== "Track evolution fit" && (
          <>
            <label>
              DISPLAY
              <select value={mode} onChange={(e) => {
                setMode(e.target.value);
                if (e.target.value === "evolution" && !["lap", "elapsed"].includes(axis)) setAxis("lap");
              }}>
                <option value="laps">Lap-time traces</option>
                <option value="both">Laps + stint fits</option>
                <option value="fit">Only fitted stint lines</option>
                <option value="evolution">Track evolution — 3-lap moving average</option>
              </select>
            </label>
            <label>
              COLOUR BY
              <select value={colourMode} onChange={e => setColourMode(e.target.value as ColourMode)}>
                <option value="car">Car / team</option>
                <option value="category">FIA category</option>
              </select>
            </label>
            <label>
              <span><input type="checkbox" checked={showEvolution} disabled={mode === "evolution"}
                onChange={e => { setShowEvolution(e.target.checked); if (!["lap", "elapsed"].includes(axis)) setAxis("lap"); }} />
                Overlay track evolution</span>
            </label>
            <label>
              <span><input type="checkbox" checked={showProEvolution}
                onChange={e => { setShowProEvolution(e.target.checked); if (!["lap", "elapsed"].includes(axis)) setAxis("lap"); }}/>
                Track evolution pro drivers (LMP2, no Bronze)</span>
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={cap}
                  onChange={(e) => setCap(e.target.checked)}
                />
                Y cutoff (% fastest visible)
              </span>
              <input
                type="number"
                min="100"
                max="200"
                step="0.5"
                value={percent}
                onChange={(e) =>
                  setPercent(Math.max(100, Number(e.target.value) || 100))
                }
              />
            </label>
            <label>
              X AXIS
              <select value={axis} onChange={(e) => setAxis(e.target.value)}>
                <option value="lap">Race lap</option>
                <option value="elapsed">Race elapsed (minutes)</option>
                <option value="age" disabled={mode === "evolution" || showEvolution || showProEvolution}>Tyre age (laps)</option>
                <option value="stint" disabled={mode === "evolution" || showEvolution || showProEvolution}>Lap within full-tank stint</option>
              </select>
            </label>
          </>
        )}
      </div>
      {toggles(
        "DRIVERS",
        [...new Set(laps.map((l) => l.driver))],
        visibleDrivers,
        setVisibleDrivers,
      )}
      {toggles(
        "FIA CATEGORY",
        [...new Set(laps.map((l) => l.category))],
        cats,
        setCats,
      )}
      {toggles(
        "CAR NUMBER",
        [...new Set(laps.map((l) => l.carNumber))],
        cars,
        setCars,
      )}
      {tab !== "Race Strategy" && (
        <p>
          Lap Time DEG = linear fit of lap time against race lap, in s/lap.
          In/out laps and neutralised laps excluded; then laps above 120% of the
          eligible stint average excluded. Positive = slower each lap.
        </p>
      )}
      {proEvolutionVisible && <p>Pro drivers: LMP2 / Pro-Am without Bronze. Same clean-stint filter and 3-lap moving average; optional cutoff recalculated from this sample. Unknown ratings remain included because only Bronze is excluded.</p>}
      {evolutionVisible && <p>
        Track evolution: pooled clean lap times from race laps n−2, n−1 and n, across the entire class
        (LMP2 includes Pro-Am). Same stint cleaning and optional percentage cutoff; driver/car/FIA selections
        do not restrict the class reference. Gaps without three consecutive eligible lap bins are not connected.
        This is observed field pace, also affected by fuel, tyres and drivers—not a correction for those effects.
      </p>}
      {tab === "Tyre conditions" && (
        <div>
          <label>
            REFERENCE STINT{" "}
            <select
              value={refStint?.id || ""}
              onChange={(e) => setAnchor(e.target.value)}
            >
              {stints
                .filter((s) => s.driver === driver)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.car} {s.driver} · stint {s.ordinal} ·{" "}
                    {s.tyreStint === 1
                      ? "NEW TYRES"
                      : s.tyreStint
                        ? `TYRE USE ${s.tyreStint}`
                        : "UNKNOWN TYRES"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            TYRE CONDITION{" "}
            <select
              value={tyreUsage}
              onChange={(e) => setTyreUsage(e.target.value)}
            >
              <option value="reference">Same as reference stint</option>
              {[
                ...new Set(
                  stints
                    .map((s) => s.tyreStint)
                    .filter((n): n is number => n !== null),
                ),
              ]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n === 1
                      ? "New tyres — first stint"
                      : `Used tyres — stint ${n}`}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={parallel}
              onChange={(e) => setParallel(e.target.checked)}
            />
            Overlapping race time only
          </label>
          <p>
            Full tank at every stop. Compare complete stints by tyre usage:
            first stint on new tyres, second stint on retained tyres, etc. Set
            number does not restrict matching. Dirty laps are excluded; race
            time and tyre age remain visible.
          </p>
          {!refStint?.tyreSet && (
            <p>
              Load processed_timing_database.csv from your dissertation:
              original timing CSVs have no tyre-set data.
            </p>
          )}
        </div>
      )}
      {!filtered.length && (
        <p role="status">
          No stints match the selected categories, cars and drivers. Select All
          in a filter to restore that group.
        </p>
      )}
      {tab === "Race Strategy" && (
        <RaceStrategy
          allLaps={laps}
          stints={filtered}
          driver={driver}
          setDriver={setDriver}
        />
      )}
      {tab === "Track evolution fit" && <TrackEvolutionFit stints={stints} visible={filtered} driver={driver} setDriver={setDriver}
        cap={cap} percent={percent} setCap={setCap} setPercent={setPercent}/>}
      {tab !== "Strategy overview" && tab !== "Race Strategy" && tab !== "Track evolution fit" && (
        <RaceCanvas
          rows={plotted}
          driver={driver}
          mode={mode}
          axis={axis}
          evolution={[...(evolutionVisible ? evolution : []), ...(proEvolutionVisible ? proEvolution : [])]}
          colourMode={colourMode}
        />
      )}
      {colourMode === "category" && tab !== "Race Strategy" && tab !== "Track evolution fit" && <div className="raceChecks" aria-label="FIA category colour legend">
        {Object.entries(CONFIG.CATEGORY_COLOURS).map(([category, colour]) => <span key={category}
          style={{borderLeft:`8px solid ${colour}`, padding:"4px 10px", color:"#17202a"}}>{category}</span>)}
        <span>Focus driver: thicker purple trace; other drivers muted.</span>
      </div>}
      {tab !== "Track evolution fit" && <div className="raceChecks" aria-label="Driver colour legend">
        {[
          ...new Map(plotted.map((s) => [`${s.car}|${s.driver}`, s])).values(),
        ].map((s) => (
          <button
            key={`${s.car}|${s.driver}`}
            onClick={() => setDriver(s.driver)}
            style={{
              borderLeft: `6px solid ${seriesColour(s, colourMode)}`,
              background: s.driver === driver ? "#b148d1" : "#f5f6f7",
              color: s.driver === driver ? "white" : "#17202a",
            }}
          >
            #{s.car} {s.driver}
            {colourMode === "category" && ` · ${s.category}`}
          </button>
        ))}
      </div>
      }
      {tab === "Strategy overview" &&
        plotted.map((s) => (
          <div className="strategyStint" key={s.id}>
            <span>
              #{s.car} {s.driver} · S{s.ordinal} · DEG {number(s.fit.slope)}{" "}
              s/lap
            </span>
            <div>
              <i
                title={`${time(s.start)}–${time(s.end)}`}
                style={{
                  left: `${s.start / 144}%`,
                  width: `${(s.end - s.start) / 144}%`,
                  background:
                    s.driver === driver
                      ? "#a326cc"
                      : seriesColour(s, colourMode),
                }}
              />
            </div>
          </div>
        ))}
      {tab !== "Race Strategy" && tab !== "Track evolution fit" && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                {[
                  "CAR / DRIVER",
                  "STINT",
                  "TYRE CONDITION",
                  "TYRE USE",
                  "TYRE AGE START",
                  "RACE TIME",
                  "USED / ALL",
                  "AVG",
                  "LAP TIME DEG (s/lap)",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plotted.map((s) => (
                <tr
                  key={s.id}
                  className={s.driver === driver ? "performanceFocus" : ""}
                >
                  <td>
                    #{s.car} {s.driver}
                  </td>
                  <td>{s.ordinal}</td>
                  <td>
                    {s.tyreStint === 1
                      ? "NEW"
                      : s.tyreStint
                        ? "USED"
                        : "UNKNOWN"}
                  </td>
                  <td>{s.tyreStint ?? "—"}</td>
                  <td>{s.tyreAge ?? "—"}</td>
                  <td>
                    {time(s.start)}–{time(s.end)}
                  </td>
                  <td>
                    {s.clean.length}/{s.laps.length}
                  </td>
                  <td>{time(average(s.clean.map((l) => l.lapTime!)))}</td>
                  <td>{number(s.fit.slope)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function RaceCanvas({
  rows,
  driver,
  mode,
  axis,
  evolution,
  colourMode,
}: {
  rows: Stint[];
  driver: string;
  mode: string;
  axis: string;
  evolution: EvolutionSeries[];
  colourMode: ColourMode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const xValue = (l: Lap, s: Stint) => axis === "elapsed" ? (l.elapsed ?? NaN)/60
      : axis === "age" ? (l.tyreAge ?? NaN)
      : axis === "stint" ? l.lapNumber-s.laps[0].lapNumber+1 : l.lapNumber;
    const visibleRows = mode === "evolution" ? [] : rows.map(s => ({ ...s, clean:s.clean.filter(l=>Number.isFinite(xValue(l,s))) }));
    const visibleEvolution = evolution.map(s => ({...s, points:s.points.filter(p => Number.isFinite(axis === "elapsed" ? p.elapsed : p.lap))}));
    const values = visibleRows.flatMap(s => s.clean.flatMap(l => [
      ...(mode !== "fit" ? [l.lapTime!] : []),
      ...(mode !== "laps" && Number.isFinite(s.fit.slope) ? [s.fit.intercept+s.fit.slope*l.lapNumber] : []),
    ])).concat(visibleEvolution.flatMap(s=>s.points.map(p=>p.time)));
    const [minY, maxY] = visibleTimeBounds(values);
    const w = 1400,
      h = Math.max(530, (maxY - minY) * 20 + 120),
      plotBottom = h - 70,
      plotHeight = h - 120;
    el.width = w;
    el.height = h;
    ctx.fillStyle = "#f5f6f7";
    ctx.fillRect(0, 0, w, h);
    const stintStart = new Map(
      rows.flatMap((s) =>
        s.laps.map((l) => [l.id, s.laps[0].lapNumber] as const),
      ),
    );
    const pointX = (l: Lap) =>
      axis === "elapsed"
        ? (l.elapsed ?? NaN) / 60
        : axis === "age"
          ? (l.tyreAge ?? NaN)
          : axis === "stint"
            ? l.lapNumber - (stintStart.get(l.id) ?? l.lapNumber) + 1
            : l.lapNumber;
    const points = visibleRows
      .flatMap((s) => s.clean)
      .filter((l) => Number.isFinite(pointX(l)));
    if (!values.length) {
      ctx.fillStyle = "#17202a";
      ctx.fillText("No eligible laps for these filters", 80, 70);
      return;
    }
    const maxX = Math.max(...points.map(pointX), ...visibleEvolution.flatMap(s=>s.points.map(p=>axis === "elapsed" ? p.elapsed/60 : p.lap)), 1);
    const x = (v: number) => 85 + (v / maxX) * 1280,
      y = (v: number) => plotBottom - ((v - minY) / (maxY - minY)) * plotHeight;
    ctx.font = "13px Arial";
    ctx.textAlign = "right";
    for (let v = minY; v <= maxY; v++) {
      ctx.strokeStyle = "#ccd3d9";
      ctx.beginPath();
      ctx.moveTo(85, y(v));
      ctx.lineTo(1365, y(v));
      ctx.stroke();
      ctx.fillStyle = "#17202a";
      ctx.fillText(time(v), 78, y(v) + 4);
    }
    ctx.textAlign = "center";
    for (let i = 0; i <= 10; i++) {
      const v = (maxX * i) / 10;
      ctx.fillText(v.toFixed(0), x(v), h - 45);
    }
    ctx.fillText(
      axis === "lap"
        ? "Race lap"
        : axis === "age"
          ? "Tyre age (laps)"
          : axis === "stint"
            ? "Lap within full-tank stint"
            : "Race elapsed (minutes)",
      720,
      h - 15,
    );
    for (const s of [...visibleRows].sort(
      (a, b) => Number(a.driver === driver) - Number(b.driver === driver),
    )) {
      const p = s.clean.filter((l) => Number.isFinite(pointX(l)));
      if (!p.length) continue;
      ctx.strokeStyle =
        s.driver === driver
          ? "#a326cc"
          : seriesColour(s, colourMode);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = driver && s.driver !== driver ? 0.6 : 1;
      ctx.lineWidth = s.driver === driver ? 4 : 1.4;
      if (mode !== "fit") {
        ctx.beginPath();
        p.forEach((l, i) => {
          const prev = p[i - 1];
          if (!prev || l.lapNumber !== prev.lapNumber + 1)
            ctx.moveTo(x(pointX(l)), y(l.lapTime!));
          else ctx.lineTo(x(pointX(l)), y(l.lapTime!));
        });
        ctx.stroke();
        p.forEach((l) => {
          ctx.beginPath();
          ctx.arc(x(pointX(l)), y(l.lapTime!), s.driver === driver ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (mode !== "laps" && Number.isFinite(s.fit.slope)) {
        ctx.setLineDash(mode === "both" ? [6, 4] : []);
        ctx.beginPath();
        p.forEach((l, i) => {
          const px = x(pointX(l)),
            py = y(s.fit.intercept + s.fit.slope * l.lapNumber);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
    visibleEvolution.forEach((s, index) => {
      ctx.strokeStyle = ["#142d4e", "#d05a00", "#157767", "#a326cc"][index % 4];
      ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 4;
      ctx.beginPath();
      s.points.forEach((p,i) => {
        const px = x(axis === "elapsed" ? p.elapsed/60 : p.lap), py = y(p.time);
        if (!i || s.points[i-1].lap !== p.lap-1) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      });
      ctx.stroke();
      s.points.forEach(p=>{ctx.beginPath();ctx.arc(x(axis === "elapsed" ? p.elapsed/60 : p.lap),y(p.time),2.5,0,Math.PI*2);ctx.fill();});
      ctx.textAlign = "left"; ctx.fillText(`${s.name} · MA3`, 95, 20+index*15);
    });
  }, [rows, driver, mode, axis, evolution, colourMode]);
  return (
    <canvas
      ref={canvas}
      className="raceCanvas"
      aria-label="Lap times and fitted stint degradation for the filtered drivers"
    />
  );
}
