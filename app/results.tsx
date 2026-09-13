"use client";
import {useMemo,useState} from "react";
import type {Lap} from "../src/models/race";
import {raceResults} from "../src/analysis/results";
import {CONFIG} from "../src/config";
import {eventTheme} from "../src/models/event-identity";

const colours:Record<string,string>={Platinum:"#a0aab7",Gold:"#f4cf63",Silver:"#d1d8df",Bronze:"#dca46d",Unknown:"#e2e5e9"};
export default function Results({laps}:{laps:Lap[]}){
  const rounds=useMemo(()=>raceResults(laps),[laps]);
  const [hidden,setHidden]=useState<string[]>([]),[focus,setFocus]=useState(""),[className,setClass]=useState("All"),[positionMode,setPositionMode]=useState("class"),[search,setSearch]=useState("");
  const selected=rounds.filter(r=>!hidden.includes(r.key));
  const allDrivers=[...new Map(rounds.flatMap(r=>r.drivers).map(d=>[d.identity,d])).values()].sort((a,b)=>a.driver.localeCompare(b.driver));
  const shown=allDrivers.filter(d=>d.identity===focus || selected.some(r=>r.drivers.some(x=>x.identity===d.identity&&(className==="All"||x.className===className)))&&d.driver.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="filters">
      <label>CLASS<select value={className} onChange={e=>setClass(e.target.value)}><option>All</option>{[...new Set(laps.map(l=>l.className))].sort().map(c=><option key={c}>{c}</option>)}</select></label>
      <label>POSITION<select value={positionMode} onChange={e=>setPositionMode(e.target.value)}><option value="class">In class</option><option value="overall">Overall</option></select></label>
      <label>FOCUS DRIVER<select value={focus} onChange={e=>setFocus(e.target.value)}><option value="">None</option>{allDrivers.map(d=><option key={d.identity} value={d.identity}>{d.driver}</option>)}</select></label>
      <label>SEARCH<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Driver name"/></label>
    </div>
    <div className="section-tabs">{rounds.map(r=><label key={r.key} className={`event-badge ${eventTheme(r.event)}`}><input type="checkbox" checked={!hidden.includes(r.key)} onChange={e=>setHidden(old=>e.target.checked?old.filter(k=>k!==r.key):[...old,r.key])}/>{r.event} · {r.session}</label>)}</div>
    <p>Timing-derived results: completed laps, then elapsed time. All drivers of a car share its position. Penalties, disqualifications and official retirement status are not available in these CSVs. Pace and clean-lap filters do not apply.</p>
    {!selected.length?<p>Select at least one event.</p>:<div className="results-scroll"><table className="results-table"><thead><tr><th>DRIVER</th>{selected.map(r=><th key={r.key} className={eventTheme(r.event)}>{r.event}<br/><small>{r.session}</small></th>)}</tr></thead>
    <tbody>{shown.map(d=><tr key={d.identity} className={focus===d.identity?"results-focus":""}><td style={{background:focus===d.identity?"#dec4f2":colours[d.category]}}><button className="ghost" onClick={()=>setFocus(focus===d.identity?"":d.identity)}>{d.driver}</button></td>{selected.map(r=>{
      const entries=r.drivers.filter(x=>x.identity===d.identity&&(className==="All"||x.className===className));
      return <td key={r.key}>{entries.length?entries.map(x=>{const p=positionMode==="class"?x.classPosition:x.position;return <div key={x.car} title={`${x.team} · ${x.className} · ${x.laps} laps`}><span className="results-car" style={{background:CONFIG.CAR_COLOURS[x.car as keyof typeof CONFIG.CAR_COLOURS]||"#ddd"}}>#{x.car}</span> <strong className="result-position" style={{background:p===1?"#f2cc55":p===2?"#d2dae2":p===3?"#dba571":"#e2e7ed"}}>P{p}</strong><small> {x.laps} laps · {x.className}</small></div>}):"—"}</td>
    })}</tr>)}</tbody></table>{!shown.length&&<p>No drivers match these filters.</p>}</div>}
  </>;
}
