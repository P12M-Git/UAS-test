import catalogue from "./alkamel-catalogue.json";

export type Championship = "ELMS" | "WEC" | "ALMS" | "IMSA";
export interface AlkamelRace {
  id: string;
  championship: Championship;
  season: string;
  year: number;
  event: string;
  sourceFile: string;
  path: string;
  qualifying?: { name: string; path: string }[];
}

export function inLibrary(race: Pick<AlkamelRace, "championship" | "year" | "season">): boolean {
  return race.year >= 2025 && (race.championship !== "ALMS" || Number(race.season.replace(/^\d{2}_/, "").slice(0, 4)) >= 2025);
}

export function qualifyingLinks(html: string, race: Pick<AlkamelRace, "path">) {
  const prefix = race.path.split("/").slice(0, 4).join("/") + "/";
  const raceNumber = race.path.match(/\d{12}_Race (\d+)/i)?.[1];
  const found = new Map<string, {name:string;path:string}>();
  for (const match of html.matchAll(/href=["']([^"']+\.CSV)["']/gi)) {
    const path = decode(match[1]);
    if (!path.startsWith(prefix) || !validQualifyingPath(path)) continue;
    const directory = path.split("/").find(part => /^\d{12}_/.test(part)) || "";
    const round = directory.match(/Race (\d+)/i)?.[1];
    if (raceNumber && round && raceNumber !== round) continue;
    found.set(path, {name:directory.replace(/^\d{12}_/, ""),path});
  }
  return [...found.values()].sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));
}

export function compareRacesByRound(a: AlkamelRace, b: AlkamelRace): number {
  const round = (race: AlkamelRace) => Number(race.path.split("/")[2]?.match(/^\d+/)?.[0] || 0);
  const start = (race: AlkamelRace) => race.path.match(/\/(\d{12})_Race/i)?.[1] || "";
  return a.year - b.year || a.championship.localeCompare(b.championship)
    || round(a) - round(b) || start(a).localeCompare(start(b), undefined, { numeric: true })
    || a.event.localeCompare(b.event, undefined, { numeric: true });
}

export const ALKAMEL_HOSTS: Record<Championship, string> = {
  ELMS: "elms.alkamelsystems.com",
  WEC: "fiawec.alkamelsystems.com",
  ALMS: "alms.alkamelsystems.com",
  IMSA: "imsa.results.alkamelcloud.com",
};
const seriesDirectory: Record<Championship, RegExp> = {
  ELMS: /\/(?:\d+_)?(?:European Le Mans Series|ELMS - [^/]+)\//i,
  WEC: /\/(?:\d+_)?FIA WEC\//i,
  ALMS: /\/(?:\d+_)?Asian Le Mans Series\//i,
  IMSA: /\/(?:\d+_)?IMSA WeatherTech SportsCar Championship\//i,
};
const decode = (value: string) => decodeURIComponent(value.replace(/&amp;/g, "&"));
const pageUrl = (championship: Championship, query = "") =>
  `https://${ALKAMEL_HOSTS[championship]}/${query}`;
// Alkamel keeps the selected season/event in a PHP session. Give each index
// request its own session so parallel discovery does not mix event trees.
const fetchIndex = (fetcher: typeof fetch, url: string) =>
  fetcher(url, { headers: { Cookie: `PHPSESSID=${crypto.randomUUID().replace(/-/g, "")}` } });

