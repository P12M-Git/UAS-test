"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONFIG, type TopMode } from "../src/config";
import {
  applyDriverCategories,
  parseFiles,
} from "../src/parser/uraice_adapter";
import type { Lap, ParseDiagnostics } from "../src/models/race";
import {
  driverMetrics,
  type DriverMetric,
  mean,
  median,
  std,
} from "../src/analysis/driver_metrics";
import { categoryMetrics } from "../src/analysis/category_metrics";
import RaceAnalysis from "./race-analysis";
import SeasonAggregate from "./season-aggregate";
import DriverCategoryDatabase from "./driver-category-database";
import { sharedTrackFraction } from "../src/analysis/stints";
import { seasonComparison, absoluteSummaryDrivers, summaryLapCount, summaryDriverMetrics, type SeasonLapCounts } from "../src/analysis/season-comparison";
import { trafficSample } from "../src/analysis/traffic";
import { loadDefaultRaces, mergeRaceDatasets } from "../src/default-races";
type View =
  | "Overview"
  | "Race Analysis"
  | "Driver Performance"
  | "Lap Analysis"
  | "Traffic Performance"
  | "Driver Focus"
  | "Season Summary"
  | "Category Benchmarks"
  | "Driver Category Database"
  | "Data / Session Info";
const views: View[] = [
  "Overview",
  "Race Analysis",
  "Driver Performance",
  "Lap Analysis",
  "Traffic Performance",
  "Season Summary",
  "Category Benchmarks",
  "Data / Session Info",
  "Driver Category Database",
];
const tips: Record<string, string> = {
  Clean:
    "Green-flag laps excluding race lap 1, pit-in laps, pit-out laps and invalid laps.",
  "Avg best": "Average of the driver's fastest N clean laps.",
  "Clean air":
    "Share of clean laps with known timing order: no car ahead, or gap greater than 2.0 s. Unknown observations excluded. Same-lap timing proxy; lapped traffic is not reconstructed.",
  Z: "Average standardised lap performance relative to other drivers in the same race/class. Positive is faster.",
  Overtakes:
    "Reconstructed order inversions, including lapped and multiclass cars; pit transitions are rejected.",
  MAD: "Raw median absolute deviation of lap times.",
};
const fmt = (n: number | null | undefined, d = 3) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${Math.floor(n / 60)}:${(n % 60).toFixed(d).padStart(3 + d, "0")}`;
const num = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const lapHeat = (value: number, values: number[]) => {
  const valid = values.filter(Number.isFinite);
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const ratio = hi === lo ? 0.5 : (value - lo) / (hi - lo);
  return {
    backgroundColor: `hsl(${ratio * 120} 72% 82%)`,
    color: "#17202a",
  };
};
function Info({ t }: { t: string }) {
  return (
    <span className="info" title={tips[t] || t}>
      i
    </span>
  );
}
function download<T extends object>(name: string, rows: T[]) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]),
    csv = [
      h.join(","),
      ...rows.map((r) =>
        h.map((k) => JSON.stringify(r[k as keyof T] ?? "")).join(","),
      ),
    ].join("\n"),
    a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
export default function Home() {
  const [laps, setLaps] = useState<Lap[]>([]),
    [diagnostics, setDiagnostics] = useState<ParseDiagnostics[]>([]),
    [view, setView] = useState<View>("Overview"),
    [mode, setMode] = useState<TopMode>(20),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [driver, setDriver] = useState(""),
    [parallelOnly, setParallelOnly] = useState(false),
    [classFilter, setClassFilter] = useState("All"),
    [teamFilter, setTeamFilter] = useState("All"),
    [driverCategoryFilter, setDriverCategoryFilter] = useState<string[]>([
      "Platinum",
      "Gold",
      "Silver",
      "Bronze",
      "Unknown",
    ]),
    [eventFilter, setEventFilter] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState<keyof DriverMetric>("avgBest"),
    [sortAsc, setSortAsc] = useState(true),
    [summaryEvents, setSummaryEvents] = useState<string[]>([]),
    input = useRef<HTMLInputElement>(null);
  const events = [...new Set(laps.map((l) => l.event))];
  const selectedEvent = eventFilter || events[0] || "";
  const sessionLaps = useMemo(() => laps.filter((l) => l.event === selectedEvent), [laps, selectedEvent]);
  const allMetrics = useMemo(() => driverMetrics(sessionLaps, mode), [sessionLaps, mode]);
  const metrics = useMemo(
    () =>
      allMetrics
        .filter(
          (m) =>
            (classFilter === "All" || m.className === classFilter) &&
            (teamFilter === "All" || m.car === teamFilter) &&
            driverCategoryFilter.includes(m.category) &&
            `${m.driver} ${m.car}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          const x = a[sort],
            y = b[sort];
          return typeof x === "number" && typeof y === "number"
            ? (sortAsc ? 1 : -1) * (x - y)
            : (sortAsc ? 1 : -1) * String(x).localeCompare(String(y));
        }),
    [
      allMetrics,
      classFilter,
      teamFilter,
      driverCategoryFilter,
      search,
      sort,
      sortAsc,
    ],
  );
  const activeDriver = sessionLaps.some(l => l.driver === driver) ? driver : sessionLaps[0]?.driver || "";
  const dlaps = sessionLaps.filter((l) => l.driver === activeDriver);
  const parallelNames = useMemo(() => {
    if (!parallelOnly) return new Set<string>();
    const focus = sessionLaps.filter(l => l.driver === activeDriver);
    const groups = new Map<string, Lap[]>();
    sessionLaps.forEach(l => {
      const key = `${l.driver}|${l.carNumber}`;
      const rows = groups.get(key) || [];
      rows.push(l);
      groups.set(key, rows);
    });
    return new Set([...groups].filter(([, rows]) => sharedTrackFraction(focus, rows) >= 0.3).map(([key]) => key));
  }, [sessionLaps, activeDriver, parallelOnly]);
  const performanceMetrics = parallelOnly
    ? allMetrics.filter(
        (m) =>
          (classFilter === "All" || m.className === classFilter) &&
          driverCategoryFilter.includes(m.category) &&
          (m.driver === activeDriver || parallelNames.has(`${m.driver}|${m.car}`)),
      ).sort((a, b) => {
        const x = a[sort], y = b[sort];
        return (sortAsc ? 1 : -1) * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
      })
    : metrics;
  const cats = categoryMetrics(metrics);
  const classes = ["All", ...new Set(sessionLaps.map((l) => l.className))],
    teams = ["All", ...new Set(sessionLaps.map((l) => l.carNumber))];
  useEffect(() => {
    let cancelled = false;
    loadDefaultRaces().then(d => {
      if (cancelled) return;
      setLaps(d.laps);
      setDiagnostics(d.diagnostics);
      setSummaryEvents([...new Set(d.laps.map(l => l.event))]);
    }).catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  async function load(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    setError("");
    try {
      const d = await parseFiles(files);
      const categoryText = await fetch("/driver_categories_by_season.csv").then((r) =>
        r.text(),
      );
      const categorised = applyDriverCategories(d.laps, categoryText);
      const merged = mergeRaceDatasets({ laps, diagnostics }, { laps: categorised, diagnostics: d.diagnostics });
      setLaps(merged.laps);
      setDiagnostics(merged.diagnostics);
      setEventFilter(categorised[0]?.event || "");
      setSummaryEvents([...new Set(merged.laps.map((l) => l.event))]);
      setDriver(categorised[0]?.driver || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to parse files");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <aside>
        <div className="brand">
          <div>
            <b>DRIVER INSIDERS - U.RAICE</b>
            <small>© Pol RG</small>
          </div>
        </div>
        <nav>
          {views.map((v, i) => (
            <button
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
              key={v}
            >
              <span>0{i + 1}</span>
              {v}
            </button>
          ))}
        </nav>
        <div className="method">
          <span>METHOD STATUS</span>
          <b>
            <i /> U.RAICE ADAPTER
          </b>
          <small>Timing-line reconstruction · v1.0</small>
        </div>
      </aside>
      <section className="shell">
        <header>
          <div>
            <p className="eyebrow">DRIVER INSIDERS - U.RAICE</p>
            <h1>{view.toUpperCase()}</h1>
          </div>
          <div className="actions">
            <form action="/auth/logout" method="post"><button className="ghost" type="submit">SIGN OUT</button></form>
            <button className="ghost" disabled={busy} onClick={() => input.current?.click()}>
              ＋ ADD SESSIONS
            </button>
            <input
              ref={input}
              hidden
              multiple
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => load([...(e.target.files || [])])}
            />
            {view !== "Driver Category Database" && <button
              className="primary"
              onClick={() =>
                view.includes("Category")
                  ? download("category_benchmarks.csv", cats)
                  : download("driver_ranking.csv", metrics)
              }
            >
              ⇩ EXPORT CSV
            </button>}
          </div>
        </header>
        {error && <div className="alert">{error}</div>}
        {view === "Driver Category Database" ? <DriverCategoryDatabase/> : !laps.length ? (
          <Empty busy={busy} open={() => input.current?.click()} />
        ) : (
          <>
            {view !== "Data / Session Info" &&
              view !== "Driver Focus" &&
              view !== "Race Analysis" &&
              view !== "Season Summary" && (
                <Filters
                  events={events}
                  event={selectedEvent}
                  setEvent={(value: string) => {
                    setEventFilter(value);
                    setDriver("");
                    setTeamFilter("All");
                  }}
                  classes={classes}
                  teams={teams}
                  cf={classFilter}
                  tf={teamFilter}
                  setCf={setClassFilter}
                  setTf={setTeamFilter}
                  search={search}
                  setSearch={setSearch}
                  mode={mode}
                  setMode={setMode}
                  categories={[...new Set(sessionLaps.map((l) => l.category))]}
                  selectedCategories={driverCategoryFilter}
                  setSelectedCategories={setDriverCategoryFilter}
                />
              )}{" "}
            {view === "Overview" && (
              <Overview
                laps={sessionLaps}
                metrics={metrics}
                events={[selectedEvent]}
              />
            )}{" "}
            {view === "Driver Performance" && (
              <>
                <DriverSelect
                  drivers={[...new Set(sessionLaps.map((l) => l.driver))]}
                  driver={activeDriver}
                  setDriver={setDriver}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={parallelOnly}
                    onChange={(e) => setParallelOnly(e.target.checked)}
                  />
                  COMPARE WITH PARALLEL DRIVERS (≥30%)
                </label>
                {parallelOnly && <p className="parallel-note">Rivals must share at least 30% of {activeDriver}'s total observed on-track time. Class/category filters apply; car/search filters are ignored to include rival cars. Timing-line estimate; pit dwell excluded where recorded. Outlaps without pit duration are omitted.</p>}
                <Ranking
                  metrics={performanceMetrics}
                  focusDriver={activeDriver}
                  setFocusDriver={setDriver}
                  sort={sort}
                  sortAsc={sortAsc}
                  setSort={(key) => {
                    if (key === sort) setSortAsc(!sortAsc);
                    else {
                      setSort(key);
                      setSortAsc(true);
                    }
                  }}
                />
              </>
            )}{" "}
            {view === "Race Analysis" && (
              <>
                <label>
                  EVENT / RACE{" "}
                  <select
                    value={selectedEvent}
                    onChange={(e) => {
                      setEventFilter(e.target.value);
                      setDriver("");
                    }}
                  >
                    {events.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <RaceAnalysis
                  laps={sessionLaps}
                  driver={activeDriver}
                  setDriver={setDriver}
                />
              </>
            )}
            {view === "Lap Analysis" && (
              <LapAnalysis
                laps={dlaps}
                drivers={[...new Set(sessionLaps.map((l) => l.driver))]}
                driver={activeDriver}
                setDriver={setDriver}
              />
            )}{" "}
            {view === "Traffic Performance" && (
              <Traffic
                laps={dlaps}
                allLaps={sessionLaps}
                driver={activeDriver}
                drivers={[...new Set(sessionLaps.map((l) => l.driver))]}
                setDriver={setDriver}
              />
            )}{" "}
            {view === "Driver Focus" && (
              <DriverFocus
                laps={laps}
                events={events}
                selectedEvents={summaryEvents}
                setSelectedEvents={setSummaryEvents}
                driver={activeDriver}
                drivers={[...new Set(laps.map((l) => l.driver))]}
                setDriver={setDriver}
              />
            )}{" "}
            {view === "Season Summary" && (
              <SeasonSummary
                laps={laps}
                events={events}
                selectedEvents={summaryEvents}
                setSelectedEvents={setSummaryEvents}
                driver={activeDriver}
                drivers={[...new Set(laps.map((l) => l.driver))]}
                setDriver={setDriver}
              />
            )}{" "}
            {view === "Category Benchmarks" && <Categories rows={cats} />}{" "}
            {view === "Data / Session Info" && (
              <DataInfo
                rows={diagnostics.filter((r) =>
                  sessionLaps.some((l) => l.sourceFile === r.sourceFile),
                )}
                laps={sessionLaps}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}
function Empty({ busy, open }: { busy: boolean; open: () => void }) {
  return (
    <div className="empty">
      <div className="uploadIcon">↥</div>
      <p className="eyebrow">CANONICAL TIMING INGEST</p>
      <h2>{busy ? "Reconstructing sessions…" : "Load race timing files"}</h2>
      <p>
        Drop in one or more Al Kamel semicolon CSV files. Analysis remains in
        your browser; no race data is uploaded.
      </p>
      <button className="primary big" onClick={open} disabled={busy}>
        SELECT CSV FILES
      </button>
      <div className="pipeline">
        <span>PARSE</span>
        <i>→</i>
        <span>CLASSIFY</span>
        <i>→</i>
        <span>RECONSTRUCT</span>
        <i>→</i>
        <span>REPORT</span>
      </div>
    </div>
  );
}
function Filters(p: any) {
  return (
    <div className="filters">
      <label>
        EVENT / RACE
        <select value={p.event} onChange={(e) => p.setEvent(e.target.value)}>
          {p.events.map((x: string) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        CLASS
        <select value={p.cf} onChange={(e) => p.setCf(e.target.value)}>
          {p.classes.map((x: string) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        CAR / NUMBER
        <select value={p.tf} onChange={(e) => p.setTf(e.target.value)}>
          {p.teams.map((x: string) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        DRIVER / CAR
        <input
          value={p.search}
          onChange={(e) => p.setSearch(e.target.value)}
          placeholder="Search…"
        />
      </label>
      <label>
        PACE SAMPLE
        <select
          value={p.mode}
          onChange={(e) =>
            p.setMode(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value={20}>Best 20 / fallback</option>
          <option value={10}>Best 10</option>
          <option value="all">All clean laps</option>
        </select>
      </label>
      <fieldset className="categoryTicks filterCategoryTicks">
        <legend>DRIVER CATEGORY</legend>
        <label>
          <input
            type="checkbox"
            checked={p.categories.every((x: string) =>
              p.selectedCategories.includes(x),
            )}
            onChange={() =>
              p.setSelectedCategories(
                p.categories.every((x: string) =>
                  p.selectedCategories.includes(x),
                )
                  ? []
                  : p.categories,
              )
            }
          />
          All
        </label>
        {p.categories.map((x: string) => (
          <label key={x}>
            <input
              type="checkbox"
              checked={p.selectedCategories.includes(x)}
              onChange={() =>
                p.setSelectedCategories(
                  p.selectedCategories.includes(x)
                    ? p.selectedCategories.filter((c: string) => c !== x)
                    : [...p.selectedCategories, x],
                )
              }
            />
            {x}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
function Overview({
  laps,
  metrics,
  events,
}: {
  laps: Lap[];
  metrics: DriverMetric[];
  events: string[];
}) {
  const cards = [
    ["SESSIONS", events.length],
    ["CARS", new Set(laps.map((l) => `${l.event}-${l.carNumber}`)).size],
    ["DRIVERS", new Set(laps.map((l) => l.driver)).size],
    ["TIMING LAPS", laps.length],
    ["GREEN FLAG", laps.filter((l) => l.green).length],
    ["CLEAN / USABLE", laps.filter((l) => l.clean).length],
  ];
  return (
    <>
      <div className="summary">
        <div>
          <p className="eyebrow">DATASET SCOPE</p>
          <h2>{events.join(" · ")}</h2>
          <p>
            {laps.length.toLocaleString()} reconstructed timing observations
            across {events.length} race session{events.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <div className="threshold">
          <span>CLEAN AIR THRESHOLD</span>
          <b>{CONFIG.CLEAN_AIR_THRESHOLD_SECONDS.toFixed(1)}s</b>
          <small>at timing-line crossing</small>
        </div>
      </div>
      <div className="cards">
        {cards.map(([a, b]) => (
          <div className="card" key={String(a)}>
            <span>{a}</span>
            <strong>{b}</strong>
            <i />
          </div>
        ))}
      </div>
      <SectionTitle
        n="01"
        title="Performance order"
        sub="Fastest selected clean-lap average · lower is better"
      />
      <Ranking
        metrics={metrics.slice(0, 12)}
        sort="avgBest"
        sortAsc={true}
        setSort={() => {}}
        compact
      />
    </>
  );
}
function SectionTitle({
  n,
  title,
  sub,
}: {
  n: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="sectionTitle">
      <span>{n}</span>
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
    </div>
  );
}
function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="categoryBadge"
      style={{
        background:
          CONFIG.CATEGORY_COLOURS[
            category as keyof typeof CONFIG.CATEGORY_COLOURS
          ] || CONFIG.CATEGORY_COLOURS.Unknown,
      }}
    >
      {category}
    </span>
  );
}
function CarNumber({ number }: { number: string }) {
  const colour =
    CONFIG.CAR_COLOURS[number as keyof typeof CONFIG.CAR_COLOURS] || "#7f8993";
  return (
    <span className="carNumber" style={{ background: colour }}>
      {number}
    </span>
  );
}
function Distribution({
  m,
  lo,
  hi,
}: {
  m: DriverMetric;
  lo: number;
  hi: number;
}) {
  if (!m.times.length) return <span>—</span>;
  const range = hi - lo || 1;
  return (
    <div className="dist">
      {m.times.map((t, i) => (
        <i
          key={i}
          className={m.bestTimes.includes(t) ? "best" : ""}
          style={{
            left: `${Math.max(3, Math.min(97, ((t - lo) / range) * 94 + 3))}%`,
          }}
        />
      ))}
      <b style={{ left: `${((m.avgBest - lo) / range) * 94 + 3}%` }} />
      <small>{fmt(lo, 1)}</small>
      <small>{fmt(hi, 1)}</small>
    </div>
  );
}
function TrackTimeline({ m }: { m: DriverMetric }) {
  const duration = 4 * 60 * 60;
  return (
    <div
      className="trackTimeline"
      title="Driver track time across the four-hour race; yellow = neutralised"
    >
      {m.timeline.map((segment, i) => {
        const start = Math.max(0, Math.min(duration, segment.start));
        const end = Math.max(start, Math.min(duration, segment.end));
        return (
          <i
            key={i}
            className={segment.neutralized ? "neutralized" : "running"}
            style={{
              left: `${(start / duration) * 100}%`,
              width: `${Math.max(0.12, ((end - start) / duration) * 100)}%`,
            }}
          />
        );
      })}
      <small>0H</small>
      <small>4H</small>
    </div>
  );
}
function Ranking({
  metrics,
  sort,
  sortAsc,
  setSort,
  compact = false,
  focusDriver = "",
  setFocusDriver,
}: {
  focusDriver?: string;
  setFocusDriver?: (driver: string) => void;
  metrics: DriverMetric[];
  sort: keyof DriverMetric;
  sortAsc: boolean;
  setSort: (k: keyof DriverMetric) => void;
  compact?: boolean;
}) {
  const [deltaReference, setDeltaReference] = useState<{
    key: string;
    column: keyof DriverMetric;
  } | null>(null);
  const reference = deltaReference
    ? metrics.find((m) => m.key === deltaReference.key)
    : undefined;
  const metricCell = (
    m: DriverMetric,
    column: keyof DriverMetric,
    value: React.ReactNode,
  ) => {
    const raw =
      reference &&
      deltaReference?.column === column &&
      typeof m[column] === "number" &&
      typeof reference[column] === "number"
        ? (m[column] as number) - (reference[column] as number)
        : null;
    return (
      <td
        className={`mono contextMetric ${reference?.key === m.key && deltaReference?.column === column ? "deltaOrigin" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setDeltaReference(
            reference?.key === m.key && deltaReference?.column === column
              ? null
              : { key: m.key, column },
          );
        }}
        title="Right-click to compare this column"
      >
        <span>{value}</span>
        {raw !== null && (
          <small className={raw <= 0 ? "deltaBetter" : "deltaWorse"}>
            Δ {raw >= 0 ? "+" : ""}
            {raw.toFixed(3)}s
          </small>
        )}
      </td>
    );
  };
  const classScales = new Map<string, [number, number]>();
  metrics.forEach((m) => {
    const fastest = Math.min(
      ...metrics
        .filter((x) => x.className === m.className)
        .map((x) => x.best)
        .filter(Number.isFinite),
    );
    classScales.set(m.className, [fastest, fastest + 6]);
  });
  const H = ({ k, c, t }: { k: keyof DriverMetric; c: string; t?: string }) => (
    <th className={sort === k ? "sorted" : ""} onClick={() => setSort(k)}>
      {c}
      {sort === k && <b className="sortSignal">{sortAsc ? "▲" : "▼"}</b>}
      {t && <Info t={t} />}
    </th>
  );
  return (
    <div className="tableWrap">
      <table className="ranking">
        <thead>
          <tr>
            <th>#</th>
            <H k="driver" c="DRIVER" />
            <H k="clean" c="LAPS" t="Clean" />
            <th className="lapHeatHead">N</th>
            <H k="best" c="BEST" />
            <H k="avgBest" c="AVG BEST N" t="Avg best" />
            {!compact && (
              <>
                <H k="avgAll" c="AVG CLEAN" />
                <H k="stdBest" c="σ BEST" />
                <H k="madBest" c="MAD" t="MAD" />
                <H
                  k="lapTimeDeg"
                  c="LAP TIME DEG"
                  t="Mean of per-stint linear slopes (s/lap); positive means slower. See Race Analysis for each stint."
                />
                <H k="cleanAirPct" c="CLEAN AIR" t="Clean air" />
                <H k="overtakes" c="OVERTAKES" t="Overtakes" />
                <H k="zBest" c="CATEGORY Z" t="Z" />
              </>
            )}
            <th className="chartHead">
              PACE DISTRIBUTION{!compact && " / TRACK TIME"}
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr
              key={m.key}
              className={m.driver === focusDriver ? "performanceFocus" : ""}
            >
              <td className="rank">{String(i + 1).padStart(2, "0")}</td>
              <td
                className="categoryShade"
                onClick={() => setFocusDriver?.(m.driver)}
                style={{
                  background:
                    CONFIG.CATEGORY_COLOURS[
                      m.category as keyof typeof CONFIG.CATEGORY_COLOURS
                    ] || CONFIG.CATEGORY_COLOURS.Unknown,
                }}
              >
                <div className="driver">
                  <span
                    style={{
                      background:
                        CONFIG.CATEGORY_COLOURS[
                          m.category as keyof typeof CONFIG.CATEGORY_COLOURS
                        ] || CONFIG.CATEGORY_COLOURS.Unknown,
                    }}
                  />
                  <b>
                    <CarNumber number={m.car} /> {m.driver}{" "}
                    <CategoryBadge category={m.category} />
                  </b>
                  <small>
                    {m.team} · {m.className}{" "}
                    {m.proAm && <em className="proAm">PRO/AM</em>}
                  </small>
                </div>
              </td>
              <td>
                <b>{m.used}</b>
                <small> / {m.clean}</small>
                {m.lowSample && <em>LOW N</em>}
              </td>
              <td
                className="lapCountCell lapHeatMini"
                style={lapHeat(
                  m.clean,
                  metrics.map((x) => x.clean),
                )}
                title={`${m.clean} clean laps`}
              >
                {m.clean}
              </td>
              {metricCell(
                m,
                "best",
                <span className="fast">{fmt(m.best)}</span>,
              )}
              {metricCell(m, "avgBest", fmt(m.avgBest))}
              {!compact && (
                <>
                  {metricCell(m, "avgAll", fmt(m.avgAll))}
                  {metricCell(m, "stdBest", num(m.stdBest, 3))}
                  {metricCell(m, "madBest", num(m.madBest, 3))}
                  {metricCell(m, "lapTimeDeg", num(m.lapTimeDeg, 3))}
                  <td>{num(m.cleanAirPct, 0)}%</td>
                  <td>{m.overtakes}</td>
                  <td className={m.zBest >= 0 ? "positive" : "negative"}>
                    {m.zBest >= 0 ? "+" : ""}
                    {num(m.zBest)}
                  </td>
                </>
              )}
              <td>
                <Distribution
                  m={m}
                  lo={classScales.get(m.className)?.[0] ?? m.best}
                  hi={classScales.get(m.className)?.[1] ?? m.best + 6}
                />
                {!compact && <TrackTimeline m={m} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function LapAnalysis({
  laps,
  drivers,
  driver,
  setDriver,
}: {
  laps: Lap[];
  drivers: string[];
  driver: string;
  setDriver: (x: string) => void;
}) {
  const usable = laps.filter((l) => l.lapTime !== null),
    cleanTimes = laps
      .filter((l) => l.clean && l.lapTime !== null)
      .map((l) => l.lapTime!),
    lo = cleanTimes.length
      ? Math.min(...cleanTimes)
      : Math.min(...usable.map((l) => l.lapTime!));
  return (
    <>
      <DriverSelect {...{ drivers, driver, setDriver }} />
      <div className="selectedCategory">
        <CarNumber number={laps[0]?.carNumber || "—"} />
        <CategoryBadge category={laps[0]?.category || "Unknown"} />{" "}
        {laps[0]?.proAm && <em className="proAm">LMP2 PRO/AM</em>}
      </div>
      <SectionTitle
        n="03"
        title="Lap-time trace"
        sub="Race lap against observed timing-line lap time"
      />
      <div className="scatter">
        <div className="lapYAxis">
          <b>LAP TIME</b>
          {[0, 1, 2, 3, 4, 5, 6].map((s) => (
            <span key={s} style={{ bottom: `${12 + (s / 6) * 78}%` }}>
              {fmt(lo + s, 1)}
            </span>
          ))}
        </div>
        {usable.map((l) => (
          <i
            key={l.id}
            title={`Lap ${l.lapNumber} · ${fmt(l.lapTime)}`}
            className={
              !l.green
                ? "caution"
                : l.pitIn || l.pitOut
                  ? "pit"
                  : l.cleanAir === false
                    ? "traffic"
                    : "clean"
            }
            style={{
              left: `${(l.lapNumber / Math.max(...usable.map((x) => x.lapNumber))) * 96 + 2}%`,
              bottom: `${Math.max(12, Math.min(90, ((l.lapTime! - lo) / 6) * 78 + 12))}%`,
            }}
          />
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="clean" />
          Clean air
        </span>
        <span>
          <i className="traffic" />
          Traffic
        </span>
        <span>
          <i className="pit" />
          Pit
        </span>
        <span>
          <i className="caution" />
          Non-green
        </span>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {[
                "LAP",
                "LAP TIME",
                "S1",
                "S2",
                "S3",
                "POS",
                "GAP AHEAD",
                "GAP BEHIND",
                "STATE",
                "CLEAN",
                "AIR",
                "PASSES",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {laps.map((l) => (
              <tr key={l.id}>
                <td>{l.lapNumber}</td>
                <td className="mono">{fmt(l.lapTime)}</td>
                <td>{fmt(l.s1)}</td>
                <td>{fmt(l.s2)}</td>
                <td>{fmt(l.s3)}</td>
                <td>P{l.position}</td>
                <td>{num(l.gapAhead ?? NaN)}s</td>
                <td>{num(l.gapBehind ?? NaN)}s</td>
                <td>
                  <span className={`state ${l.raceState}`}>{l.raceState}</span>
                </td>
                <td>{l.clean ? "YES" : "—"}</td>
                <td>
                  {l.cleanAir === null ? "—" : l.cleanAir ? "CLEAR" : "TRAFFIC"}
                </td>
                <td>{l.overtakes.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function DriverSelect({
  drivers,
  driver,
  setDriver,
}: {
  drivers: string[];
  driver: string;
  setDriver: (x: string) => void;
}) {
  return (
    <div className="driverSelect">
      <label>
        ANALYSED DRIVER
        <select value={driver} onChange={(e) => setDriver(e.target.value)}>
          {drivers.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
function EventPicker({
  events,
  selectedEvents,
  setSelectedEvents,
}: {
  events: string[];
  selectedEvents: string[];
  setSelectedEvents: (x: string[]) => void;
}) {
  return (
    <div className="eventPicker">
      <b>EVENTS INCLUDED</b>
      {events.map((event) => (
        <label key={event}>
          <input
            type="checkbox"
            checked={selectedEvents.includes(event)}
            onChange={() =>
              setSelectedEvents(
                selectedEvents.includes(event)
                  ? selectedEvents.filter((x) => x !== event)
                  : [...selectedEvents, event],
              )
            }
          />
          {event}
        </label>
      ))}
    </div>
  );
}
function Traffic({
  laps,
  allLaps,
  driver,
  drivers,
  setDriver,
}: {
  laps: Lap[];
  allLaps: Lap[];
  driver: string;
  drivers: string[];
  setDriver: (x: string) => void;
}) {
  const selectedCategory = laps[0]?.category,
    selectedClass = laps[0]?.className || "LMP2",
    { sample, yMin, yMax } = trafficSample(allLaps, selectedClass),
    selectedIds = new Set(laps.map(l => l.id)),
    green = sample.filter(l => selectedIds.has(l.id)),
    yPosition = (time: number) =>
      Math.max(4, Math.min(96, 4 + ((time - yMin) / (yMax - yMin || 1)) * 92)),
    ticks = Array.from(
      { length: Math.max(1, Math.floor(yMax - yMin) + 1) },
      (_, i) => Math.ceil(yMin) + i,
    ).filter((x) => x <= yMax),
    groups = [0, 1, 2, 3].map((n) => {
      const a = green
        .filter((l) =>
          n === 3 ? l.overtakes.length >= 3 : l.overtakes.length === n,
        )
        .map((l) => l.lapTime!);
      return { n, a };
    });
  const categoryTraffic = ["Platinum", "Gold", "Silver", "Bronze"]
    .filter((category) => allLaps.some((l) => l.category === category))
    .map((category) => ({
      category,
      groups: [0, 1, 2, 3].map((n) => {
        const a = sample
          .filter(
            (l) =>
              l.category === category &&
              (n === 3 ? l.overtakes.length >= 3 : l.overtakes.length === n),
          )
          .map((l) => l.lapTime!);
        return { n, a };
      }),
    }));
  const stdValues = [
    ...groups.map((g) => std(g.a)),
    ...categoryTraffic.flatMap((row) => row.groups.map((g) => std(g.a))),
  ].filter(Number.isFinite);
  const stdMax = Math.max(1, Math.ceil(Math.max(...stdValues, 1)));
  const stdPosition = (value: number) =>
    Math.max(4, Math.min(96, 4 + (value / stdMax) * 92));
  return (
    <>
      <DriverSelect {...{ drivers, driver, setDriver }} />
      <div className="selectedCategory">
        <CarNumber number={laps[0]?.carNumber || "—"} />
        <CategoryBadge category={laps[0]?.category || "Unknown"} />{" "}
        {laps[0]?.proAm && <em className="proAm">LMP2 PRO/AM</em>}
      </div>
      <SectionTitle
        n="04"
        title="Pace through traffic"
        sub="Valid green laps within 105% of each driver's own best clean lap; fixed class/event axis"
      />
      <div className="trafficOverlayLegend">
        <span>
          <i className="driverMeanLegend" />
          Selected driver mean
        </span>
        {categoryTraffic.map((row) => (
          <span key={row.category}>
            <i
              style={{
                background:
                  CONFIG.CATEGORY_COLOURS[
                    row.category as keyof typeof CONFIG.CATEGORY_COLOURS
                  ],
              }}
            />
            {row.category} mean
          </span>
        ))}
      </div>
      <div
        className="trafficChart"
        style={
          {
            "--traffic-lines": Math.max(1, ticks.length - 1),
          } as React.CSSProperties
        }
      >
        <div className="yAxis">
          <b>LAP TIME</b>
          {[...ticks].reverse().map((time) => (
            <span key={time} style={{ bottom: `${yPosition(time)}%` }}>
              {fmt(time, 1)}
            </span>
          ))}
        </div>
        {groups.map((g) => (
          <div className="trafficGroup" key={g.n}>
            <div className="range">
              {g.a.map((x, i) => (
                <i
                  key={i}
                  style={{
                    bottom: `${yPosition(x)}%`,
                  }}
                />
              ))}
              {g.a.length > 0 && (
                <b
                  title={`Mean ${fmt(mean(g.a))}`}
                  style={{ bottom: `${yPosition(mean(g.a))}%` }}
                />
              )}
              {categoryTraffic.map((row) => {
                const benchmark = row.groups.find((x) => x.n === g.n);
                const average = mean(benchmark?.a || []);
                return Number.isFinite(average) ? (
                  <em
                    className="categoryMeanLine"
                    key={row.category}
                    title={`${row.category} mean · ${fmt(average)} · N=${benchmark?.a.length || 0}`}
                    style={{
                      bottom: `${yPosition(average)}%`,
                      background:
                        CONFIG.CATEGORY_COLOURS[
                          row.category as keyof typeof CONFIG.CATEGORY_COLOURS
                        ],
                    }}
                  />
                ) : null;
              })}
            </div>
            <strong>{g.n === 3 ? "3+" : g.n}</strong>
            <span>OVERTAKES</span>
            <small
              className="lapSample"
              style={lapHeat(
                g.a.length,
                groups.map((x) => x.a.length),
              )}
            >
              N={g.a.length}
            </small>
          </div>
        ))}
      </div>
      <SectionTitle
        n="04S"
        title="Traffic consistency — standard deviation"
        sub="Same 0 / 1 / 2 / 3+ groups and the same 105% green-lap sample"
      />
      <div className="trafficOverlayLegend">
        <span>
          <i className="driverMeanLegend" />
          Selected driver STD
        </span>
        {categoryTraffic.map((row) => (
          <span key={row.category}>
            <i
              style={{
                background:
                  CONFIG.CATEGORY_COLOURS[
                    row.category as keyof typeof CONFIG.CATEGORY_COLOURS
                  ],
              }}
            />
            {row.category} STD
          </span>
        ))}
      </div>
      <div className="trafficStdChart">
        <div className="stdYAxis">
          <b>STD [s]</b>
          {Array.from({ length: stdMax + 1 }, (_, i) => i).map((tick) => (
            <span key={tick} style={{ bottom: `${stdPosition(tick)}%` }}>
              {tick.toFixed(1)}
            </span>
          ))}
        </div>
        {groups.map((g) => (
          <div className="stdGroup" key={g.n}>
            <div className="stdRange">
              {Number.isFinite(std(g.a)) && (
                <i
                  className="selectedStdLine"
                  title={`Selected driver STD ${num(std(g.a), 3)} s`}
                  style={{ bottom: `${stdPosition(std(g.a))}%` }}
                />
              )}
              {categoryTraffic.map((row) => {
                const sample = row.groups.find((x) => x.n === g.n)?.a || [];
                const value = std(sample);
                return Number.isFinite(value) ? (
                  <i
                    key={row.category}
                    title={`${row.category} STD ${num(value, 3)} s · N=${sample.length}`}
                    style={{
                      bottom: `${stdPosition(value)}%`,
                      background:
                        CONFIG.CATEGORY_COLOURS[
                          row.category as keyof typeof CONFIG.CATEGORY_COLOURS
                        ],
                    }}
                  />
                ) : null;
              })}
            </div>
            <strong>{g.n === 3 ? "3+" : g.n}</strong>
            <span>OVERTAKES</span>
          </div>
        ))}
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>OVERTAKES</th>
              <th>N</th>
              <th>MEAN</th>
              <th>MEDIAN</th>
              <th>MIN</th>
              <th>MAX</th>
              <th>σ</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.n}>
                <td>{g.n === 3 ? "3+" : g.n}</td>
                <td
                  className="lapCountCell"
                  style={lapHeat(
                    g.a.length,
                    groups.map((x) => x.a.length),
                  )}
                >
                  {g.a.length}
                </td>
                <td>{fmt(mean(g.a))}</td>
                <td>{fmt(median(g.a))}</td>
                <td>{fmt(Math.min(...g.a))}</td>
                <td>{fmt(Math.max(...g.a))}</td>
                <td>{num(std(g.a), 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle
        n="04A"
        title="Category traffic benchmark"
        sub={`${selectedClass} green laps within 105% of each driver's own best clean lap`}
      />
      <div className="tableWrap">
        <table className="categoryTrafficTable">
          <thead>
            <tr>
              <th>CATEGORY</th>
              <th>OVERTAKES</th>
              <th>N</th>
              <th>MEAN</th>
              <th>MIN</th>
              <th>MAX</th>
              <th>RANGE</th>
              <th>STD</th>
            </tr>
          </thead>
          <tbody>
            {categoryTraffic.flatMap((row) =>
              row.groups.map((g) => {
                const min = Math.min(...g.a),
                  max = Math.max(...g.a);
                return (
                  <tr key={`${row.category}-${g.n}`}>
                    <td>
                      <CategoryBadge category={row.category} />
                    </td>
                    <td>{g.n === 3 ? "3+" : g.n}</td>
                    <td>{g.a.length}</td>
                    <td>{fmt(mean(g.a))}</td>
                    <td>{fmt(min)}</td>
                    <td>{fmt(max)}</td>
                    <td>
                      {Number.isFinite(max - min)
                        ? `${(max - min).toFixed(3)} s`
                        : "—"}
                    </td>
                    <td>{num(std(g.a), 3)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
function DriverFocus({
  laps,
  events,
  selectedEvents,
  setSelectedEvents,
  driver,
  drivers,
  setDriver,
}: {
  laps: Lap[];
  events: string[];
  selectedEvents: string[];
  setSelectedEvents: (x: string[]) => void;
  driver: string;
  drivers: string[];
  setDriver: (x: string) => void;
}) {
  const eventLaps = laps.filter((l) => selectedEvents.includes(l.event));
  const metrics = driverMetrics(eventLaps, 20);
  const selected = metrics.find((m) => m.driver === driver) || metrics[0];
  if (!selected)
    return <EventPicker {...{ events, selectedEvents, setSelectedEvents }} />;
  const comparisonCategories = ["Gold", "Silver"].filter((c) =>
    metrics.some((m) => m.category === c),
  );
  const selectedLaps = eventLaps.filter(
    (l) =>
      l.driver === selected.driver &&
      l.green &&
      l.valid &&
      l.lapNumber > 1 &&
      l.lapTime !== null,
  );
  const noPass = selectedLaps
    .filter((l) => l.overtakes.length === 0)
    .map((l) => l.lapTime!);
  const withPass = selectedLaps
    .filter((l) => l.overtakes.length > 0)
    .map((l) => l.lapTime!);
  const rows = comparisonCategories.map((category) => {
    const peers = metrics.filter(
      (m) => m.category === category && m.className === "LMP2",
    );
    const top10 = [...peers].sort((a, b) => a.avgBest - b.avgBest).slice(0, 10);
    return {
      category,
      n: peers.length,
      categoryAverage: mean(peers.map((m) => m.avgBest)),
      top10Average: mean(top10.map((m) => m.avgBest)),
      fastest: Math.min(...peers.map((m) => m.avgBest)),
      fastestLapAverage: mean(peers.map((m) => m.best)),
      madAverage: mean(peers.map((m) => m.madBest)),
    };
  });
  const deltaText = (value: number) =>
    Number.isFinite(value)
      ? `${value >= 0 ? "+" : ""}${value.toFixed(3)} s`
      : "—";
  return (
    <>
      <DriverSelect {...{ drivers, driver: selected.driver, setDriver }} />
      <EventPicker {...{ events, selectedEvents, setSelectedEvents }} />
      <div className="focusHero">
        <div>
          <p className="eyebrow">DRIVER FOCUS · LMP2 BENCHMARK</p>
          <h2>
            <CarNumber number={selected.car} /> {selected.driver}{" "}
            <CategoryBadge category={selected.category} />
          </h2>
          <p>
            #{selected.car} · {selected.team}{" "}
            {selected.proAm && <em className="proAm">PRO/AM</em>}
          </p>
        </div>
        <div>
          <span>AVG BEST {selected.used}</span>
          <strong>{fmt(selected.avgBest)}</strong>
        </div>
      </div>
      <SectionTitle
        n="05A"
        title="Selected-event report"
        sub="The selected driver's performance in each loaded event"
      />
      <div className="tableWrap">
        <table className="focusEventTable">
          <thead>
            <tr>
              <th>METRIC</th>
              {selectedEvents.map((e) => (
                <th key={e}>{e}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Race — Best time", (m: DriverMetric) => fmt(m.best)],
              [
                "Race — Best position",
                (m: DriverMetric, all: DriverMetric[]) =>
                  `${all.sort((a, b) => a.best - b.best).findIndex((x) => x.driver === m.driver) + 1} / ${all.length}`,
              ],
              ["Race — Avg best 20", (m: DriverMetric) => fmt(m.avgBest)],
              [
                "Race — Avg all green",
                (_m: DriverMetric, _a: DriverMetric[], e: string) =>
                  fmt(
                    mean(
                      laps
                        .filter(
                          (l) =>
                            l.event === e &&
                            l.driver === selected.driver &&
                            l.green &&
                            l.valid &&
                            l.lapNumber > 1 &&
                            l.lapTime !== null,
                        )
                        .map((l) => l.lapTime!),
                    ),
                  ),
              ],
              ["Race — MAD best 20", (m: DriverMetric) => num(m.madBest, 3)],
            ].map(([label, render]) => (
              <tr key={String(label)}>
                <th>{String(label)}</th>
                {selectedEvents.map((e) => {
                  const all = driverMetrics(
                    laps.filter((l) => l.event === e && l.className === "LMP2"),
                    20,
                  );
                  const m = all.find((x) => x.driver === selected.driver);
                  return (
                    <td className={m ? "focusDriver" : ""} key={e}>
                      {m ? (render as any)(m, all, e) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle
        n="05B"
        title="Pace benchmark deltas"
        sub="Positive delta means the selected driver is slower than the benchmark"
      />
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>CATEGORY</th>
              <th>DRIVERS</th>
              <th>Δ VS CATEGORY AVG</th>
              <th>Δ VS TOP 10 AVG</th>
              <th>Δ VS FASTEST DRIVER</th>
              <th>Δ VS AVG FASTEST LAP</th>
              <th>MAD Δ VS CATEGORY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>
                  <CategoryBadge category={r.category} />
                </td>
                <td>{r.n}</td>
                <td>{deltaText(selected.avgBest - r.categoryAverage)}</td>
                <td>{deltaText(selected.avgBest - r.top10Average)}</td>
                <td>{deltaText(selected.avgBest - r.fastest)}</td>
                <td>{deltaText(selected.best - r.fastestLapAverage)}</td>
                <td>{deltaText(selected.madBest - r.madAverage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle
        n="05C"
        title="Traffic pace summary"
        sub="All valid green-flag laps; yellow/SC/FCY/red excluded"
      />
      <div className="focusCards">
        <div>
          <span>ZERO PASSES</span>
          <strong>{fmt(mean(noPass))}</strong>
          <small
            className="lapSample"
            style={lapHeat(noPass.length, [noPass.length, withPass.length])}
          >
            N={noPass.length} green laps
          </small>
        </div>
        <div>
          <span>WITH PASSES</span>
          <strong>{fmt(mean(withPass))}</strong>
          <small
            className="lapSample"
            style={lapHeat(withPass.length, [noPass.length, withPass.length])}
          >
            N={withPass.length} green laps
          </small>
        </div>
        <div>
          <span>OBSERVED TRAFFIC DELTA</span>
          <strong>{deltaText(mean(withPass) - mean(noPass))}</strong>
          <small>Association, not causal loss</small>
        </div>
        <div>
          <span>CLEAN-AIR RATE</span>
          <strong>{num(selected.cleanAirPct, 0)}%</strong>
          <small>
            {selected.cleanAir} / {selected.clean} laps
          </small>
        </div>
      </div>
    </>
  );
}
function SeasonSummary({
  laps,
  events,
  selectedEvents,
  setSelectedEvents,
  driver,
  drivers,
  setDriver,
}: {
  laps: Lap[];
  events: string[];
  selectedEvents: string[];
  setSelectedEvents: (x: string[]) => void;
  driver: string;
  drivers: string[];
  setDriver: (x: string) => void;
}) {
  const [seasonSection, setSeasonSection] = useState<"events" | "driver" | "comparison">(
    "events",
  );
  const [seasonClass, setSeasonClass] = useState("All");
  const [seasonCategories, setSeasonCategories] = useState<string[]>([
    "Platinum",
    "Gold",
    "Silver",
    "Bronze",
    "Unknown",
  ]);
  const [seasonMetric, setSeasonMetric] = useState<
    "best" | "best20" | "avg10" | "avg20"
  >("best");
  const [plot110Filter, setPlot110Filter] = useState(false);
  const [plotPercent, setPlotPercent] = useState(110);
  const [excludedByEvent, setExcludedByEvent] = useState<Record<string,string[]>>({});
  const [lapCounts,setLapCounts]=useState<SeasonLapCounts>({});
  const [exclusionEvent,setExclusionEvent]=useState("");
  const editEvent=selectedEvents.includes(exclusionEvent)?exclusionEvent:selectedEvents[0]||"";
  const toggleExcluded=(event:string,name:string)=>setExcludedByEvent(prev=>{
    const names=prev[event]||[];return {...prev,[event]:names.includes(name)?names.filter(n=>n!==name):[...names,name]};
  });
  const [benchmarkLines, setBenchmarkLines] = useState<string[]>(["Gold avg", "Silver avg", "Gold top 10", "Silver top 10"]);
  const classes = ["All", ...new Set(laps.map((l) => l.className))];
  const categories = ["Platinum", "Gold", "Silver", "Bronze", "Unknown"].filter(
    (x) => laps.some((l) => l.category === x),
  );
  const metricValue = (m: DriverMetric) =>
    seasonMetric === "best"
      ? m.best
      : seasonMetric === "best20"
        ? m.bestTimes[Math.min(19, m.bestTimes.length - 1)]
        : seasonMetric === "avg10"
          ? mean(m.times.slice(0, 10))
          : m.avgBest;
  const metricLabel =
    seasonMetric === "best"
      ? "BEST RACE LAP"
      : seasonMetric === "best20"
        ? "20TH BEST LAP"
        : seasonMetric === "avg10"
          ? "BEST 10 AVG"
          : "BEST N AVG (ROUND SAMPLE)";
  const effectiveExclusions:Record<string,string[]>={};
  for(const event of selectedEvents){
    const eventLaps=laps.filter(l=>l.event===event);
    const best=Math.min(...eventLaps.filter(l=>l.valid&&l.lapTime!==null&&Number.isFinite(l.lapTime)&&l.lapTime>0).map(l=>l.lapTime!));
    const cut=plot110Filter?summaryDriverMetrics(eventLaps,lapCounts).filter(m=>metricValue(m)>best*plotPercent/100).map(m=>m.driver):[];
    const categoryExcluded=eventLaps.filter(l=>!seasonCategories.includes(l.category)&&l.driver!==driver).map(l=>l.driver);
    effectiveExclusions[event]=[...new Set([...(excludedByEvent[event]||[]),...cut,...categoryExcluded])];
  }
  return (
    <>
      <DriverSelect {...{ drivers, driver, setDriver }} />
      <EventPicker {...{ events, selectedEvents, setSelectedEvents }} />
      <div className="seasonTabs">
        <details><summary>ROUND SAMPLE · 10 / 20 LAPS</summary>
          <p>Shared by Driver Summary, Focus and Comparison Drivers Season. Top 10 Gold/Silver still means ten drivers.</p>
          {selectedEvents.map(event=><label key={event} style={{display:"block"}}>{event} <button onClick={()=>setLapCounts(prev=>({...prev,[event]:summaryLapCount(event,prev)===20?10:20}))}>Best {summaryLapCount(event,lapCounts)} laps · click to switch</button></label>)}
        </details>
        <details><summary>MANUAL DRIVER EXCLUSIONS · PER EVENT</summary>
          <select aria-label="Exclusion event" value={editEvent} onChange={e=>setExclusionEvent(e.target.value)}>{selectedEvents.map(event=><option key={event}>{event}</option>)}</select>
          <button onClick={()=>setExcludedByEvent(prev=>({...prev,[editEvent]:[]}))}>Restore drivers in this event</button>
          <p>Exclusions apply only to the chosen event. Absolute cutoff references stay fixed.</p>
          <div className="categoryTicks">{[...new Set(laps.filter(l=>l.event===editEvent).map(l=>l.driver))].sort().map(name=><label key={name}>
            <input type="checkbox" checked={!(excludedByEvent[editEvent]||[]).includes(name)} onChange={()=>toggleExcluded(editEvent,name)}/>{name}
          </label>)}</div>
        </details>
        <button
          className={seasonSection === "events" ? "active" : ""}
          onClick={() => setSeasonSection("events")}
        >
          EVENTS COMPARISON
        </button>
        <button
          className={seasonSection === "driver" ? "active" : ""}
          onClick={() => setSeasonSection("driver")}
        >
          DRIVER SUMMARY
        </button>
        <button className={seasonSection==="comparison"?"active":""} onClick={()=>setSeasonSection("comparison")}>COMPARISON DRIVERS SEASON</button>
      </div>
      {seasonSection === "events" && (
        <>
          <div className="seasonControls">
            <label>
              CLASS
              <select
                value={seasonClass}
                onChange={(e) => setSeasonClass(e.target.value)}
              >
                {classes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <fieldset className="categoryTicks">
              <legend>DRIVER CATEGORY</legend>
              <label>
                <input
                  type="checkbox"
                  checked={categories.every((x) =>
                    seasonCategories.includes(x),
                  )}
                  onChange={() =>
                    setSeasonCategories(
                      categories.every((x) => seasonCategories.includes(x))
                        ? []
                        : categories,
                    )
                  }
                />
                All
              </label>
              {categories.map((x) => (
                <label key={x}>
                  <input
                    type="checkbox"
                    checked={seasonCategories.includes(x)}
                    onChange={() =>
                      setSeasonCategories(
                        seasonCategories.includes(x)
                          ? seasonCategories.filter((c) => c !== x)
                          : [...seasonCategories, x],
                      )
                    }
                  />
                  {x}
                </label>
              ))}
            </fieldset>
            <label>
              DISPLAY
              <select
                value={seasonMetric}
                onChange={(e) =>
                  setSeasonMetric(
                    e.target.value as "best" | "best20" | "avg10" | "avg20",
                  )
                }
              >
                <option value="best">Best race lap</option>
                <option value="best20">Best 20 laps (20th lap)</option>
                <option value="avg10">Best average 10 laps</option>
                <option value="avg20">Best average N laps (round sample)</option>
              </select>
            </label>
            <label className="plotFilterToggle">
              PLOT FILTER
              <span>
                <input
                  type="checkbox"
                  checked={plot110Filter}
                  onChange={(e) => setPlot110Filter(e.target.checked)}
                />
                Exclude above <input aria-label="Season cutoff percentage" type="number" min="100" step="0.5" value={plotPercent}
                  onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=100)setPlotPercent(n);}} />% of absolute session best lap (ignores display filters)
              </span>
            </label>
            <fieldset className="categoryTicks"><legend>REFERENCE LINES</legend>
              {["Gold avg", "Silver avg", "Gold top 10", "Silver top 10"].map(name=><label key={name}>
                <input type="checkbox" checked={benchmarkLines.includes(name)} onChange={()=>setBenchmarkLines(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name])}/>{name}
              </label>)}
            </fieldset>
          </div>
          <SectionTitle
            n="06"
            title="Season pace summary"
            sub="One compact ranking per selected event; analysed driver highlighted in pink"
          />
          <div className="seasonGrid">
            {selectedEvents.map((event) => {
              const excludedSeasonDrivers=excludedByEvent[event]||[];
              const rows = summaryDriverMetrics(
                laps.filter(
                  (l) =>
                    l.event === event &&
                    (seasonClass === "All" || l.className === seasonClass) &&
                    (seasonCategories.includes(l.category) || l.driver === driver),
                ),
                lapCounts,
              ).sort((a, b) => metricValue(a) - metricValue(b));
              const fastest=Math.min(...laps.filter(l=>l.event===event && l.valid && l.lapTime!==null && Number.isFinite(l.lapTime) && l.lapTime>0).map(l=>l.lapTime!));
              const discarded=(m:DriverMetric)=>excludedSeasonDrivers.includes(m.driver) || (plot110Filter && metricValue(m)>fastest*plotPercent/100);
              const includedRows=rows.filter(m=>!excludedSeasonDrivers.includes(m.driver));
              return (
                <div className="seasonEvent" key={event}>
                  <h3>{event}</h3>
                  <SeasonPaceChart
                    rows={rows}
                    excludedDrivers={excludedSeasonDrivers}
                    driver={driver}
                    value={metricValue}
                    label={metricLabel}
                    cutoff110={plot110Filter}
                    percent={plotPercent}
                    absoluteBest={fastest}
                    benchmarkLines={benchmarkLines}
                  />
                  <SeasonCategoryMini
                    rows={includedRows}
                    driver={driver}
                    value={metricValue}
                    cutoff110={plot110Filter}
                    percent={plotPercent}
                    absoluteBest={fastest}
                  />
                  <table>
                    <thead>
                      <tr>
                        <th>USE / #</th>
                        <th>DRIVER</th>
                        <th>{metricLabel}</th>
                        <th>LAPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m, i) => (
                        <tr
                          className={`${m.driver === driver ? "focusDriver" : ""} ${discarded(m)?"seasonDiscarded":""}`}
                          title={excludedSeasonDrivers.includes(m.driver)?"Manually excluded":discarded(m)?`Discarded from plot and benchmarks: above ${plotPercent}%`:undefined}
                          key={m.key}
                        >
                          <td><input type="checkbox" aria-label={`Include ${m.driver} in season comparisons`} checked={!excludedSeasonDrivers.includes(m.driver)}
                            onChange={()=>toggleExcluded(event,m.driver)}/>{i + 1}</td>
                          <td
                            className="categoryDriverCell"
                            style={{
                              background:
                                CONFIG.CATEGORY_COLOURS[
                                  m.category as keyof typeof CONFIG.CATEGORY_COLOURS
                                ] || CONFIG.CATEGORY_COLOURS.Unknown,
                            }}
                          >
                            <CarNumber number={m.car} /> {m.driver}{discarded(m) && " · EXCLUDED"}
                          </td>
                          <td>{fmt(metricValue(m))}</td>
                          <td
                            className="lapCountCell"
                            style={lapHeat(
                              m.total,
                              rows.map((x) => x.total),
                            )}
                          >
                            {m.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
      {seasonSection === "driver" && (
        <GeneralDriverSummary
          laps={laps.filter(l=>!(effectiveExclusions[l.event]||[]).includes(l.driver))}
          events={selectedEvents}
          driver={driver}
          className={seasonClass}
          lapCounts={lapCounts}
          toggleLapCount={event=>setLapCounts(prev=>({...prev,[event]:summaryLapCount(event,prev)===20?10:20}))}
        />
      )}
      {seasonSection === "comparison" && <SeasonAggregate laps={laps} events={selectedEvents} driver={driver} excluded={effectiveExclusions} className={seasonClass} lapCounts={lapCounts} shownCategories={seasonCategories} setShownCategories={setSeasonCategories} comparison/>}
      {seasonSection === "events" && <>
        <SectionTitle n="07" title="Driver vs Gold / Silver — event summary"
          sub="Absolute best N pace: 10/20 selected per round, full sample required. Shared driver exclusions apply. STD: green laps, no pit-in/out, at most 105% of the absolute event/session/car-class best."/>
        <div className="seasonGrid">
          {selectedEvents.map(event=><SeasonDriverComparison key={event} event={event} laps={laps} driver={driver}
            excludedDrivers={effectiveExclusions[event]||[]}
            lapCounts={lapCounts}
            />)}
        </div>
        <SeasonAggregate laps={laps} events={selectedEvents} driver={driver} excluded={effectiveExclusions} className={seasonClass} lapCounts={lapCounts} shownCategories={seasonCategories} setShownCategories={setSeasonCategories}/>
      </>}
    </>
  );
}
function SeasonDriverComparison({event,laps,driver,excludedDrivers,lapCounts}:{
  event:string;laps:Lap[];driver:string;excludedDrivers:string[];lapCounts:SeasonLapCounts;
}) {
  const metrics=useMemo(()=>absoluteSummaryDrivers(laps.filter(l=>l.event===event),lapCounts),[laps,event,lapCounts]);
  const selected=metrics.find(m=>m.driver===driver && !excludedDrivers.includes(m.driver));
  const targetClass=selected?.className;
  const peers=metrics.filter(m=>m.className===targetClass && !excludedDrivers.includes(m.driver));
  const count=summaryLapCount(event,lapCounts);
  const rows=seasonComparison(selected,peers,count);
  const deltaCell=(value:number)=><td style={Number.isFinite(value)?{
    backgroundColor:value<0?"#d8ecd2":value>0?"#f3cece":"#edf0f2",
    color:value<0?"#24662c":value>0?"#a32626":"#334155",fontWeight:700,
  }:undefined}>{Number.isFinite(value)?`${value>0?"+":""}${value.toFixed(3)} s`:"—"}</td>;
  return <div className="seasonEvent"><div className="tableWrap"><table aria-label={`${event} selected driver versus Gold and Silver`}>
    <thead><tr><th>{event.toUpperCase()}</th><th>{selected && <CarNumber number={selected.car}/>} {driver || "SELECT DRIVER"}</th><th>Gold</th><th>Delta Gold</th><th>Silver</th><th>Delta Silver</th></tr></thead>
    <tbody>{rows.map(row=>{
      const format=(value:number)=>row.spread?Number.isFinite(value)?`${value.toFixed(3)} s`:"—":fmt(value);
      return <tr key={row.label}><th scope="row">{row.label}</th><td>{format(row.value)}</td>
        <td title={`N=${row.gold.count}`}>{format(row.gold.value)}</td>{deltaCell(row.gold.delta)}
        <td title={`N=${row.silver.count}`}>{format(row.silver.value)}</td>{deltaCell(row.silver.delta)}</tr>;
    })}</tbody>
  </table></div><small>{targetClass || "Driver not present in this event/class"} · Best {count} sample: {selected?.used ?? 0} laps.
    Total valid timed laps: {selected?.total ?? 0}. Pace: absolute, no flag/pit/percentage filters. STD: green laps only, no pit-in/out, ≤105% of the event/session/car-class absolute best. Fewer than {count} laps: AVG {count} unavailable.</small></div>;
}
function SeasonCategoryMini({
  rows,
  driver,
  value,
  cutoff110,
  percent,
  absoluteBest,
}: {
  rows: DriverMetric[];
  driver: string;
  value: (m: DriverMetric) => number;
  cutoff110: boolean;
  percent: number;
  absoluteBest: number;
}) {
  const finite = rows.filter((m) => Number.isFinite(value(m)));
  const first = Math.min(...finite.map(value));
  const visible = finite.filter(
    (m) => !cutoff110 || value(m) <= absoluteBest * percent/100,
  );
  const selected = visible.find((m) => m.driver === driver);
  const categories = ["Platinum", "Gold", "Silver", "Bronze"].filter((c) =>
    visible.some((m) => m.category === c),
  );
  const delta = selected ? value(selected) - first : NaN;
  const benchmarks = [
    ...categories.map(category => ({ category, label: `${category.toUpperCase()} AVG`, top10: false })),
    ...["Gold", "Silver"].map(category => ({ category, label: `TOP 10 ${category.toUpperCase()} AVG`, top10: true })),
  ].map(benchmark => {
    const all = visible.filter(m => m.category === benchmark.category).sort((a,b) => value(a)-value(b));
    const group = benchmark.top10 ? all.slice(0,10) : all;
    return { ...benchmark, count: group.length, average: mean(group.map(value)) };
  });
  const deltaLabel = (n: number) => Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(3)} s` : "—";
  return (
    <table className="seasonCategoryMini">
      <thead>
        <tr>
          {benchmarks.map((benchmark) => (
            <th key={benchmark.label}>{benchmark.label}</th>
          ))}
          <th>SELECTED DELTA TO P1</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          {benchmarks.map((benchmark) => {
            return (
              <td
                key={benchmark.label}
                style={{
                  borderTopColor:
                    CONFIG.CATEGORY_COLOURS[
                      benchmark.category as keyof typeof CONFIG.CATEGORY_COLOURS
                    ],
                }}
                title={`N=${benchmark.count}${benchmark.top10 ? "; up to 10 fastest eligible drivers for the selected display metric" : ""}`}
              >
                {fmt(benchmark.average)} <small>N={benchmark.count}</small>
              </td>
            );
          })}
          <td className={delta <= 0 ? "summaryBetter" : "summaryWorse"}>
            {Number.isFinite(delta)
              ? `+${delta.toFixed(3)} s`
              : "EXCLUDED / NO DATA"}
          </td>
        </tr>
        <tr aria-label="Selected driver deltas to category benchmarks">
          {benchmarks.map(benchmark => {
            const difference = selected ? value(selected)-benchmark.average : NaN;
            return <td key={benchmark.label} className={Number.isFinite(difference) ? difference <= 0 ? "summaryBetter" : "summaryWorse" : ""}
              title={selected ? `${selected.driver} minus ${benchmark.label}` : "Selected driver excluded or no data"}>
              <small>DRIVER Δ</small> {deltaLabel(difference)}
            </td>;
          })}
          <td><small>{selected?.driver || "EXCLUDED / NO DATA"}</small></td>
        </tr>
      </tbody>
    </table>
  );
}
function GeneralDriverSummary({
  laps,
  events,
  driver,
  className,
  lapCounts,
  toggleLapCount,
}: {
  laps: Lap[];
  events: string[];
  driver: string;
  className: string;
  lapCounts: SeasonLapCounts;
  toggleLapCount: (event:string)=>void;
}) {
  const [summaryClass, setSummaryClass] = useState(className);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "vsGoldAvg",
    "vsSilverAvg",
    "vsGoldTop10",
    "vsSilverTop10",
    "madGold",
    "madSilver",
  ]);
  const delta = (n: number) =>
    Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(3)} s` : "—";
  const trafficLoss = (event: string, name: string, targetClass?: string) => {
    const sample = laps.filter(
      (l) =>
        l.event === event &&
        l.driver === name &&
        (!targetClass || l.className === targetClass) &&
        l.green &&
        l.valid &&
        l.lapNumber > 1 &&
        l.lapTime !== null,
    );
    const zero = sample
      .filter((l) => !l.overtakes.length)
      .map((l) => l.lapTime!);
    const traffic = sample
      .filter((l) => l.overtakes.length > 0)
      .map((l) => l.lapTime!);
    return mean(traffic) - mean(zero);
  };
  const trafficAverage = (
    event: string,
    name: string,
    overtakes: number,
    targetClass?: string,
  ) =>
    mean(
      laps
        .filter(
          (l) =>
            l.event === event &&
            l.driver === name &&
            (!targetClass || l.className === targetClass) &&
            l.green &&
            l.valid &&
            l.lapNumber > 1 &&
            l.lapTime !== null &&
            l.overtakes.length === overtakes,
        )
        .map((l) => l.lapTime!),
    );
  const rows = events.map((event) => {
    const eventLaps = laps.filter((l) => l.event === event);
    const driverClass = eventLaps.find((l) => l.driver === driver)?.className;
    const targetClass = summaryClass === "All" ? driverClass : summaryClass;
    const all = summaryDriverMetrics(
      eventLaps.filter((l) => l.className === targetClass),
      lapCounts,
    );
    const selected = all.find((m) => m.driver === driver);
    const group = (cat: string) => all.filter((m) => m.category === cat);
    const avg = (cat: string) => mean(group(cat).map((m) => m.avgBest).filter(Number.isFinite).sort((a,b)=>a-b));
    const top = (cat: string) =>
      mean(
        group(cat)
          .filter(m=>Number.isFinite(m.avgBest))
          .sort((a, b) => a.avgBest - b.avgBest)
          .slice(0, 10)
          .map((m) => m.avgBest),
      );
    return { event, selected, all, group, avg, top, targetClass };
  });
  const selectedLap = laps.find(
    (l) => l.driver === driver && events.includes(l.event),
  );
  const metricDefs: {
    id: string;
    label: string;
    group: string;
    delta?: boolean;
    value: (r: (typeof rows)[number]) => number;
  }[] = [
    {
      id: "best",
      label: "Best lap",
      group: "PACE",
      value: (r) => r.selected?.best ?? NaN,
    },
    {
      id: "avg10",
      label: "Best 10 avg",
      group: "PACE",
      value: (r) => r.selected?.absoluteAvg10 ?? NaN,
    },
    {
      id: "avg20",
      label: "Absolute best N avg (round sample)",
      group: "PACE",
      value: (r) => r.selected?.avgBest ?? NaN,
    },
    {
      id: "avgClean",
      label: "All clean avg",
      group: "PACE",
      value: (r) => r.selected?.avgAll ?? NaN,
    },
    {
      id: "std",
      label: "STD best 20",
      group: "CONSISTENCY",
      value: (r) => r.selected?.stdBest ?? NaN,
    },
    {
      id: "mad",
      label: "MAD best 20",
      group: "CONSISTENCY",
      value: (r) => r.selected?.madBest ?? NaN,
    },
    {
      id: "laps",
      label: "All laps",
      group: "SAMPLE",
      value: (r) => r.selected?.total ?? NaN,
    },
    {
      id: "cleanAir",
      label: "Clean-air %",
      group: "TRAFFIC",
      value: (r) => r.selected?.cleanAirPct ?? NaN,
    },
    {
      id: "overtakes",
      label: "Overtakes",
      group: "TRAFFIC",
      value: (r) => r.selected?.overtakes ?? NaN,
    },
    {
      id: "zScore",
      label: "Category Z",
      group: "PACE",
      value: (r) => r.selected?.zBest ?? NaN,
    },
    {
      id: "vsGoldAvg",
      label: "vs Gold avg",
      group: "CATEGORY AVG",
      delta: true,
      value: (r) => (r.selected ? r.selected.avgBest - r.avg("Gold") : NaN),
    },
    {
      id: "vsSilverAvg",
      label: "vs Silver avg",
      group: "CATEGORY AVG",
      delta: true,
      value: (r) => (r.selected ? r.selected.avgBest - r.avg("Silver") : NaN),
    },
    {
      id: "vsGoldTop10",
      label: "vs Top-10 Gold",
      group: "TOP 10",
      delta: true,
      value: (r) => (r.selected ? r.selected.avgBest - r.top("Gold") : NaN),
    },
    {
      id: "vsSilverTop10",
      label: "vs Top-10 Silver",
      group: "TOP 10",
      delta: true,
      value: (r) => (r.selected ? r.selected.avgBest - r.top("Silver") : NaN),
    },
    {
      id: "fastGold",
      label: "vs Fastest Gold",
      group: "FASTEST",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.avgBest -
            Math.min(...r.group("Gold").map((m) => m.avgBest).filter(Number.isFinite))
          : NaN,
    },
    {
      id: "fastSilver",
      label: "vs Fastest Silver",
      group: "FASTEST",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.avgBest -
            Math.min(...r.group("Silver").map((m) => m.avgBest).filter(Number.isFinite))
          : NaN,
    },
    {
      id: "stdGold",
      label: "STD vs Gold",
      group: "CONSISTENCY",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.stdBest - mean(r.group("Gold").map((m) => m.stdBest))
          : NaN,
    },
    {
      id: "stdSilver",
      label: "STD vs Silver",
      group: "CONSISTENCY",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.stdBest - mean(r.group("Silver").map((m) => m.stdBest))
          : NaN,
    },
    {
      id: "madGold",
      label: "MAD vs Gold",
      group: "CONSISTENCY",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.madBest - mean(r.group("Gold").map((m) => m.madBest))
          : NaN,
    },
    {
      id: "madSilver",
      label: "MAD vs Silver",
      group: "CONSISTENCY",
      delta: true,
      value: (r) =>
        r.selected
          ? r.selected.madBest - mean(r.group("Silver").map((m) => m.madBest))
          : NaN,
    },
    {
      id: "traffic",
      label: "Traffic loss",
      group: "TRAFFIC",
      delta: true,
      value: (r) => trafficLoss(r.event, driver, r.targetClass),
    },
    ...[0, 1, 2, 3].flatMap((count) => [
      {
        id: `trafficAvg${count}`,
        label: `Avg ${count} overtake${count === 1 ? "" : "s"}`,
        group: "TRAFFIC BY OVERTAKES",
        value: (r: (typeof rows)[number]) =>
          trafficAverage(r.event, driver, count, r.targetClass),
      },
      {
        id: `trafficGold${count}`,
        label: `${count} OT vs Gold`,
        group: "TRAFFIC VS CATEGORY",
        delta: true,
        value: (r: (typeof rows)[number]) =>
          trafficAverage(r.event, driver, count, r.targetClass) -
          mean(
            r
              .group("Gold")
              .map((m) =>
                trafficAverage(r.event, m.driver, count, r.targetClass),
              ),
          ),
      },
      {
        id: `trafficSilver${count}`,
        label: `${count} OT vs Silver`,
        group: "TRAFFIC VS CATEGORY",
        delta: true,
        value: (r: (typeof rows)[number]) =>
          trafficAverage(r.event, driver, count, r.targetClass) -
          mean(
            r
              .group("Silver")
              .map((m) =>
                trafficAverage(r.event, m.driver, count, r.targetClass),
              ),
          ),
      },
    ]),
    {
      id: "trafficGold",
      label: "Traffic vs Gold",
      group: "TRAFFIC",
      delta: true,
      value: (r) =>
        trafficLoss(r.event, driver, r.targetClass) -
        mean(
          r
            .group("Gold")
            .map((m) => trafficLoss(r.event, m.driver, r.targetClass)),
        ),
    },
    {
      id: "trafficSilver",
      label: "Traffic vs Silver",
      group: "TRAFFIC",
      delta: true,
      value: (r) =>
        trafficLoss(r.event, driver, r.targetClass) -
        mean(
          r
            .group("Silver")
            .map((m) => trafficLoss(r.event, m.driver, r.targetClass)),
        ),
    },
  ];
  const active = metricDefs.filter((m) => selectedMetrics.includes(m.id));
  const classes = ["All", ...new Set(laps.map((l) => l.className))];
  return (
    <div className="driverSummarySection">
      <div className="focusModalHeader">
        <h2>
          <CarNumber number={selectedLap?.carNumber || "—"} /> {driver} —
          GENERAL SUMMARY
        </h2>
        <label>
          CLASS{" "}
          <select
            value={summaryClass}
            onChange={(e) => setSummaryClass(e.target.value)}
          >
            {classes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="metricPicker">
        {metricDefs.map((m) => (
          <button
            key={m.id}
            className={selectedMetrics.includes(m.id) ? "active" : ""}
            onClick={() =>
              setSelectedMetrics(
                selectedMetrics.includes(m.id)
                  ? selectedMetrics.filter((x) => x !== m.id)
                  : [...selectedMetrics, m.id],
              )
            }
          >
            <span>{m.group}</span>
            {m.label}
          </button>
        ))}
      </div>
      <div className="tableWrap">
        <table className="generalSummary">
          <thead>
            <tr>
              <th>EVENT</th>
              {active.map((m) => (
                <th key={m.id}>
                  <small>{m.group}</small>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.event}>
                <th>{r.event}<br/><button onClick={()=>toggleLapCount(r.event)}>Best {summaryLapCount(r.event,lapCounts)} laps ↔</button></th>
                {r.selected ? (
                  active.map((m) => {
                    const v = m.value(r);
                    return (
                      <td
                        key={m.id}
                        className={
                          m.delta
                            ? v <= 0
                              ? "summaryBetter"
                              : "summaryWorse"
                            : ""
                        }
                      >
                        {m.delta
                          ? delta(v)
                          : ["laps", "overtakes"].includes(m.id)
                            ? num(v, 0)
                            : m.id === "cleanAir"
                              ? `${num(v, 0)}%`
                              : m.id === "zScore"
                                ? num(v, 2)
                                : fmt(v)}
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={Math.max(1, active.length)}>NO DATA</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function SeasonPaceChart({
  rows,
  driver,
  value,
  label,
  cutoff110,
  percent,
  absoluteBest,
  benchmarkLines,
  excludedDrivers,
}: {
  rows: DriverMetric[];
  driver: string;
  value: (m: DriverMetric) => number;
  label: string;
  cutoff110: boolean;
  percent: number;
  absoluteBest: number;
  benchmarkLines: string[];
  excludedDrivers: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [manualY,setManualY]=useState(false);
  const [minInput,setMinInput]=useState("");
  const [maxInput,setMaxInput]=useState("");
  const parseAxis=(s:string)=>{const parts=s.trim().split(":").map(Number);return !s.trim()||parts.some(n=>!Number.isFinite(n))||parts.length>2?NaN:parts.length===2?parts[0]*60+parts[1]:parts[0];};
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) =>
      e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const finite = rows.filter((m) => Number.isFinite(value(m)));
  const valid = finite.filter(
    (m) => !excludedDrivers.includes(m.driver) && (!cutoff110 || value(m) <= absoluteBest * percent/100),
  );
  if (!finite.length) return null;
  const values = finite.map(value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const tickStep = 0.3;
  const requestedMin=parseAxis(minInput),requestedMax=parseAxis(maxInput);
  const validManual=manualY&&requestedMin>=0&&requestedMax>requestedMin&&requestedMax-requestedMin<=600;
  const y0 = validManual?requestedMin:Math.floor(lo / tickStep) * tickStep;
  const y1 = validManual?requestedMax:Math.max(y0 + tickStep, Math.ceil(hi / tickStep) * tickStep);
  const yTicks = Array.from(
    { length: Math.max(0,Math.floor(y1/tickStep)-Math.ceil(y0/tickStep)+1) },
    (_, i) => (Math.ceil(y0/tickStep)+i) * tickStep,
  );
  const h = 210;
  const top = 14;
  const bottom = 54;
  const plotH = h - top - bottom;
  const y = (n: number) => top + ((y1 - n) / (y1 - y0 || 1)) * plotH;
  const benchmark = (category: string, top10 = false) => {
    let group = valid.filter((m) => m.category === category);
    if (top10)
      group = [...group].sort((a, b) => value(a) - value(b)).slice(0, 10);
    return mean(group.map(value));
  };
  const lines = [
    ["Gold avg", benchmark("Gold"), "#e5a900", ""],
    ["Gold top 10", benchmark("Gold", true), "#e5a900", "4 3"],
    ["Silver avg", benchmark("Silver"), "#737b83", ""],
    ["Silver top 10", benchmark("Silver", true), "#363b40", "2 3"],
  ].filter(([name])=>benchmarkLines.includes(String(name))) as [string, number, string, string][];
  const width = Math.max(520, finite.length * 22 + 58);
  const plotW = width - 48;
  const barW = Math.max(5, Math.min(13, plotW / finite.length - 4));
  return (
    <div className={`seasonChartWrap ${expanded ? "expanded" : ""}`}>
      <div className="seasonChartHeader">
        <b>{label}</b>
        <label><input type="checkbox" checked={manualY} onChange={e=>{setManualY(e.target.checked);if(!minInput)setMinInput(fmt(y0));if(!maxInput)setMaxInput(fmt(y1));}}/> Manual Y</label>
        {manualY&&<span><input aria-label="Minimum lap time" placeholder="m:ss.000" value={minInput} onChange={e=>setMinInput(e.target.value)} style={{width:95}}/> – <input aria-label="Maximum lap time" placeholder="m:ss.000" value={maxInput} onChange={e=>setMaxInput(e.target.value)} style={{width:95}}/>{!validManual&&<small role="status">Enter min &lt; max (m:ss.000); using auto range.</small>}</span>}
        {cutoff110 && (
          <small className="cutoffAudit">
            BENCHMARK N={valid.length}/{finite.length} · RECALCULATED
          </small>
        )}
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "CLOSE ×" : "EXPAND ↗"}
        </button>
      </div>
      <svg viewBox={`0 0 ${width} ${h}`} style={{ minWidth: width }}>
        {yTicks.map((time, i) => {
          return (
            <g key={i}>
              <line
                x1="44"
                x2={width}
                y1={y(time)}
                y2={y(time)}
                className="chartGrid"
              />
              <text x="40" y={y(time) + 3} textAnchor="end">
                {fmt(time, 3)}
              </text>
            </g>
          );
        })}
        {lines.map(
          ([name, n, colour, dash]) =>
            Number.isFinite(n) && n>=y0 && n<=y1 && (
              <g key={name}>
                <line
                  x1="44"
                  x2={width}
                  y1={y(n)}
                  y2={y(n)}
                  stroke={colour}
                  strokeWidth="1.5"
                  strokeDasharray={dash}
                />
                <title>
                  {name}: {fmt(n)}
                </title>
              </g>
            ),
        )}
        {finite.map((m, i) => {
          const discarded=!valid.includes(m);
          const x = 48 + (i * plotW) / finite.length;
          const barTop = Math.max(top,Math.min(top+plotH,y(value(m))));
          const colour =
            discarded ? "#651f2b" : m.driver === driver
              ? "#ef2ac1"
              : CONFIG.CATEGORY_COLOURS[
                  m.category as keyof typeof CONFIG.CATEGORY_COLOURS
                ] || "#9aa3aa";
          return (
            <g key={m.key}>
              <rect
                x={x}
                y={barTop}
                width={barW}
                height={Math.max(2, top + plotH - barTop)}
                fill={colour}
              >
                <title>
                  #{m.car} {m.driver}: {fmt(value(m))}
                </title>
              </rect>
              <text
                className="driverAxis"
                transform={`translate(${x + barW / 2},${top + plotH + 5}) rotate(-55)`}
              >
                {discarded && <tspan style={{fill:"#c51f32"}}>✕ </tspan>}#{m.car} {m.driver}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chartLegend">
        {lines.map(
          ([name, n, colour, dash]) =>
            Number.isFinite(n) && (
              <span key={name}>
                <i
                  style={{
                    borderTopColor: colour,
                    borderTopStyle: dash ? "dashed" : "solid",
                  }}
                />
                {name}
              </span>
            ),
        )}
      </div>
    </div>
  );
}
function Categories({ rows }: { rows: ReturnType<typeof categoryMetrics> }) {
  return (
    <>
      <SectionTitle
        n="05"
        title="Category benchmarks"
        sub="Driver-level metrics averaged by FIA category; laps are never pooled for pace averages"
      />
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {[
                "CATEGORY",
                "DRIVERS",
                "CLEAN LAPS",
                "AVG BEST",
                "AVG CLEAN",
                "FASTEST",
                "σ BEST",
                "σ CLEAN",
                "MAD BEST",
                "MAD CLEAN",
                "AVG Z",
                "MEDIAN Z",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>
                  <b
                    className="categoryDot"
                    style={{
                      background:
                        CONFIG.CATEGORY_COLOURS[
                          r.category as keyof typeof CONFIG.CATEGORY_COLOURS
                        ],
                    }}
                  />
                  {r.category}
                </td>
                <td>{r.drivers}</td>
                <td
                  className="lapCountCell"
                  style={lapHeat(
                    r.cleanLaps,
                    rows.map((x) => x.cleanLaps),
                  )}
                >
                  {r.cleanLaps}
                </td>
                <td>{fmt(r.avgBest)}</td>
                <td>{fmt(r.avgAll)}</td>
                <td>{fmt(r.fastest)}</td>
                <td>{num(r.stdBest, 3)}</td>
                <td>{num(r.stdAll, 3)}</td>
                <td>{num(r.madBest, 3)}</td>
                <td>{num(r.madAll, 3)}</td>
                <td>{num(r.avgZ)}</td>
                <td>{num(r.medianZ)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function DataInfo({ rows, laps }: { rows: ParseDiagnostics[]; laps: Lap[] }) {
  const passes = laps.flatMap((l) =>
    l.overtakes.map((car) => ({
      lap: l.lapNumber,
      overtaking: l.driver,
      overtakingCar: l.carNumber,
      overtakenCar: car,
      class: l.className,
      sameClass:
        laps.find((x) => x.event === l.event && x.carNumber === car)
          ?.className === l.className,
      reason: "Relative order inversion; both circulating; no pit transition",
    })),
  );
  return (
    <>
      <SectionTitle
        n="06"
        title="Import diagnostics"
        sub="Audit trail for every source session"
      />
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {[
                "SOURCE",
                "ROWS",
                "REJECTED",
                "MISSING TIMES",
                "MISSING DRIVERS",
                "DUPLICATES",
                "INCOMPLETE CARS",
                "UNKNOWN RC",
                "EXCLUDED CLEAN",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sourceFile}>
                <td>{r.sourceFile}</td>
                <td>{r.rowsParsed}</td>
                <td>{r.rowsRejected}</td>
                <td>{r.missingLapTimes}</td>
                <td>{r.missingDrivers}</td>
                <td>{r.duplicateLaps}</td>
                <td>{r.incompleteCars}</td>
                <td>{r.unknownRaceControl}</td>
                <td>{r.excludedCleanLaps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dataHeader">
        <SectionTitle
          n="06A"
          title="Overtake reconstruction audit"
          sub="Every retained pass remains inspectable"
        />
        <button
          className="ghost"
          onClick={() => download("overtake_reconstruction.csv", passes)}
        >
          ⇩ EXPORT PASSES
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>LAP</th>
              <th>OVERTAKING DRIVER</th>
              <th>CAR</th>
              <th>OVERTAKEN</th>
              <th>CLASS</th>
              <th>SAME CLASS</th>
              <th>VALIDATION</th>
            </tr>
          </thead>
          <tbody>
            {passes.slice(0, 300).map((p, i) => (
              <tr key={i}>
                <td>{p.lap}</td>
                <td>{p.overtaking}</td>
                <td>#{p.overtakingCar}</td>
                <td>#{p.overtakenCar}</td>
                <td>{p.class}</td>
                <td>{p.sameClass ? "YES" : "NO"}</td>
                <td>{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
