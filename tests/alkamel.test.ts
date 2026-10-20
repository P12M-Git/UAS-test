import test from "node:test";
import assert from "node:assert/strict";
import { alkamelUrl, discoverRaces, raceLinks, validRacePath } from "../src/alkamel";
import { eventLabel } from "../src/models/event-identity";

test("finds race analysis CSV and ignores classifications and test sessions", () => {
  const base = "Results/21_2026/06_AUTODROMO%20DO%20ALGARVE/683_European%20Le%20Mans%20Series/202610101430_Race/Hour%204/";
  const html = `<a href="${base}03_Classification_Race.CSV">classification</a>
    <a href="${base}23_Analysis_Race.CSV">analysis</a>`;
  const races = raceLinks(html, "ELMS", "21_2026", "06_AUTODROMO DO ALGARVE");
  assert.equal(races.length, 1);
  assert.match(alkamelUrl("ELMS", races[0].path), /23_Analysis_Race\.CSV$/);
  assert.throws(() => alkamelUrl("ELMS", "https://example.com/23_Analysis_Race.CSV"));
  assert.throws(() => alkamelUrl("ELMS", "Results/21_2026/../23_Analysis_Race.CSV"));
});

test("WEC selects the latest race hour and excludes support races", () => {
  const prefix = "Results/15_2026/07_BARCELONA-CATALUNYA/688_FIA%20WEC/202610181200_Race/";
  const html = `<a href="${prefix}01_Hour%201/23_Analysis_Race_Hour%201.CSV"></a>
    <a href="${prefix}06_Hour%206/23_Analysis_Race_Hour%206.CSV"></a>
    <a href="Results/15_2026/07_BARCELONA-CATALUNYA/689_Porsche%20Cup/202610181200_Race/23_Analysis_Race.CSV"></a>`;
  const races = raceLinks(html, "WEC", "15_2026", "07_BARCELONA-CATALUNYA");
  assert.equal(races.length, 1);
  assert.match(races[0].path, /Hour 6/);
  assert.equal(eventLabel(races[0].sourceFile).split(", ")[0], "WEC");
});

test("ALMS retains both races in a weekend and uses its own host", () => {
  const prefix = "Results/05_2025-2026/03_Yas%20Marina/28_Asian%20Le%20Mans%20Series/";
  const html = `<a href="${prefix}202602071500_Race%201/Hour%204/23_Analysis_Race%201.CSV"></a>
    <a href="${prefix}202602081630_Race%202/Hour%204/23_Analysis_Race%202.CSV"></a>`;
  const races = raceLinks(html, "ALMS", "05_2025-2026", "03_Yas Marina");
  assert.equal(races.length, 2);
  assert.equal(new Set(races.map(r => eventLabel(r.sourceFile))).size, 2);
  assert.match(alkamelUrl("ALMS", races[0].path), /^https:\/\/alms\.alkamelsystems\.com\//);
  assert.throws(() => alkamelUrl("WEC", races[0].path));
});

test("verified catalogue covers all four series when an index is unavailable", async () => {
  const races = await discoverRaces(async () => { throw new Error("offline"); });
  assert.deepEqual(Object.fromEntries(["ELMS", "WEC", "ALMS"].map(series => [series, races.filter(r => r.championship === series).length])), {
    ELMS: 30, WEC: 36, ALMS: 25,
  });
  assert.equal(new Set(races.map(r => r.id)).size, races.length);
  assert.ok(races.every(r => validRacePath(r.path)));
  assert.equal(races.filter(r => r.championship === "IMSA").length, 57);
});

test("IMSA uses the WeatherTech time cards from the final race hour", () => {
  const prefix = "Results/26_2026/21_Road%20Atlanta/01_IMSA%20WeatherTech%20SportsCar%20Championship/202610031210_Race/";
  const html = `<a href="${prefix}02_Hour%202/23_Time%20Cards_Race_Unofficial.CSV"></a>
    <a href="${prefix}10_Hour%2010/23_Time%20Cards_Race.CSV"></a>
    <a href="Results/26_2026/21_Road%20Atlanta/02_IMSA%20Michelin%20Pilot%20Challenge/202610031210_Race/23_Time%20Cards_Race.CSV"></a>`;
  const races = raceLinks(html, "IMSA", "26_2026", "21_Road Atlanta");
  assert.equal(races.length, 1);
  assert.match(races[0].path, /Hour 10/);
  assert.match(alkamelUrl("IMSA", races[0].path), /^https:\/\/imsa\.results\.alkamelcloud\.com\//);
});
