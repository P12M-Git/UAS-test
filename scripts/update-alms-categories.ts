import {readFile,writeFile} from "node:fs/promises";
import {alkamelUrl,type AlkamelRace} from "../src/alkamel";
import {csvRecords,normaliseDriverCategory} from "../src/parser/uraice_adapter";
import {driverIdentityKey} from "../src/models/driver-identity";
import {download} from "../src/reliable-download";

const races=JSON.parse(await readFile("src/alkamel-catalogue.json","utf8")) as AlkamelRace[];
const file="public/driver_categories_all_series_2022_2026.csv";
const [header,...existing]=csvRecords(await readFile(file,"utf8"));
const records=existing.map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]||""])));
let added=0,updated=0;
for(const race of races.filter(r=>r.championship==="ALMS" && r.season==="2026-2027")){
  // The classification uses the same validated race directory as its timing CSV.
  const url=alkamelUrl("ALMS",race.path).replace("23_Analysis_","03_Classification_");
  const [heads,...rows]=csvRecords(await download(url,r=>r.text()),";");
  const get=(row:string[],key:string)=>row[heads.indexOf(key)]||"";
  for(const row of rows)for(let i=1;i<=6;i++){
    const name=[get(row,`DRIVER${i}_FIRSTNAME`),get(row,`DRIVER${i}_SECONDNAME`)].filter(Boolean).join(" ");
    const code=get(row,`DRIVER${i}_LICENSE`),category=normaliseDriverCategory(code);
    if(!name||category==="Unknown")continue;
    let record=records.find(r=>Number(r.season)===race.year && driverIdentityKey(r.driver_name)===driverIdentityKey(name));
    if(!record){record=Object.fromEntries(header.map(key=>[key,""]));records.push(record);added++;}else updated++;
    Object.assign(record,{season:String(race.year),driver_name:record.driver_name||name,driver_name_normalized:driverIdentityKey(name),fia_category:code,fia_category_full:category,
      series:[...new Set([...(record.series||"").split(/[|;]/).filter(Boolean),"ALMS"])].sort().join("|"),source:"ALMS 2026-2027 official classification DRIVER_LICENSE",source_url:url,participated:"yes"});
  }
}
const quote=(value:string)=>/[",\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;
records.sort((a,b)=>a.driver_name.localeCompare(b.driver_name)||Number(a.season)-Number(b.season));
await writeFile(file,[header.join(","),...records.map(row=>header.map(key=>quote(row[key])).join(","))].join("\n")+"\n");
console.log(JSON.stringify({added,updated}));
