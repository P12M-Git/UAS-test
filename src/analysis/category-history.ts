import { csvRecords, normaliseDriverCategory } from "../parser/uraice_adapter";
import type { Category } from "../models/race";
import { driverIdentityKey } from "../models/driver-identity";
export const categoryNameKey=driverIdentityKey;
export function categoryHistory(csv:string){
  const [header,...rows]=csvRecords(csv.replace(/^\uFEFF/,""));
  if(!header?.includes("season")||!header.includes("driver_name"))throw new Error("Invalid driver category database");
  const get=(row:string[],field:string)=>row[header.indexOf(field)]||"";
  const drivers=new Map<string,{key:string;name:string;years:Record<string,Category>}>();
  const years=new Set<number>();
  for(const row of rows){
    const year=Number(get(row,"season")),name=get(row,"driver_name");
    if(!name||![2025,2026].includes(year))continue;
    const key=categoryNameKey(get(row,"driver_name_normalized")||name);
    const driver=drivers.get(key)||{key,name,years:{}};
    driver.years[String(year)]=normaliseDriverCategory(get(row,"fia_category_full")||get(row,"fia_category"));
    drivers.set(key,driver);years.add(year);
  }
  return {years:[...years].sort(),drivers:[...drivers.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
