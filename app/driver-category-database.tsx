"use client";
import { useEffect, useState } from "react";
import { categoryHistory, categoryNameKey } from "../src/analysis/category-history";
import { CONFIG } from "../src/config";

export default function DriverCategoryDatabase(){
  const [data,setData]=useState<ReturnType<typeof categoryHistory>|null>(null);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [changesOnly,setChangesOnly]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError("");
    fetch("/driver_categories_by_season.csv",{signal:controller.signal}).then(r=>{
      if(!r.ok)throw new Error(`Unable to load category database (${r.status})`);return r.text();
    }).then(text=>setData(categoryHistory(text))).catch(e=>{if(e.name!=="AbortError")setError(e.message);});
    return ()=>controller.abort();
  },[attempt]);
  if(error)return <div role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry</button></div>;
  if(!data)return <p role="status">Loading driver category database…</p>;
  const changed=(driver:typeof data.drivers[number])=>new Set(Object.values(driver.years).filter(c=>c!=="Unknown")).size>1;
  const rows=data.drivers.filter(d=>categoryNameKey(d.name).includes(categoryNameKey(query))&&(!changesOnly||changed(d)));
  return <section>
    <p>Season-specific FIA categories from the supplied database. No category is carried into another year. 2024 and earlier: unassigned.</p>
    <div className="seasonControls">
      <label style={{minWidth:300,flex:1}}>SEARCH DRIVER <input aria-label="Search driver in category database" style={{width:"100%",minHeight:38}} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or surname…"/></label>
      <button disabled={!query} onClick={()=>setQuery("")}>Clear search</button>
      <label><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/> Only category changes</label>
      <a href="/driver_categories_by_season.csv" download>Download source CSV</a>
    </div>
    <p>{rows.length} / {data.drivers.length} drivers</p>
    <div className="categoryTicks" aria-label="Category colour legend">{Object.entries(CONFIG.CATEGORY_COLOURS).filter(([name])=>name!=="Unknown").map(([name,color])=><span key={name} style={{background:color,color:"#17202a",padding:"4px 10px"}}>{name}</span>)}</div>
    <div className="tableWrap"><table style={{width:"100%"}} aria-label="Driver categories by season">
      <thead><tr><th>DRIVER</th>{data.years.map(year=><th key={year}>{year}</th>)}<th>CHANGE</th></tr></thead>
      <tbody>{rows.map(d=><tr key={d.key}><th scope="row">{d.name}</th>{data.years.map(year=>{
        const cat=d.years[String(year)];const assigned=cat&&cat!=="Unknown";
        return <td key={year} style={{textAlign:"center",background:assigned?CONFIG.CATEGORY_COLOURS[cat]:"#edf0f2",color:"#17202a",fontWeight:700}} title={assigned?`${d.name} · ${year}: ${cat}`:`No category recorded for ${year}`}>{assigned?cat:"—"}</td>;
      })}<td style={{textAlign:"center"}}>{changed(d)?"Changed":"—"}</td></tr>)}</tbody>
    </table>{!rows.length&&<p>No drivers match these filters.</p>}</div>
  </section>;
}
