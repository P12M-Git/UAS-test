"use client";
import {useEffect,useMemo,useState} from "react";
import type {AlkamelRace} from "../src/alkamel";
import type {Lap} from "../src/models/race";
import {compareDriversBySurname,driverIdentityKey} from "../src/models/driver-identity";
import {applyDriverCategories} from "../src/parser/uraice_adapter";
import {qualifyingResults,type QualifyingLap} from "../src/analysis/qualifying";
import {absoluteSummaryDrivers} from "../src/analysis/season-comparison";
import {workbookGrading,type GradingMode,type GradingDriver} from "../src/analysis/workbook-grading";
import {download} from "../src/reliable-download";
import {CONFIG} from "../src/config";
import {carColour,carTextColour} from "../src/models/car-colour";
import DriverName from "./driver-name";
import DriverPicker from "./driver-picker";
import {driverDisplayParts,displayDriverName} from "../src/models/display-driver";
import {carClassKey} from "../src/models/car-class";
import {formatTime as time,formatNumber} from "../src/models/number-format";
import {DriverCategory,ClassBadge} from "./driver-categories";
const metricSections=[
  {title:"Focus driver",keys:["focus"]},
  {title:"Averages and deltas",keys:["silverAvg","average","deltaSilver","deltaAverage"]},
  {title:"Top 10",keys:["silverTop10","top10","deltaSilverTop10","deltaTop10"]},
  {title:"Fastest lap and sample",keys:["deltaFastest","silverCount","driverCount"]},
  {title:"Silver · standard deviation and correction",keys:["silverStd","silverLower","silverUpper","silverCorrected","deltaSilverCorrected"]},
  {title:"Overall · standard deviation and correction",keys:["std","lower","upper","corrected","deltaCorrected"]},
  {title:"Team",keys:["teamCount","teamAverage","deltaTeamAverage","teamBest","deltaTeamBest"]},
];
const qualifyingCache=new Map<string,Promise<QualifyingLap[]>>();
function loadQualifying(championship:string,path:string){
  const key=championship+"|"+path;
  let pending=qualifyingCache.get(key);
  if(!pending){pending=download(`/api/alkamel/qualifying?${new URLSearchParams({championship,path})}`,r=>r.json() as Promise<{laps:QualifyingLap[]}>).then(r=>r.laps);
    qualifyingCache.set(key,pending);void pending.catch(()=>qualifyingCache.delete(key));}
  return pending;
}
export default function WorkspaceSeasonSummary({races,laps,driverCsv,driver,setDriver}:{races:AlkamelRace[];laps:Lap[];driverCsv:string;driver:string;setDriver:(name:string)=>void}){
  const [mode,setMode]=useState<GradingMode>("Qualifying");
  const [chosenClass,setClass]=useState("LMP2");
  const classes=[...new Set(laps.map(l=>l.className))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const className=classes.includes(chosenClass)?chosenClass:classes[0]||"LMP2";
  const drivers=[...new Set(laps.filter(l=>l.className===className).map(l=>l.driver))].sort(compareDriversBySurname);
  const active=drivers.includes(driver)?driver:drivers[0]||"";
  const [shownCategories,setCategories]=useState<string[]>(["Platinum","Gold","Silver","Bronze"]);
  const [cutoff,setCutoff]=useState(false),[percent,setPercent]=useState(110);
  return <section className="workspace-season-summary">
    <div className="section-tabs" role="tablist" aria-label="Season summary">
      {(["Qualifying","Race","Race 20"] as const).map(tab=><button key={tab} role="tab" aria-selected={mode===tab} onClick={()=>setMode(tab)}>{tab}</button>)}
    </div>
    <details className="comparison-display-controls"><summary>Driver cutoff</summary><div className="workspace-lap-controls">
      <label><span><input type="checkbox" checked={cutoff} onChange={e=>setCutoff(e.target.checked)}/> Exclude times above cutoff</span><input type="number" aria-label="Cutoff percentage" min={100} max={300} value={percent} onChange={e=>setPercent(Math.max(100,Math.min(300,Number(e.target.value)||110)))}/></label>
    </div></details>
    <div className="workspace-lap-controls">
      <label>Vehicle class<select value={className} onChange={e=>setClass(e.target.value)}>{classes.map(c=><option key={c}>{c}</option>)}</select></label>
      <DriverPicker drivers={drivers} driver={active} setDriver={setDriver}/>
      <fieldset className="categoryTicks"><legend>Show categories</legend>{(["Platinum","Gold","Silver","Bronze"] as const).map(c=><label key={c} style={{background:CONFIG.CATEGORY_COLOURS[c],color:"#182536"}}><input type="checkbox" checked={shownCategories.includes(c)} onChange={()=>setCategories(previous=>previous.includes(c)?previous.filter(x=>x!==c):[...previous,c])}/>{c}</label>)}</fieldset>
    </div>
    <details className="results-method"><summary>Workbook calculation rules</summary>
      <p>Qualifying uses the best recorded flying lap; Race uses the absolute best valid race lap; Race 20 uses the average of the fastest 20 valid laps, requiring all 20. Each event/session and vehicle class is independent. Category filters, Use checkboxes and cutoff remove drivers from the graph and metrics. The graph rescales to the remaining drivers.</p>
      <p>Calculations use every included driver in the vehicle class, without worksheet row limits. STDEV is sample standard deviation. Silver statistics use all Silver drivers. Overall deviation uses Bronze/Platinum in Qualifying and Gold/Platinum in Race and Race 20; corrected means filter those individual drivers within the overall mean ±1 STDEV. Team statistics include every car entered under the same published team name in this event and class. Missing team names are unavailable. Top 10 requires ten numeric results; missing values display as —.</p>
    </details>
    {!races.length?<p className="workspace-selection-note">Choose races from Load races to compare events.</p>:<div className="seasonGrid workspace-comparison-grid">{races.map(race=><ComparisonEvent key={race.id} race={race} laps={laps.filter(l=>l.sourceFile===race.sourceFile)} mode={mode} className={className} driver={active} setDriver={setDriver} driverCsv={driverCsv} shownCategories={shownCategories} cutoff={cutoff?percent:undefined}/>)}</div>}
  </section>;
}
function ComparisonEvent({race,laps,mode,className,driver,setDriver,driverCsv,shownCategories,cutoff}:{race:AlkamelRace;laps:Lap[];mode:GradingMode;className:string;driver:string;setDriver:(name:string)=>void;driverCsv:string;shownCategories:string[];cutoff?:number}){
  const [chosenSession,setSession]=useState("");
  const allSessions=race.qualifying||[];
  const defaultSessions=allSessions.filter(s=>!/Hyperpole/i.test(s.name));
  const sessions=chosenSession?allSessions.filter(s=>s.path===chosenSession):defaultSessions;
  const sessionKey=sessions.map(s=>s.path).join("|");
  const [data,setData]=useState<{key:string;rows:GradingDriver[]}>();
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const [excluded,setExcluded]=useState<string[]>([]);
  useEffect(()=>{
    if(mode!=="Qualifying")return;
    let cancelled=false;setError("");
    Promise.all(sessions.map(s=>loadQualifying(race.championship,s.path))).then(sets=>{
      const results=qualifyingResults(sets.flat());
      // Sessions of different classes can be combined, but Hyperpole is only
      // included when explicitly selected, never folded into Qualifying.
      const rated=applyDriverCategories(results.map(r=>({event:race.sourceFile,sourceFile:race.sourceFile,driver:r.driver,category:"Unknown"}) as Lap),driverCsv);
      const rows=results.map((r,i)=>({driver:r.driver,car:r.car,category:rated[i].category,className:r.className,team:r.team,value:r.best??NaN,total:r.laps}));
      if(!cancelled)setData({key:sessionKey,rows});
    }).catch(error=>{if(!cancelled)setError(String(error));});
    return()=>{cancelled=true;};
  },[sessionKey,mode,race.championship,driverCsv,retry]);
  const raceRows=useMemo(()=>absoluteSummaryDrivers(laps,{[laps[0]?.event||""]:20}),[laps]);
  const rows=(mode==="Qualifying"?(data?.key===sessionKey?data.rows:[]):raceRows.map(r=>({...r,team:laps.find(l=>l.carNumber===r.car)?.team||"",value:mode==="Race"?r.best:r.avgBest})))
    .filter(r=>carClassKey(r.className)===carClassKey(className)).sort((a,b)=>(Number.isFinite(a.value)?a.value:Infinity)-(Number.isFinite(b.value)?b.value:Infinity));
  const fastest=mode==="Qualifying"?Math.min(...rows.map(r=>r.value).filter(Number.isFinite)):Math.min(...laps.filter(l=>carClassKey(l.className)===carClassKey(className)&&l.valid&&l.lapTime!==null).map(l=>l.lapTime!));
  const discarded=(r:GradingDriver)=>excluded.includes(r.driver)||(cutoff!==undefined&&r.value>fastest*cutoff/100);
  const included=rows.filter(r=>!discarded(r)&&shownCategories.includes(r.category));
  const metrics=workbookGrading(included,driver,mode);
  const visible=rows.filter(r=>shownCategories.includes(r.category));
  return <article className="workspace-comparison-event">
    <h3>{race.championship} · {race.season} · {race.event}</h3>
    {mode==="Qualifying"&&<label>Session<select value={chosenSession} onChange={e=>setSession(e.target.value)}><option value="">Qualifying · all classes</option>{allSessions.map(s=><option key={s.path} value={s.path}>{s.name}</option>)}</select></label>}
    {mode==="Qualifying"&&(error?<p role="alert">Could not load qualifying. <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:!allSessions.length?<p>No qualifying CSV published.</p>:data?.key!==sessionKey?<p role="status">Loading qualifying…</p>:null)}
    <div className="comparison-plot-scroll"><ComparisonPlot rows={included} focus={driver} context={race.sourceFile}/></div>
    <div className="tableWrap"><table><thead><tr><th>USE / P</th><th>#</th><th>CATEGORY</th><th>CLASS</th><th>DRIVER</th><th>{mode==="Race 20"?"BEST 20 AVG":"BEST LAP"}</th><th>LAPS</th></tr></thead><tbody>{visible.map((row,i)=>{
      const colour=carColour(row.car,race.sourceFile);
      return <tr key={`${row.car}|${row.driver}`} className={`${row.driver===driver?"comparison-focus":""} ${discarded(row)?"comparison-excluded":""}`} title={discarded(row)?"Excluded from event benchmarks":undefined}>
        <td><input type="checkbox" aria-label={`Include ${row.driver} in ${race.event}`} checked={!excluded.includes(row.driver)} onChange={()=>setExcluded(p=>p.includes(row.driver)?p.filter(n=>n!==row.driver):[...p,row.driver])}/>{rows.indexOf(row)+1}</td>
        <td><span className="carNumber" style={{background:colour,color:carTextColour(colour)}}>{row.car}</span></td><td><DriverCategory category={row.category}/></td><td><ClassBadge name={row.className} proAm={laps.some(l=>l.carNumber===row.car&&l.proAm)}/></td><td><button onClick={()=>setDriver(row.driver)}><DriverName name={row.driver}/></button></td>
        <td>{time(row.value)}</td><td>{row.total}</td>
      </tr>;
    })}</tbody></table></div>
    <table className="workbook-metrics"><thead><tr><th colSpan={2}>WORKBOOK METRICS · <DriverName name={driver}/></th></tr></thead>{metricSections.map(section=><tbody key={section.title}><tr className="metric-section"><th colSpan={2}>{section.title}</th></tr>{section.keys.map(key=>metrics.find(m=>m.key===key)!).map(m=><tr key={m.key}><th>{m.label}</th><td className={m.kind==="delta"&&Number.isFinite(m.value)?m.value<=0?"summaryBetter":"summaryWorse":""}>{!Number.isFinite(m.value)?"—":m.kind==="count"?m.value:m.kind==="delta"?`${Number(formatNumber(m.value,3))>0?"+":""}${formatNumber(m.value,3)} s`:time(m.value)}</td></tr>)}</tbody>)}</table>
  </article>;
}
export function ComparisonPlot({rows,focus,context}:{rows:GradingDriver[];focus:string;context:string}){
  const timed=rows.filter(r=>Number.isFinite(r.value));
  const min=Math.min(...timed.map(r=>r.value)),max=Math.max(...timed.map(r=>r.value));
  const height=Math.max(100,timed.length*23+30),left=250,right=640;
  const x=(n:number)=>left+(n-min)/(max-min||1)*(right-left);
  if(!timed.length)return <p>No included timed drivers.</p>;
  return <svg className="comparison-plot" viewBox={`0 0 660 ${height}`} role="img" aria-label="Event lap-time comparison">
    <text x={left} y={13}>{time(min)}</text><text x={right} y={13} textAnchor="end">{time(max)}</text>
    {timed.map((row,i)=>{const y=30+i*23;const name=driverDisplayParts(row.driver);const selected=driverIdentityKey(row.driver)===driverIdentityKey(focus);return <g key={row.car+row.driver} className={selected?"comparison-plot-focus":undefined}>
      {selected&&<rect x={0} y={y-11} width={660} height={22} rx={3} fill="var(--focus-row,#e8daf7)"/>}<text x={2} y={y+4}>
      <tspan fontWeight="400">{row.car} </tspan><tspan fontWeight="700">{name.surname}</tspan><tspan fontWeight="400">, {name.given}</tspan>
    </text><line x1={left} x2={x(row.value)} y1={y} y2={y} stroke={carColour(row.car,context)} strokeWidth={selected?7:4}/><circle cx={x(row.value)} cy={y} r={selected?5:3} stroke={selected?"var(--text)":"none"} strokeWidth={1.5} fill={carColour(row.car,context)}/><title>{`${selected?"Selected driver · ":""}${displayDriverName(row.driver)}: ${time(row.value)}`}</title></g>;})}
  </svg>;
}
