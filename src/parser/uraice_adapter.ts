import { CONFIG } from "../config";
import { driverIdentityKey, matchDriverCategoryKey } from "../models/driver-identity";
import type {
  Category,
  Lap,
  ParseDiagnostics,
  RaceDataset,
  RaceState,
} from "../models/race";

const tidy = (s: string) => s.replace(/^\uFEFF/, "").trim();
export function normaliseDriverCategory(value: string): Category {
  const categories: Record<string, Category> = {
    P: "Platinum",
    PLATINUM: "Platinum",
    G: "Gold",
    GOLD: "Gold",
    S: "Silver",
    SILVER: "Silver",
    B: "Bronze",
    BRONZE: "Bronze",
  };
  return categories[value.trim().toUpperCase()] || "Unknown";
}
export function timeToSeconds(value?: string): number | null {
  const raw = tidy(value || "");
  if (!raw || /^(nan|null|-)$/i.test(raw)) return null;
  const p = raw.split(":").map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.length === 1
    ? p[0]
    : p.length === 2
      ? p[0] * 60 + p[1]
      : p[0] * 3600 + p[1] * 60 + p[2];
}

function metadata(file: string) {
  const m = file.match(/(\d{2})ELMSR(\d{2})_([A-Z]+)/i);
  const names: Record<string, string> = {
    BARC: "Barcelona",
    RICA: "Le Castellet",
    IMOL: "Imola",
    SPAF: "Spa-Francorchamps",
  };
  return {
    event: m
      ? `${names[m[3].toUpperCase()] || m[3]} 20${m[1]}`
      : file.replace(/\.csv$/i, ""),
    session: "Race",
  };
}

function raceState(
  flag: string,
  first: boolean,
  ratio: number | null,
): RaceState {
  const f = flag.toUpperCase();
  if (f === "RF") return "RED";
  if (f === "SF" && !first) return "SC";
  if (
    f === "FCY" ||
    f === "VSC" ||
    (ratio !== null && ratio >= CONFIG.VSC_FCY_LAP_TIME_FACTOR && !first)
  )
    return "FCY/VSC";
  if (f === "GF" || first) return "GREEN";
  return "UNKNOWN";
}

