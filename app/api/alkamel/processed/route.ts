import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import { alkamelUrl, type Championship } from "../../../../src/alkamel";
import { applyDriverCategories, parseTimingCsv } from "../../../../src/parser/uraice_adapter";
import type { RaceDataset } from "../../../../src/models/race";

export const runtime = "nodejs";
const PARSER_VERSION = 1;
type ProcessedRace = { dataset: RaceDataset; storageWarning?: string };
const pending = new Map<string, Promise<ProcessedRace>>();

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
  const directory = process.env.RACE_CACHE_DIR || join(tmpdir(), "uraice-races");
  const storageWarning = !process.env.RACE_CACHE_DIR && process.env.NODE_ENV === "production"
    ? "Races are loading, but shared storage is temporary. Configure RACE_CACHE_DIR on a persistent disk to retain them across deployments."
    : undefined;
  try {
    const ratings = await readFile(join(process.cwd(), "public", "driver_categories_all_series_2022_2026.csv"), "utf8");
    const key = createHash("sha256").update(JSON.stringify([PARSER_VERSION, championship, path, sourceFile, ratings])).digest("hex");
    const file = join(directory, `${key}.json.gz`);
    try {
      const dataset = JSON.parse(gunzipSync(await readFile(file)).toString("utf8")) as RaceDataset;
      if (dataset.laps?.length) return head ? new Response(null, { status: 200 }) : Response.json({ dataset, cached: true, storageWarning }, { headers: { "Cache-Control": "no-store" } });
    } catch { /* Missing, damaged or inaccessible cache entries are rebuilt from the source. */ }
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
        try {
          await mkdir(directory, { recursive: true });
          const temporary = join(directory, `${key}.${crypto.randomUUID()}.tmp`);
          await writeFile(temporary, gzipSync(JSON.stringify(dataset)));
          await rename(temporary, file);
          return { dataset, storageWarning };
        } catch {
          return { dataset, storageWarning: "Races are loading, but the server could not save them. Check the persistent disk and RACE_CACHE_DIR." };
        }
      })();
      pending.set(key, job);
      void job.finally(() => pending.delete(key)).catch(() => {});
    }
    const result = await job;
    return head ? new Response(null, { status: 200 }) : Response.json({ ...result, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Race processing failed" }, { status: 502 });
  }
}

// Warm the shared cache from a browser that already has an IndexedDB copy.
export async function HEAD(request: Request) {
  return GET(request);
}
