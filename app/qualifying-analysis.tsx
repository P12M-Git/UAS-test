"use client";
import {useEffect,useMemo,useState} from "react";
import type {AlkamelRace} from "../src/alkamel";
import {qualifyingResults,type QualifyingLap} from "../src/analysis/qualifying";
import {download} from "../src/reliable-download";
import {compareDriversBySurname} from "../src/models/driver-identity";
import DriverPicker from "./driver-picker";
import DriverName from "./driver-name";
import {carColour,carTextColour} from "../src/models/car-colour";
import {formatTime as time} from "../src/models/number-format";
import {DriverCategory,ClassBadge} from "./driver-categories";
import {applyDriverCategories} from "../src/parser/uraice_adapter";
import type {Lap} from "../src/models/race";
export default function QualifyingAnalysis({race,driverCsv}:{race:AlkamelRace;driverCsv:string}){
  const sessions=race.qualifying||[];
  const [chosen,setChosen]=useState("");
  const session=sessions.find(s=>s.path===chosen)||sessions[0];
  const [data,setData]=useState<{path:string;laps:QualifyingLap[]}>();
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const [filter,setFilter]=useState("All");
  const [driver,setDriver]=useState("");
  const path=session?.path;
  useEffect(()=>{
    if(!path)return;
    const controller=new AbortController();setError("");
    const query=new URLSearchParams({championship:race.championship,path});
    download(`/api/alkamel/qualifying?${query}`,r=>r.json() as Promise<{laps:QualifyingLap[]}>,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setData({path,laps:result.laps});})
      .catch(error=>{if(!controller.signal.aborted)setError(String(error));});
    return()=>controller.abort();
  },[path,race.championship,retry]);
  const laps=data?.path===path?data.laps:[];
  const results=useMemo(()=>qualifyingResults(laps),[laps]);
  const ratings=useMemo(()=>new Map(applyDriverCategories(results.map(r=>({driver:r.driver,sourceFile:race.sourceFile,event:race.sourceFile}) as Lap),driverCsv).map(l=>[l.driver,l.category])),[results,race.sourceFile,driverCsv]);
  const classes=[...new Set(laps.map(l=>l.className))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const className=classes.includes(filter)?filter:"All";
  const rows=results.filter(r=>className==="All"||r.className===className);
  const names=[...new Set(rows.map(r=>r.driver))].sort(compareDriversBySurname);
  const active=names.includes(driver)?driver:names[0]||"";
  const detail=laps.filter(l=>l.driver===active&&(className==="All"||l.className===className)).sort((a,b)=>a.lap-b.lap||a.car.localeCompare(b.car,undefined,{numeric:true}));
  const bestSector=(row:typeof rows[number],key:"bestS1"|"bestS2"|"bestS3")=>{
    const values=rows.filter(r=>r.className===row.className).map(r=>r[key]).filter((n):n is number=>n!==null);
    return row[key]!==null && row[key]===Math.min(...values);
  };
  if(!sessions.length)return <p className="workspace-selection-note">No qualifying timing CSV has been published for this event.</p>;
  return <section className="workspace-qualifying">
    <div className="workspace-lap-controls">
      <label>Session<select value={session.path} onChange={e=>setChosen(e.target.value)}>{sessions.map(s=><option key={s.path} value={s.path}>{s.name}</option>)}</select></label>
      <label>Vehicle class<select value={className} onChange={e=>setFilter(e.target.value)}><option>All</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label>
      <DriverPicker drivers={names} driver={active} setDriver={setDriver}/>
    </div>
    {error?<p role="alert">Unable to load qualifying. <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:data?.path!==path?<p role="status">Loading qualifying session…</p>:<>
      <details className="results-method"><summary>Timing and theoretical lap</summary><p>Best lap and sectors use recorded flying laps, excluding pit, explicitly deleted and yellow/red laps. Theoretical time adds the driver's best S1, S2 and S3 within this session. Potential is best lap minus theoretical. Purple sectors are fastest in the vehicle class. These timing-derived values do not apply post-session penalties or unmarked deletions.</p></details>
      <div className="tableWrap"><table><thead><tr>{["POS","#","CATEGORY","CLASS","DRIVER","BEST LAP","S1 · BEST LAP","S2 · BEST LAP","S3 · BEST LAP","BEST S1","BEST S2","BEST S3","THEORETICAL","POTENTIAL","LAPS"].map(h=><th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=><tr key={`${r.car}|${r.driver}`} className={r.driver===active?"qualifying-focus":""} onClick={()=>setDriver(r.driver)}>
          <td>{r.best===null?"—":`P${results.filter(x=>x.className===r.className&&x.best!==null).indexOf(r)+1}`}</td><td><span className="carNumber" style={{background:carColour(r.car,race.sourceFile),color:carTextColour(carColour(r.car,race.sourceFile))}}>{r.car}</span></td><td><DriverCategory category={ratings.get(r.driver)||"Unknown"}/></td><td><ClassBadge name={r.className}/></td>
          <td><button className="ghost" onClick={()=>setDriver(r.driver)}><DriverName name={r.driver}/></button><small>{r.team}</small></td>
          <td><strong>{time(r.best)}</strong></td>{(["s1","s2","s3"] as const).map(key=><td key={key}>{time(r.bestLap?.[key])}</td>)}
          {(["bestS1","bestS2","bestS3"] as const).map(key=><td key={key} className={bestSector(r,key)?"qualifying-sector-best":""}>{time(r[key])}</td>)}
          <td>{time(r.theoretical)}</td><td>{r.potential===null?"—":`${r.potential.toFixed(3)}s`}</td><td>{r.validLaps} / {r.laps}</td>
        </tr>)}</tbody></table></div>
      {!rows.length&&<p>No timed drivers in this session.</p>}
      {!!detail.length&&<><h3><DriverName name={active}/> · session laps</h3><div className="tableWrap"><table><thead><tr>{["LAP","#","SESSION TIME","LAP TIME","S1","S2","S3","TIMED LAP","FLAG"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{detail.map(l=><tr key={`${l.car}-${l.lap}`}><td>{l.lap}</td><td>{l.car}</td><td>{time(l.elapsed)}</td><td>{time(l.time)}</td><td>{time(l.s1)}</td><td>{time(l.s2)}</td><td>{time(l.s3)}</td><td>{l.valid?"YES":"EXCLUDED"}</td><td>{l.flag||"—"}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
