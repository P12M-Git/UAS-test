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
    if (year < 2022) continue;
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
      path,
    } });
  }
  return [...found.values()].map(value => value.race);
}

async function discoverLiveRaces(fetcher: typeof fetch): Promise<AlkamelRace[]> {
  const championships = Object.keys(ALKAMEL_HOSTS) as Championship[];
  const index = await Promise.all(championships.map(async championship => {
    try {
      const response = await fetchIndex(fetcher, pageUrl(championship));
      if (!response.ok) return { championship, seasons: [] as string[] };
      const html = await response.text();
      const seasonSelect = html.match(/<select\s+name="season"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || "";
      const seasons = [...seasonSelect.matchAll(/<option\s+Value="([^"]+)"[^>]*>/gi)]
        .map(m => decode(m[1]))
        .filter(value => Number(value.match(/^\d+_(\d{4})/)?.[1]) >= 2022);
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
  return pages.flat();
}

export async function discoverRaces(fetcher: typeof fetch = fetch): Promise<AlkamelRace[]> {
  const verified = catalogue as AlkamelRace[];
  const live = await discoverLiveRaces(fetcher).catch(() => []);
  const races = new Map(verified.map(race => [race.id, race]));
  for (const race of live) {
    if (!validRacePath(race.path)) continue;
    const previous = races.get(race.id);
    const hour = (path: string) => Math.max(0, ...[...path.matchAll(/(?:Hour[ _]|_Hour )(\d+)/gi)].map(m => Number(m[1]))) * 2
      + (/Unofficial/i.test(path) ? 0 : 1);
    if (!previous || hour(race.path) >= hour(previous.path)) races.set(race.id, race);
  }
  return [...races.values()].sort((a, b) => a.year - b.year || a.championship.localeCompare(b.championship) || a.event.localeCompare(b.event));
}

export function validRacePath(path: string): boolean {
  return /^Results\/\d{2}_20\d{2}(?:-20\d{2})?\/[^?#]+\/23_(?:Analysis_Race|Time Cards_Race)[^/?#]*\.CSV$/i.test(path)
    && !path.split("/").some(part => part === ".." || part === "." || /%2f|%5c/i.test(part));
}

export function alkamelUrl(championship: Championship, path: string): string {
  if (!ALKAMEL_HOSTS[championship] || !validRacePath(path) || !seriesDirectory[championship].test(path))
    throw new Error("Invalid Alkamel race path");
  return new URL(path.split("/").map(encodeURIComponent).join("/"), pageUrl(championship)).toString();
}