export function parseTimingCsv(text: string, sourceFile: string): RaceDataset {
  if (
    text.split(/\r?\n/, 1)[0].includes("EVENT_CODE,") &&
    !text.split(/\r?\n/, 1)[0].includes(";")
  ) {
    const records = csvRecords(text);
    const headers = records.shift()!;
    const groups = new Map<string, string[][]>();
    for (const row of records) {
      const event = row[headers.indexOf("EVENT_CODE")];
      if (event) {
        const a = groups.get(event) || [];
        a.push(row);
        groups.set(event, a);
      }
    }
    const result = [...groups].map(([event, rows]) =>
      parseTimingCsv(
        [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n"),
        `${event}.csv`,
      ),
    );
    return {
      laps: result.flatMap((r) => r.laps),
      diagnostics: result.flatMap((r) => r.diagnostics),
    };
  }
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) throw Error("Empty timing file");
  const split = (line: string) => line.split(";").map(tidy);
  const heads = split(lines[0]);
  const idx = Object.fromEntries(heads.map((h, i) => [h, i]));
  for (const key of ["NUMBER", "LAP_NUMBER"])
    if (idx[key] === undefined) throw Error(`Missing required column: ${key}`);
  const get = (row: string[], key: string) => row[idx[key]] || "";
  let rejected = 0;
  const raw = lines
    .slice(1)
    .map(split)
    .flatMap((row) => {
      const lapNumber = Number(get(row, "LAP_NUMBER"));
      if (!Number.isFinite(lapNumber)) {
        rejected++;
        return [];
      }
      const s1 = timeToSeconds(get(row, "S1_SECONDS") || get(row, "S1"));
      const s2 = timeToSeconds(get(row, "S2_SECONDS") || get(row, "S2"));
      const s3 = timeToSeconds(get(row, "S3_SECONDS") || get(row, "S3"));
      const lapTime =
        s1 !== null && s2 !== null && s3 !== null
          ? s1 + s2 + s3
          : timeToSeconds(get(row, "LAP_TIME"));
      return [{ row, lapNumber, s1, s2, s3, lapTime }];
    });
  const { event, session } = metadata(sourceFile);
  const byCar = new Map<string, typeof raw>();
  raw.forEach((x) => {
    const car = get(x.row, "NUMBER");
    byCar.set(car, [...(byCar.get(car) || []), x]);
  });
  const fieldTimes = new Map<number, number[]>();
  raw.forEach((x) => {
    if (x.lapTime && x.lapNumber > 1 && !get(x.row, "PIT_TIME"))
      fieldTimes.set(x.lapNumber, [
        ...(fieldTimes.get(x.lapNumber) || []),
        x.lapTime,
      ]);
  });
  const median = (a: number[]) =>
    [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const laps: Lap[] = [];
  byCar.forEach((rows, car) => {
    let cumulative = 0;
    rows.sort((a,b)=>a.lapNumber-b.lapNumber);
    // Some spreadsheet exports format cumulative time as mm:ss.s and discard
    // the hour. Detect that format from backwards hour crossings per car.
    const wrappedHours = rows.some((x,i) => {
      if (!i || get(x.row,"ELAPSED").split(":").length !== 2) return false;
      const before=timeToSeconds(get(rows[i-1].row,"ELAPSED")), after=timeToSeconds(get(x.row,"ELAPSED"));
      return before!==null && after!==null && before-after>1800;
    });
    let previousElapsed: number | null = null;
    rows
      .sort((a, b) => a.lapNumber - b.lapNumber)
      .forEach((x, i) => {
        if (x.lapTime !== null) cumulative += x.lapTime;
        let elapsed = timeToSeconds(get(x.row,"ELAPSED"));
        if (wrappedHours && elapsed!==null && elapsed<3600 && get(x.row,"ELAPSED").split(":").length===2) {
          const expected = previousElapsed===null ? cumulative : previousElapsed+(x.lapTime??0);
          elapsed += Math.max(0,Math.round((expected-elapsed)/3600))*3600;
          // Missing rows can hide an hour crossing; at minimum preserve order.
          while (previousElapsed!==null && elapsed<previousElapsed) elapsed+=3600;
        }
        elapsed ??= x.lapTime===null ? null : cumulative;
        if (elapsed!==null) previousElapsed=elapsed;
        let pitOut =
          /^(true|1)$/i.test(get(x.row, "IS_OUTLAP")) ||
          Boolean(get(x.row, "PIT_TIME")) ||
          /^(1|true|yes|outlap)$/i.test(
            get(x.row, "CROSSING_FINISH_LINE_IN_PIT"),
          );
        const next = rows[i + 1];
        let pitIn =
          /^(true|1)$/i.test(get(x.row, "IS_INLAP")) ||
          Boolean(
            next &&
            (get(next.row, "PIT_TIME") ||
              /^(1|true|yes|outlap)$/i.test(
                get(next.row, "CROSSING_FINISH_LINE_IN_PIT"),
              )),
          );
        const ratio =
          x.lapTime && fieldTimes.get(x.lapNumber)?.length
            ? x.lapTime / median(fieldTimes.get(x.lapNumber)!)
            : null;
        if (idx.IS_OUTLAP !== undefined)
          pitOut = /^(true|1)$/i.test(get(x.row, "IS_OUTLAP"));
        if (idx.IS_INLAP !== undefined)
          pitIn = /^(true|1)$/i.test(get(x.row, "IS_INLAP"));
        const flag = get(x.row, "LAP_TYPE") || get(x.row, "FLAG_AT_FL");
        const rs = raceState(
          flag === "VSC/FCY" ? "FCY" : flag === "SC" ? "SF" : flag,
          x.lapNumber === 1,
          ratio,
        );
        const valid = x.lapTime !== null && x.lapTime > 0;
        const rawClass =
          get(x.row, "CLASS") || get(x.row, "CATEGORY") || "Unknown";
        const proAm = /pro\s*[-/]?\s*am/i.test(rawClass);
        const className = /^lmp2/i.test(rawClass) ? "LMP2" : rawClass;
        laps.push({
          id: `${sourceFile}-${car}-${x.lapNumber}`,
          event,
          session,
          sourceFile,
          lapNumber: x.lapNumber,
          carNumber: car,
          driver: get(x.row, "DRIVER_NAME") || "Unknown driver",
          team: get(x.row, "TEAM") || "Unknown team",
          category: normaliseDriverCategory(
            get(x.row, "DRIVER_CATEGORY") || get(x.row, "FIA_CATEGORY"),
          ),
          className,
          proAm,
          lapTime: x.lapTime,
          s1: x.s1,
          s2: x.s2,
          s3: x.s3,
          elapsed,
          position: null,
          classPosition: null,
          gapLeader: null,
          gapAhead: null,
          gapBehind: null,
          carAhead: null,
          carBehind: null,
          pitIn,
          pitOut,
          valid,
          raceState: rs,
          green: rs === "GREEN",
          clean:
            rs === "GREEN" && x.lapNumber !== 1 && !pitIn && !pitOut && valid,
          cleanAir: null,
          trafficCount: 0,
          overtakes: [],
          stintId: get(x.row, "STINT_ID") || undefined,
          tyreSet: get(x.row, "TYRE_SET_NUMBER") || undefined,
          tyreAge: Number(get(x.row, "TYRE_SET_LAP_NUMBER")) || undefined,
          tyreChange: get(x.row, "TYRE_CHANGE")
            ? /^(true|1)$/i.test(get(x.row, "TYRE_CHANGE"))
            : undefined,
          pitDuration: timeToSeconds(get(x.row, "PIT_TIME")) ?? undefined,
          refuelLitres: get(x.row, "REFUEL_LITERS")
            ? Number(get(x.row, "REFUEL_LITERS"))
            : undefined,
          refuelSeconds: timeToSeconds(get(x.row, "REFUEL_TIME")) ?? undefined,
          stopNote:
            get(x.row, "PS_TYPE_EXTRA") || get(x.row, "PS_TYPE") || undefined,
          reportedPosition: Number(get(x.row, "POSITION")) || undefined,
          sourceRaceState: flag,
        });
      });
  });
  reconstructOrderAndPasses(laps);
  const seen = new Set<string>();
  let duplicates = 0;
  laps.forEach((l) => {
    const k = `${l.event}|${l.carNumber}|${l.lapNumber}`;
    if (seen.has(k)) duplicates++;
    seen.add(k);
  });
  const maxLaps = Math.max(...[...byCar.values()].map((v) => v.length));
  const diagnostics: ParseDiagnostics = {
    sourceFile,
    rowsParsed: laps.length,
    rowsRejected: rejected,
    missingLapTimes: laps.filter((l) => l.lapTime === null).length,
    missingDrivers: laps.filter((l) => l.driver === "Unknown driver").length,
    duplicateLaps: duplicates,
    incompleteCars: [...byCar.values()].filter((v) => v.length < maxLaps * 0.8)
      .length,
    unknownRaceControl: laps.filter((l) => l.raceState === "UNKNOWN").length,
    excludedCleanLaps: laps.filter((l) => !l.clean).length,
  };
  return { laps, diagnostics: [diagnostics] };
}

export function csvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(tidy(cell));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(tidy(cell));
    rows.push(row);
  }
  return rows;
}