export function raceLinks(html: string, championship: Championship, season: string, event: string): AlkamelRace[] {
  const found = new Map<string, { race: AlkamelRace; hour: number }>();
  for (const match of html.matchAll(/href=["'](Results\/[^"']*\/23_(?:Analysis_Race|Time(?:%20| )Cards_Race)[^/"']*\.CSV)["']/gi)) {
    const path = decode(match[1]);
    if (!path.startsWith(`Results/${season}/`) || !seriesDirectory[championship].test(path)) continue;
    if (path.split("/")[2]?.toLowerCase() !== event.toLowerCase()) continue;
    const raceDirectory = path.split("/").find(part => /^\d{12}_Race(?: \d+)?$/i.test(part));
    if (!raceDirectory) continue;
    const year = Number(raceDirectory.slice(0, 4));
    if (!inLibrary({year,championship,season})) continue;
    const id = `${championship}-${season}-${event}-${raceDirectory}`;
    const hour = Math.max(0, ...[...path.matchAll(/(?:Hour[ _]|_Hour )(\d+)/gi)].map(m => Number(m[1]))) * 2
      + (/Unofficial/i.test(path) ? 0 : 1);
    if (found.has(id) && found.get(id)!.hour >= hour) continue;
    const eventName = event.replace(/^\d+_/, "").replace(/[-_]/g, " ");
    const raceName = raceDirectory.replace(/^\d{12}_/, "");
    found.set(id, { hour, race: {
      id, championship, season: season.replace(/^\d+_/, ""), year,
      event: `${eventName} · ${raceName}`,
      sourceFile: `${year} ${championship} ${event.replace(/[-_]/g, " ")} ${raceName}.csv`,
      path, qualifying: qualifyingLinks(html, {path}),
    } });
  }
  return [...found.values()].map(value => value.race);
}

async function discoverLiveRaces(fetcher: typeof fetch): Promise<AlkamelRace[]> {
  const championships = (Object.keys(ALKAMEL_HOSTS) as Championship[]).filter(value => value !== "ALMS");
  const index = await Promise.all(championships.map(async championship => {
    try {
      const response = await fetchIndex(fetcher, pageUrl(championship));
      if (!response.ok) return { championship, seasons: [] as string[] };
      const html = await response.text();
      const seasonSelect = html.match(/<select\s+name="season"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || "";
      const seasons = [...seasonSelect.matchAll(/<option\s+Value="([^"]+)"[^>]*>/gi)]
        .map(m => decode(m[1]))
        .filter(value => Number(value.match(/^\d+_(\d{4})/)?.[1]) >= 2025);
      return { championship, seasons };
    } catch {
      return { championship, seasons: [] as string[] };
    }
  }));
  const seasonPages = await Promise.all(index.flatMap(({ championship, seasons }) => seasons.map(async season => {
    try {
      const response = await fetchIndex(fetcher, pageUrl(championship, `?season=${encodeURIComponent(season)}`));
      if (!response.ok) return { championship, season, events: [] as string[] };
      const html = await response.text();
      const eventSelect = html.match(/<select\s+name="evvent"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || "";
      const events = [...eventSelect.matchAll(/<option\s+Value="([^"]+)"[^>]*>/gi)]
        .map(m => decode(m[1])).filter(value => /^\d{2}_/.test(value));
      return { championship, season, events };
    } catch {
      return { championship, season, events: [] as string[] };
    }
  })));
  const pages = await Promise.all(seasonPages.flatMap(({ championship, season, events }) => events.map(async event => {
    const query = `?season=${encodeURIComponent(season)}&evvent=${encodeURIComponent(event)}`;
    try {
      const response = await fetchIndex(fetcher, pageUrl(championship, query));
      return response.ok ? raceLinks(await response.text(), championship, season, event) : [];
    } catch {
      return [];
    }
  })));
  return [...pages.flat(), ...(await Promise.all((Object.keys(ALKAMEL_HOSTS) as Championship[]).map(series=>discoverCloudRaces(fetcher,series)))).flat()];
}

async function discoverCloudRaces(fetcher: typeof fetch, championship:Championship): Promise<AlkamelRace[]> {
  const base = "https://files.alkamelcloud.com/";
  const prefix=championship.toLowerCase();
  try {
    const response = await fetcher(`${base}${prefix}/manifests/results.json`);
    if (!response.ok) return [];
    const index = await response.json() as { seasons?: { id: string; manifestUrl: string }[] };
    // ALMS spans calendar years: retain 2024-2025 for its 2025 races.
    const pages = await Promise.all((index.seasons || []).filter(season =>
      Number(season.id.replace(/^\d+_/, "").slice(0,4)) >= 2025
    ).map(async season => {
      try {
        const result = await fetcher(new URL(season.manifestUrl, base));
        if (!result.ok) return [];
        const manifest = await result.json() as { folders?: unknown[] };
        const paths: string[] = [];
        const walk = (node: unknown): void => {
          if (!node || typeof node !== "object") return;
          const item = node as { url?: string; children?: unknown[] };
          if (item.url && /23_(?:Analysis|Time(?:%20| )Cards)_[^/]*\.CSV$/i.test(item.url)) paths.push(item.url);
          item.children?.forEach(walk);
        };
        manifest.folders?.forEach(walk);
        const links = paths.map(path => `<a href="${decodeURIComponent(path).replace(new RegExp(`^${prefix}/results/`,"i"), "Results/")}"></a>`).join("");
        const events = [...new Set(paths.map(path => decodeURIComponent(path).split("/")[3]))];
        return events.flatMap(event => raceLinks(links, championship, season.id, event));
      } catch { return []; }
    }));
    return pages.flat();
  } catch { return []; }
}

export async function discoverRaces(fetcher: typeof fetch = fetch): Promise<AlkamelRace[]> {
  const verified = (catalogue as AlkamelRace[]).filter(inLibrary);
  const boundedFetch: typeof fetch = (input, init) => fetcher(input, {
    ...init, signal: AbortSignal.timeout(8_000),
  });
  const live = await discoverLiveRaces(boundedFetch).catch(() => []);
  const races = new Map(verified.map(race => [race.id, race]));
  for (const race of live) {
    if (!inLibrary(race) || !validRacePath(race.path)) continue;
    const previous = races.get(race.id);
    const hour = (path: string) => Math.max(0, ...[...path.matchAll(/(?:Hour[ _]|_Hour )(\d+)/gi)].map(m => Number(m[1]))) * 2
      + (/Unofficial/i.test(path) ? 0 : 1);
    if (!previous || hour(race.path) >= hour(previous.path)) races.set(race.id, race);
  }
  return [...races.values()].sort(compareRacesByRound);
}

export function validRacePath(path: string): boolean {
  return /^Results\/\d{2}_20\d{2}(?:-20\d{2})?\/[^?#]+\/23_(?:Analysis_Race|Time Cards_Race)[^/?#]*\.CSV$/i.test(path)
    && !path.split("/").some(part => part === ".." || part === "." || /%2f|%5c/i.test(part));
}

export function validQualifyingPath(path: string): boolean {
  return /^Results\/\d{2}_20\d{2}(?:-20\d{2})?\/[^?#]+\/\d{12}_[^/]*(?:Qualifying|Hyperpole)[^/]*\/(?:[^/]+\/)?23_(?:Analysis|Time Cards)_[^/]+\.CSV$/i.test(path)
    && !path.split("/").some(part => part === ".." || part === "." || /%2f|%5c/i.test(part));
}

export function qualifyingUrl(championship: Championship, path: string): string {
  if (!ALKAMEL_HOSTS[championship] || !validQualifyingPath(path) || !seriesDirectory[championship].test(path)) throw new Error("Invalid qualifying path");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://files.alkamelcloud.com/${championship.toLowerCase()}/results/${encoded.slice(8)}`;
}

export function alkamelUrl(championship: Championship, path: string): string {
  if (!ALKAMEL_HOSTS[championship] || !validRacePath(path) || !seriesDirectory[championship].test(path))
    throw new Error("Invalid Alkamel race path");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://files.alkamelcloud.com/${championship.toLowerCase()}/results/${encoded.slice("Results/".length)}`;
}

