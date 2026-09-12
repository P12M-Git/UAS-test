import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDriverCategories, eventSeason, csvRecords } from "../src/parser/uraice_adapter";
import { matchDriverCategoryKey } from "../src/models/driver-identity";
import { categoryHistory } from "../src/analysis/category-history";
import type { Lap } from "../src/models/race";
const csv="season,driver_name,driver_name_normalized,fia_category,fia_category_full\n2025,Théo Test,theo test,S,Silver\n2026,Théo Test,theo test,G,Gold\n";
test("all supplied Le Mans drivers resolve in 2026, regardless of event naming",()=>{
 const data=readFileSync("public/driver_categories_by_season.csv","utf8");
 const rows=csvRecords(readFileSync("tests/fixtures/lemans_2026_lmp2_driver_categories.csv","utf8")).slice(1).filter(r=>r[0]);
 assert.equal(rows.length,57);
 for(const sourceFile of ["26WECR03_LM24.csv","26LM24.csv","lemans_2026.csv","24 Hours of Le Mans 2026.csv"]){
  const laps=rows.map(r=>({event:"Le Mans",sourceFile,driver:r[0],category:"Unknown"}) as Lap);
  assert.deepEqual(applyDriverCategories(laps,data).map(l=>l.category),rows.map(r=>r[1]),sourceFile);
 }
 const history=categoryHistory(data);
 assert.equal(history.drivers.find(d=>d.name==="Mikkel Jensen")?.years[2026],"Platinum");
 assert.equal(history.drivers.find(d=>d.name==="Mikkel Jensen")?.years[2025],undefined);
 for(const year of [2024,2025,2027]){
  assert.equal(applyDriverCategories([{event:`Le Mans ${year}`,sourceFile:"race.csv",driver:"Mikkel Jensen"} as Lap],data)[0].category,"Unknown");
 }
});
test("minor name typos match uniquely, without guessing ambiguous identities",()=>{
 const data=readFileSync("public/driver_categories_by_season.csv","utf8");
 const names:Record<string,string>={"Alexander Quinn":"Gold","Tobias LÜTKE":"Bronze","Mikkel Jenssen":"Platinum","Mikkel Jesnen":"Platinum","Mikel Jensen":"Platinum","Michael Jensen":"Bronze","Nico Muller":"Platinum","Horst Jr. Felbermayr":"Bronze","Horst Felix Felbermayr":"Silver"};
 for(const [driver,category] of Object.entries(names))assert.equal(applyDriverCategories([{event:"LM24 2026",sourceFile:"race.csv",driver} as Lap],data)[0].category,category,driver);
 assert.equal(matchDriverCategoryKey("John Smyth",["johnsmith","johnsmythe"]),undefined);
 assert.equal(matchDriverCategoryKey("John Smith",["johnsmith","johnsmyth"]),"johnsmith");
 assert.equal(matchDriverCategoryKey("Jensen",["mikkeljensen","michaeljensen"]),undefined);
});
test("ratings use event year and override embedded ratings without leaking between seasons",()=>{
 const laps=[2024,2025,2026,2027].map(year=>({event:`Barcelona ${year}`,sourceFile:"26ELMSR01_BARC.csv",driver:"THEO TEST",category:"Platinum"}) as Lap);
 assert.deepEqual(applyDriverCategories(laps,csv).map(l=>l.category),["Unknown","Silver","Gold","Unknown"]);
 assert.equal(eventSeason({event:"Race",sourceFile:"25ELMSR01_BARC.csv"}),2025);
 assert.equal(applyDriverCategories([{...laps[0],event:"Old race",sourceFile:"23ELMSR01_BARC.csv"}],csv)[0].category,"Unknown");
 assert.equal(applyDriverCategories([{...laps[0],event:"Race",sourceFile:"unknown.csv"}],csv)[0].category,"Unknown");
});
test("bundled season CSV resolves its named drivers",()=>{
 const data=readFileSync("public/driver_categories_by_season.csv","utf8");
 const l={event:"Barcelona 2025",sourceFile:"25ELMSR01_BARC.csv",driver:"Lorenzo FLUXA",category:"Unknown"} as Lap;
 assert.equal(applyDriverCategories([l],data)[0].category,"Gold");
});
test("Scott Huffaker with or without II is Gold in both supported seasons",()=>{
 const data=readFileSync("public/driver_categories_by_season.csv","utf8");
 for(const year of [2025,2026])for(const driver of ["Scott HUFFAKER II","Scott Huffaker"]){
  const lap={event:`Barcelona ${year}`,sourceFile:"race.csv",driver,category:"Silver"} as Lap;
  assert.equal(applyDriverCategories([lap],data)[0].category,"Gold");
 }
 const old={event:"Barcelona 2024",sourceFile:"race.csv",driver:"Scott HUFFAKER II",category:"Gold"} as Lap;
 assert.equal(applyDriverCategories([old],data)[0].category,"Unknown");
});
test("explicit aliases keep annual ratings and distinguish both Felbermayrs",()=>{
 const data=readFileSync("public/driver_categories_by_season.csv","utf8");
 const names:Record<string,string>={"Benjamin HANLEY":"Gold","Ben Hanley":"Gold","Cem BÖLÜKBASI":"Silver","Cem Bölükbaşı":"Silver","Nicholas YELLOLY":"Platinum","Nicholas YELOLLY":"Platinum","Nick Yelloly":"Platinum","Horst FELBERMAYR":"Bronze","Horst FELBERMAYR Jr.":"Bronze","Horst Felix FELBERMAYR":"Silver","Scott Hufakker II":"Gold"};
 for(const year of [2025,2026])for(const [driver,expected] of Object.entries(names)){
  assert.equal(applyDriverCategories([{event:`Race ${year}`,sourceFile:"race.csv",driver,category:"Unknown"} as Lap],data)[0].category,expected,`${year} ${driver}`);
 }
 for(const driver of ["Gregory Huffaker II","Felbermayr","Hanley"]){
  assert.equal(applyDriverCategories([{event:"Race 2026",sourceFile:"race.csv",driver,category:"Unknown"} as Lap],data)[0].category,"Unknown");
 }
 const changed="season,driver_name,driver_name_normalized,fia_category\n2025,Ben Hanley,ben hanley,S\n2026,Ben Hanley,ben hanley,G\n";
 assert.deepEqual(applyDriverCategories([2024,2025,2026].map(y=>({event:`Race ${y}`,sourceFile:"race.csv",driver:"Benjamin Hanley",category:"Unknown"}) as Lap),changed).map(l=>l.category),["Unknown","Silver","Gold"]);
});