function reconstructOrderAndPasses(laps: Lap[]) {
  const byLap = new Map<number, Lap[]>();
  laps.forEach((l) =>
    byLap.set(l.lapNumber, [...(byLap.get(l.lapNumber) || []), l]),
  );
  byLap.forEach((group) => {
    group.sort((a, b) => (a.elapsed ?? Infinity) - (b.elapsed ?? Infinity));
    const lead = group[0]?.elapsed ?? null;
    group.forEach((l, i) => {
      l.position = i + 1;
      l.gapLeader =
        lead === null || l.elapsed === null ? null : l.elapsed - lead;
      l.gapAhead =
        i && l.elapsed !== null && group[i - 1].elapsed !== null
          ? l.elapsed - group[i - 1].elapsed!
          : null;
      l.gapBehind =
        i < group.length - 1 &&
        l.elapsed !== null &&
        group[i + 1].elapsed !== null
          ? group[i + 1].elapsed! - l.elapsed
          : null;
      l.carAhead = i ? group[i - 1].carNumber : null;
      l.carBehind = i < group.length - 1 ? group[i + 1].carNumber : null;
      l.cleanAir =
        !l.clean || l.elapsed === null || !Number.isFinite(l.elapsed)
          ? null
          : i === 0
            ? group.every(row=>row.elapsed!==null&&Number.isFinite(row.elapsed)) ? true : null
            : l.gapAhead !== null
              ? l.gapAhead > CONFIG.CLEAN_AIR_THRESHOLD_SECONDS
              : null;
      l.trafficCount = l.cleanAir === false ? 1 : 0;
    });
    const classes = new Map<string, Lap[]>();
    group.forEach((l) =>
      classes.set(l.className, [...(classes.get(l.className) || []), l]),
    );
    classes.forEach((rows) =>
      rows.forEach((l, i) => (l.classPosition = i + 1)),
    );
  });

  const byCar = new Map<string, Lap[]>();
  laps.forEach((l) =>
    byCar.set(l.carNumber, [...(byCar.get(l.carNumber) || []), l]),
  );
  byCar.forEach((rows) => rows.sort((a, b) => a.lapNumber - b.lapNumber));
  const field = [...byCar.entries()];
  byCar.forEach((rows, car) =>
    rows.forEach((current, i) => {
      if (i < 2 || !current.green || current.pitOut || current.elapsed === null)
        return;
      const previous = rows[i - 1];
      const twoLapsBack = rows[i - 2];
      if (
        !previous.green ||
        !twoLapsBack.green ||
        previous.pitIn ||
        previous.elapsed === null ||
        twoLapsBack.elapsed === null
      )
        return;
      const candidates = new Set<string>();
      for (const [otherCar, otherRows] of field) {
        if (otherCar === car) continue;
        const beforeCrossing = otherRows.find(
          (x) => x.elapsed !== null && x.elapsed > twoLapsBack.elapsed!,
        );
        const currentCrossing = otherRows.find(
          (x) => x.elapsed !== null && x.elapsed > previous.elapsed!,
        );
        if (
          !beforeCrossing ||
          !currentCrossing ||
          beforeCrossing.pitIn ||
          beforeCrossing.pitOut ||
          currentCrossing.pitIn ||
          currentCrossing.pitOut ||
          !beforeCrossing.green ||
          !currentCrossing.green
        )
          continue;
        const wasAheadAtLine = beforeCrossing.elapsed! < previous.elapsed!;
        const nowBehindAtLine = currentCrossing.elapsed! > current.elapsed!;
        const observationSpan =
          currentCrossing.elapsed! - beforeCrossing.elapsed!;
        const activelyCirculating =
          observationSpan > 0 && observationSpan < 300;
        if (wasAheadAtLine && nowBehindAtLine && activelyCirculating)
          candidates.add(otherCar);
      }
      current.overtakes = [...candidates];
    }),
  );
}

