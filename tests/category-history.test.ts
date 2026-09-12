import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryHistory } from "../src/analysis/category-history";
test("history merges spelling variants, leaves missing years blank and excludes older years",()=>{
 const data=categoryHistory('season,driver_name,driver_name_normalized,fia_category\n2025,Théo Test,theo test,S\n2026,THEO TEST,theo test,G\n2026,Other,other,B\n2024,Old,old,P\n');
 assert.deepEqual(data.years,[2025,2026]);assert.equal(data.drivers.length,2);
 const d=data.drivers.find(d=>d.key==="theotest")!;
 assert.deepEqual(d.years,{2025:"Silver",2026:"Gold"});
 assert.equal(data.drivers.find(d=>d.key==="other")!.years[2025],undefined);
});
test("history reads the bundled database",()=>{
 const data=categoryHistory(readFileSync("public/driver_categories_by_season.csv","utf8"));
 assert.deepEqual(data.years,[2025,2026]);assert.ok(data.drivers.length>=163);
});
