import type { AlkamelRace } from "../alkamel";
import { csvRecords, normaliseDriverCategory } from "../parser/uraice_adapter";
import { driverIdentityKey } from "../models/driver-identity";

/** Catalogue-wide totals, independent of the races currently open in an analysis. */
export function datasetScope(races: AlkamelRace[], driverCsv: string) {
  const [header = [], ...rows] = csvRecords(driverCsv.replace(/^\uFEFF/, ""));
  const value = (row: string[], field: string) => row[header.indexOf(field)] || "";
  const drivers = new Set<string>();
  const categories = new Set<string>();
  for (const row of rows) {
    if (Number(value(row, "season")) < 2025) continue;
    const name = value(row, "driver_name_normalized") || value(row, "driver_name");
    if (!name || value(row, "participated") === "no") continue;
    drivers.add(driverIdentityKey(name));
    const category = normaliseDriverCategory(value(row, "fia_category_full") || value(row, "fia_category"));
    if (category !== "Unknown") categories.add(category);
  }
  return { races: new Set(races.map(race => race.id)).size, years: new Set(races.map(race => race.year)).size, categories: categories.size, drivers: drivers.size };
}