export async function parseFiles(files: File[]): Promise<RaceDataset> {
  const sets = await Promise.all(
    files.map(async (f) => parseTimingCsv(await f.text(), f.name)),
  );
  return {
    laps: sets.flatMap((s) => s.laps),
    diagnostics: sets.flatMap((s) => s.diagnostics),
  };
}

export function eventSeason(lap:Pick<Lap,"event"|"sourceFile">):number|null {
  for(const value of [lap.event,lap.sourceFile]){
    const full=value?.match(/(?:^|\D)(20\d{2})(?!\d)/);
    if(full)return Number(full[1]);
    const code=value?.match(/(?:^|[^0-9])(\d{2})(?:ELMS|WEC|LMC|LM24|LEMANS)/i);
    if(code)return 2000+Number(code[1]);
  }
  return null;
}
export function applyDriverCategories(laps: Lap[], tsv: string): Lap[] {
  const normalise = driverIdentityKey;
  if(tsv.replace(/^\uFEFF/,"").startsWith("season,")){
    const [headers,...rows]=csvRecords(tsv.replace(/^\uFEFF/,""));
    const at=(row:string[],key:string)=>row[headers.indexOf(key)]||"";
    const lookup=new Map<string,Category>();
    for(const row of rows){
      const season=Number(at(row,"season"));
      const category=normaliseDriverCategory(at(row,"fia_category_full")||at(row,"fia_category"));
      if(![2025,2026].includes(season)||category==="Unknown")continue;
      for(const name of [at(row,"driver_name"),at(row,"driver_name_normalized")])if(name)
        lookup.set(`${season}|${normalise(name)}`,category);
    }
    const yearKeys=new Map<number,string[]>();
    for(const key of lookup.keys()){
      const [year,name]=key.split("|");
      const keys=yearKeys.get(Number(year))||[];keys.push(name);yearKeys.set(Number(year),keys);
    }
    const resolved=new Map<string,Category>();
    return laps.map(l=>{
      const year=eventSeason(l);
      if(year===null||year<2025)return {...l,category:"Unknown"};
      const cacheKey=`${year}|${normalise(l.driver)}`;
      if(!resolved.has(cacheKey)){
        const name=matchDriverCategoryKey(l.driver,yearKeys.get(year)||[]);
        resolved.set(cacheKey,name?lookup.get(`${year}|${name}`)||"Unknown":"Unknown");
      }
      return {...l,category:resolved.get(cacheKey)!};
    });
  }
  const codes: Record<string, Category> = {
    P: "Platinum",
    G: "Gold",
    S: "Silver",
    B: "Bronze",
  };
  const lookup = new Map<string, Category>();
  tsv
    .replace(/\r/g, "")
    .split("\n")
    .slice(1)
    .forEach((line) => {
      const cols = line.split("\t");
      const category = codes[(cols[1] || "").trim().toUpperCase()];
      if (category)
        [cols[0], ...cols.slice(2)]
          .filter(Boolean)
          .forEach((name) => lookup.set(normalise(name), category));
    });
  return laps.map((l) => ({
    ...l,
    category:
      eventSeason(l)!==null && eventSeason(l)!<=2024 ? "Unknown" : l.category !== "Unknown"
        ? l.category
        : lookup.get(normalise(l.driver)) || "Unknown",
  }));
}
