import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { alkamelUrl, type Championship } from "../../../../src/alkamel";
import { applyDriverCategories, parseTimingCsv } from "../../../../src/parser/uraice_adapter";
import type { RaceDataset } from "../../../../src/models/race";

export const runtime = "nodejs";
const PARSER_VERSION = 1;
const pending = new Map<string, Promise<RaceDataset>>();

export async function GET(request: Request) {
  const head = request.method === "HEAD";
  const params = new URL(request.url).searchParams;
  const championship = params.get("championship") as Championship;
  const path = params.get("path") || "";
  const sourceFile = params.get("sourceFile") || "";
  let url: string;
  try {
    url = alkamelUrl(championship, path);
    if (!sourceFile || sourceFile.length > 200 || !/^20\d{2} (?:ELMS|WEC|ALMS|IMSA) /.test(sourceFile)) throw new Error();
  } catch {
    return Response.json({ error: "Invalid race" }, { status: 400 });
  }
  const directory = process.env.RACE_CACHE_DIR || (process.env.NODE_ENV === "production" ? "" : ".race-cache");
  if (!directory) return Response.json({ error: "Persistent race storage is not configured (RACE_CACHE_DIR)" }, { status: 503 });
  try {
    const ratings = await readFile(join(process.cwd(), "public", "driver_categories_all_series_2022_2026.csv"), "utf8");
    const key = createHash("sha256").update(JSON.stringify([PARSER_VERSION, championship, path, sourceFile, ratings])).digest("hex");
    const file = join(directory, `${key}.json.gz`);
    try {
      const dataset = JSON.parse(gunzipSync(await readFile(file)).toString("utf8")) as RaceDataset;
      if (dataset.laps?.length) return head ? new Response(null, { status: 200 }) : Response.json({ dataset, cached: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Alkamel HTTP ${response.status}`);
        const csv = await response.text();
        if (!csv.includes("LAP_NUMBER") || !csv.includes("NUMBER")) throw new Error("Alkamel returned an unexpected CSV");
        const parsed = parseTimingCsv(csv, sourceFile);
        if (!parsed.laps.length) throw new Error("No laps in CSV");
        const dataset: RaceDataset = { laps: applyDriverCategories(parsed.laps, ratings), diagnostics: parsed.diagnostics };
        await mkdir(directory, { recursive: true });
        const temporary = join(directory, `${key}.${crypto.randomUUID()}.tmp`);
        await writeFile(temporary, gzipSync(JSON.stringify(dataset)));
        await rename(temporary, file);
        return dataset;
      })();
      pending.set(key, job);
      void job.finally(() => pending.delete(key)).catch(() => {});
    }
    const dataset = await job;
    return head ? new Response(null, { status: 200 }) : Response.json({ dataset, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Race processing failed" }, { status: 502 });
  }
}

// Warm the shared cache from a browser that already has an IndexedDB copy.
export async function HEAD(request: Request) {
  return GET(request);
}
