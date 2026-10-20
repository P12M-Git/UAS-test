import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDriverCategories, csvRecords } from "../src/parser/uraice_adapter";
import { categoryHistory } from "../src/analysis/category-history";
import type { Lap } from "../src/models/race";

const csv = readFileSync("public/driver_categories_all_series_2022_2026.csv", "utf8");

test("annual category file covers participants in all four championships", () => {
  const [headers, ...rows] = csvRecords(csv);
  const at = (row: string[], column: string) => row[headers.indexOf(column)];
  for (const series of ["ELMS", "WEC", "ALMS", "IMSA"])
    assert.ok(rows.some(row => at(row, "series").split("|").includes(series)), series);
  assert.deepEqual(categoryHistory(csv).years, [2022, 2023, 2024, 2025, 2026]);
  assert.ok(rows.some(row => at(row, "source") === "FIA 2021 list used for 2022"));
  assert.ok(rows.some(row => at(row, "fia_category_full") === "Unknown"));
});

test("category lookup uses the race year across series", () => {
  const driver = "Mikkel Jensen";
  const laps = [2022, 2023, 2024, 2025, 2026].map(year => ({
    event: `WEC, Le Mans, ${year}`, sourceFile: `${year} WEC Le Mans.csv`,
    driver, category: "Unknown",
  } as Lap));
  assert.deepEqual(applyDriverCategories(laps, csv).map(lap => lap.category),
    ["Gold", "Platinum", "Platinum", "Platinum", "Platinum"]);
});
