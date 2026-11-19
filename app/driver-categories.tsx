import {CONFIG} from "../src/config";
export function DriverCategory({category}:{category:string}){
  return <span className="driver-category" style={{background:CONFIG.CATEGORY_COLOURS[category as keyof typeof CONFIG.CATEGORY_COLOURS]||"var(--panel-strong)",color:category==="Unknown"?"var(--muted)":"#182536"}}>{category==="Unknown"?"—":category}</span>;
}
export function classAppearance(name:string,proAm=false){
  const key=name.toUpperCase();
  if(/HYPER|GTP/.test(key))return {label:name,colour:"#d92d36",text:"#fff"};
  if(/LMP2/.test(key))return proAm||/PRO\s*[-/]?\s*AM/.test(key)?{label:"LMP2 Pro/Am",colour:"#9fd3f2",text:"#142b50"}:{label:"LMP2",colour:"#173c72",text:"#fff"};
  if(/GT3|GTD/.test(key))return {label:name,colour:"#ed8a28",text:"#182536"};
  return {label:name,colour:"var(--panel-strong)",text:"var(--text)"};
}
export function ClassBadge({name,proAm=false}:{name:string;proAm?:boolean}){
  const {label,colour,text}=classAppearance(name,proAm);
  return <span className="vehicle-class" style={{background:colour,color:text}}>{label}</span>;
}
