"use client";
import {useEffect,useMemo,useState} from "react";
import type {AlkamelRace} from "../src/alkamel";
import type {Lap} from "../src/models/race";
import {compareDriversBySurname,driverIdentityKey} from "../src/models/driver-identity";
import {applyDriverCategories} from "../src/parser/uraice_adapter";
import {qualifyingResults,type QualifyingLap} from "../src/analysis/qualifying";
import {absoluteSummaryDrivers} from "../src/analysis/season-comparison";
import {type GradingMode,type GradingDriver} from "../src/analysis/workbook-grading";
import {gradingComparison,comparisonCategories,cohortStatistics,lapHeatColour} from "../src/analysis/grading-comparison";
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
  {title:"Averages and deltas",keys:["average","deltaAverage"]},
  {title:"Top 10",keys:["top10","deltaTop10"]},
  {title:"Fastest lap and sample",keys:["deltaFastest","driverCount"]},
  {title:"Overall · standard deviation and correction",keys:["std","lower","upper","corrected","deltaCorrected"]},
  {title:"Team",keys:["teamCount","teamAverage","deltaTeamAverage","teamBest","deltaTeamBest"]},
];
const metricLabels:Record<string,string>={focus:"Focus time",average:"Average time",deltaAverage:"Delta to average",top10:"Top 10 average",deltaTop10:"Delta to Top 10",deltaFastest:"Delta to fastest",driverCount:"Number of drivers",std:"Standard deviation",lower:"Interval 1",upper:"Interval 2",corrected:"Corrected average",deltaCorrected:"Delta to corrected average",teamCount:"Drivers in team",teamAverage:"Team average",deltaTeamAverage:"Delta to team average",teamBest:"Fastest in team",deltaTeamBest:"Delta to fastest in team"};
function metricText(key:string,value:number){
  if(!Number.isFinite(value))return "—";
  if(key.endsWith("Count"))return String(value);
  if(key.startsWith("delta"))return `${Number(formatNumber(value,3))>0?"+":""}${formatNumber(value,3)} s`;
  return key==="std"?`${formatNumber(value,3)} s`:time(value);
}
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
      <p>Overall uses all included drivers. The mini-columns use Silver, Gold/Platinum and Bronze independently. Sample standard deviation and the corrected mean (within that group's own mean ±1 STDEV) use the same group as the column. Deltas compare the selected driver's time against each reference. Team includes all cars with the same published team name in this event and vehicle class; each timed driver has equal weight. Missing times are excluded from averages, not counted as zero. Top 10 requires ten numeric results.</p>
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
  const rows=(mode==="Qualifying"?(data?.key===sessionKey?data.rows:[]):raceRows.map(r=>({...r,team:laps.find(l=>l.carNumber===r.car&&driverIdentityKey(l.driver)===driverIdentityKey(r.driver)&&carClassKey(l.className)===carClassKey(r.className))?.team||"",value:mode==="Race"?r.best:r.avgBest})))
    .filter(r=>carClassKey(r.className)===carClassKey(className)).sort((a,b)=>(Number.isFinite(a.value)?a.value:Infinity)-(Number.isFinite(b.value)?b.value:Infinity));
  const fastest=mode==="Qualifying"?Math.min(...rows.map(r=>r.value).filter(Number.isFinite)):Math.min(...laps.filter(l=>carClassKey(l.className)===carClassKey(className)&&l.valid&&l.lapTime!==null).map(l=>l.lapTime!));
  const discarded=(r:GradingDriver)=>excluded.includes(r.driver)||(cutoff!==undefined&&r.value>fastest*cutoff/100);
  const included=rows.filter(r=>!discarded(r)&&shownCategories.includes(r.category));
  const comparison=gradingComparison(included,driver,rows);
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
        <td>{time(row.value)}</td><td className="comparison-lap-count" style={{background:lapHeatColour(row.total,included.map(r=>r.total)),color:"#182536"}}>{row.total}</td>
      </tr>;
    })}</tbody></table></div>
    <div className="tableWrap comparison-metrics-wrap"><table className="workbook-metrics"><thead><tr><th>METRIC · <DriverName name={driver}/></th>{comparison.columns.map(c=><th key={c.key} className={`metric-column-${c.key}`}>{c.label}</th>)}</tr></thead>{metricSections.map(section=><tbody key={section.title}><tr className="metric-section"><th colSpan={5}>{section.title}</th></tr>{section.title==="Team"&&<tr><td colSpan={5}><details className="team-members"><summary>{comparison.team.name?`${comparison.team.name} · ${comparison.team.cars.map(car=>`#${car}`).join(", ")} · ${comparison.team.members.length} drivers / ${comparison.team.timed} timed`:"No published team available for this driver"}</summary><ul>{comparison.team.members.map(member=><li key={`${member.car}|${member.driver}`}>#{member.car} · <DriverName name={member.driver}/> · {member.category} · {time(member.value)}</li>)}</ul><p>Current event and class; current filters apply. Average is per timed driver, including the selected driver when enabled.</p></details></td></tr>}{section.keys.map(key=><tr key={key}><th>{metricLabels[key]}</th>{comparison.columns.map(column=>{const value=column.values[key as keyof typeof column.values];return <td key={column.key} className={`metric-column-${column.key} ${key.startsWith("delta")&&Number.isFinite(value)?value<=0?"summaryBetter":"summaryWorse":""}`}>{metricText(key,value)}</td>;})}</tr>)}</tbody>)}</table></div>
  </article>;
}
export function ComparisonPlot({rows,focus,context}:{rows:GradingDriver[];focus:string;context:string}){
  const timed=rows.filter(r=>Number.isFinite(r.value));
  const min=Math.min(...timed.map(r=>r.value)),max=Math.max(...timed.map(r=>r.value));
  const height=Math.max(100,timed.length*23+30),left=250,right=640;
  const x=(n:number)=>left+(n-min)/(max-min||1)*(right-left);
  if(!timed.length)return <p>No included timed drivers.</p>;
  const references=comparisonCategories.map(c=>({...c,...cohortStatistics(timed.filter(c.matches))}));
  return <><div className="comparison-reference-legend">{references.map(r=><span key={r.key}><i style={{background:r.colour}}/>{r.label} AVG: {time(r.mean)} <small>(N={r.timed})</small></span>)}</div><svg className="comparison-plot" viewBox={`0 0 660 ${height}`} role="img" aria-label="Event lap-time comparison">
    <text x={left} y={13}>{time(min)}</text><text x={right} y={13} textAnchor="end">{time(max)}</text>
    {references.filter(r=>Number.isFinite(r.mean)).map(r=><line className="category-average-line" key={r.key} x1={x(r.mean)} x2={x(r.mean)} y1={20} y2={height} stroke={r.colour} strokeWidth={1.5} strokeDasharray="5 3"><title>{`${r.label} average: ${time(r.mean)}`}</title></line>)}
    {timed.map((row,i)=>{const y=30+i*23;const name=driverDisplayParts(row.driver);const selected=driverIdentityKey(row.driver)===driverIdentityKey(focus);return <g key={row.car+row.driver} className={selected?"comparison-plot-focus":undefined}>
      {selected&&<rect x={0} y={y-11} width={660} height={22} rx={3} fill="var(--focus-row,#e8daf7)"/>}<text x={2} y={y+4}>
      <tspan fontWeight="400">{row.car} </tspan><tspan fontWeight="700">{name.surname}</tspan><tspan fontWeight="400">, {name.given}</tspan>
    </text><line x1={left} x2={x(row.value)} y1={y} y2={y} stroke={carColour(row.car,context)} strokeWidth={selected?7:4}/><circle cx={x(row.value)} cy={y} r={selected?5:3} stroke={selected?"var(--text)":"none"} strokeWidth={1.5} fill={carColour(row.car,context)}/><title>{`${selected?"Selected driver · ":""}${displayDriverName(row.driver)}: ${time(row.value)}`}</title></g>;})}
  </svg></>;
}
