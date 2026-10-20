import test from "node:test";
import assert from "node:assert/strict";
import { datasetScope } from "../src/analysis/dataset-scope";
import catalogue from "../src/alkamel-catalogue.json";
import type { AlkamelRace } from "../src/alkamel";

test("website scope counts the entire catalogue and deduplicates driver identities across seasons", () => {
  const races = catalogue as AlkamelRace[];
  const csv = "season,driver_name,fia_category_full,participated\n2025,Scott Huffaker,Gold,yes\n2026,Scott Huffaker II,Gold,yes\n2026,Alice Test,Platinum,yes\n2026,Bob Test,Unknown,yes";
  const totals = datasetScope([...races, races[0]], csv);
  assert.equal(totals.races, races.length);
  assert.equal(totals.years, 5);
  assert.equal(totals.drivers, 3);
  assert.equal(totals.categories, 2);
});
