"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { Lap } from "../src/models/race";
import { mean } from "../src/analysis/driver_metrics";
import { CONFIG } from "../src/config";
import { absoluteSummaryDrivers, type SeasonLapCounts } from "../src/analysis/season-comparison";
import { aggregateSeason, seasonDelta, seasonReferences, comparisonReference, exclusionsForEvent, type SeasonExclusions, type SeasonReference } from "../src/analysis/season-aggregate";

const time=(n:number)=>Number.isFinite(n)?`${Math.floor(n/60)}:${(n%60).toFixed(3).padStart(6,"0")}`:"—";
const signed=(n:number,unit:string)=>Number.isFinite(n)?`${n>0?"+":""}${n.toFixed(3)}${unit}`:"—";
function Delta({value,unit}:{value:number;unit:string}){return <td className={Number.isFinite(value)?value<=0?"summaryBetter":"summaryWorse":""}>{signed(value,unit)}</td>;}
export default function SeasonAggregate({laps,events,driver,excluded,className,lapCounts,shownCategories,setShownCategories,comparison=false}:{laps:Lap[];events:string[];driver:string;excluded:SeasonExclusions;className:string;lapCounts:SeasonLapCounts;shownCategories:string[];setShownCategories:Dispatch<SetStateAction<string[]>>;comparison?:boolean}) {
  const [omitted,setOmitted]=useState<string[]>([]);
  const [chosenClass,setChosenClass]=useState("");
  const [reference,setReference]=useState<SeasonReference>("race");
  const [metric,setMetric]=useState<"best"|"avgBest">("avgBest");
  const referenceLabel={race:"Best race",category:"Best category",gold:"Gold AVG",silver:"Silver AVG"}[reference];
  const classes=[...new Set(laps.filter(l=>events.includes(l.event)).map(l=>l.className))];
  const target=classes.includes(chosenClass)?chosenClass:className!=="All"?className: laps.find(l=>l.driver===driver&&events.includes(l.event))?.className||classes[0]||"LMP2";
  const rounds=aggregateSeason(laps,events.filter(e=>!omitted.includes(e)),excluded,target,lapCounts);
  const comparisonRounds=rounds.map(r=>({...r,drivers:absoluteSummaryDrivers(laps.filter(l=>l.event===r.event),lapCounts)
    .filter(m=>!exclusionsForEvent(excluded,r.event).includes(m.driver)&&m.className===target&&Number.isFinite(m[metric]))}));
  const names=[...new Set(comparisonRounds.flatMap(r=>r.drivers.filter(m=>shownCategories.includes(m.category)||m.driver===driver).map(m=>m.driver)))];
  const ranked=names.map(name=>{
    const samples=comparisonRounds.flatMap(r=>{const m=r.drivers.find(x=>x.driver===name);const ref=m?comparisonReference(r.drivers,m.category,metric,reference):NaN;
      return m?[{...seasonDelta(m[metric],ref),reference:ref,event:r.event,metric:m}]:[];});
    const valid=samples.filter(s=>Number.isFinite(s.seconds)&&Number.isFinite(s.percent));
    return {name,samples,valid:valid.length,seconds:mean(valid.map(s=>s.seconds)),percent:mean(valid.map(s=>s.percent))};
  }).sort((a,b)=>(Number.isFinite(a.seconds)?a.seconds:Infinity)-(Number.isFinite(b.seconds)?b.seconds:Infinity));
  const focused=rounds.map(r=>({...r,selected:r.drivers.find(m=>m.driver===driver)}));
  return <section className="seasonAggregate">
    <h2>{comparison?"COMPARISON DRIVERS SEASON":"FOCUS · MULTI-EVENT SUMMARY"}</h2>
    <label>CAR CLASS <select value={target} onChange={e=>setChosenClass(e.target.value)}>{classes.map(c=><option key={c}>{c}</option>)}</select></label>
    {comparison && <>
      <label>METRIC <select value={metric} onChange={e=>setMetric(e.target.value as "best"|"avgBest")}><option value="best">Best race lap</option><option value="avgBest">Best N average (round sample)</option></select></label>
      <label>DELTA REFERENCE <select value={reference} onChange={e=>setReference(e.target.value as SeasonReference)}><option value="race">Best race</option><option value="category">Best category (driver's own)</option><option value="gold">Gold AVG</option><option value="silver">Silver AVG</option></select></label>
      <fieldset className="categoryTicks"><legend>SHOW DRIVER CATEGORIES</legend>{Object.keys(CONFIG.CATEGORY_COLOURS).map(cat=><label key={cat}><input type="checkbox" checked={shownCategories.includes(cat)} onChange={()=>setShownCategories(prev=>prev.includes(cat)?prev.filter(c=>c!==cat):[...prev,cat])}/>{cat}</label>)}</fieldset>
      <p>References use the selected metric within this car class. Category filters and per-event exclusions are shared with Driver Summary and remove drivers from benchmarks (focus stays visible).</p>
    </>}
    <fieldset className="categoryTicks"><legend>EVENTS INCLUDED IN THIS SUMMARY</legend>{events.map(event=><label key={event}><input type="checkbox" checked={!omitted.includes(event)} onChange={()=>setOmitted(prev=>prev.includes(event)?prev.filter(e=>e!==event):[...prev,event])}/>{event}</label>)}</fieldset>
    <p>{comparison&&metric==="best"?"Absolute best lap.":"Absolute best-N average: 10 or 20 as selected for each round; full sample required."} Category filters are shared; manual and cutoff exclusions apply separately per event. Each available event has equal weight. Missing or excluded data is not zero.</p>
    {!comparison?<div className="tableWrap"><table>
      <thead><tr><th>EVENT</th><th>{driver || "SELECT FOCUS DRIVER"} · AVG</th>{seasonReferences.map(ref=><th key={ref} colSpan={2}>{ref}</th>)}</tr>
        <tr><th/><th>Round sample</th>{seasonReferences.map(ref=><FragmentHeaders key={ref}/>)}</tr></thead>
      <tbody>{focused.map(r=><tr key={r.event}><th>{r.event} · {r.count} laps</th><td>{r.selected?`#${r.selected.car} ${time(r.selected.avgBest)}`:"—"}</td>
        {r.references.map(ref=>{const d=seasonDelta(r.selected?.avgBest??NaN,ref.value);return <ReferenceCells key={ref.label} reference={ref.value} drivers={ref.count} seconds={d.seconds}/>;})}</tr>)}
        <tr><th>MEAN EVENT DELTA</th><td>{focused.filter(r=>r.selected).length} events</td>{seasonReferences.map((ref,i)=>{
          const ds=focused.map(r=>seasonDelta(r.selected?.avgBest??NaN,r.references[i].value)).filter(d=>Number.isFinite(d.seconds));
          return <ReferenceCells key={ref} count={ds.length} seconds={mean(ds.map(d=>d.seconds))}/>;
        })}</tr></tbody></table></div>:<div className="tableWrap"><table>
        <thead><tr><th>RANK</th><th>DRIVER</th><th>EVENTS</th>{rounds.map(r=><th key={r.event}>{r.event} · {metric==="best"?"1 lap":`${r.count} laps`}<br/>Gap s vs {referenceLabel}</th>)}<th>MEAN GAP s</th></tr></thead>
        <tbody>{ranked.map((row,i)=><tr key={row.name} className={row.name===driver?"focusDriver":""}><td>{Number.isFinite(row.seconds)?i+1:"—"}</td><td style={{background:row.name===driver?"#ef2ac1":CONFIG.CATEGORY_COLOURS[row.samples[0]?.metric.category as keyof typeof CONFIG.CATEGORY_COLOURS],color:"#17202a",fontWeight:700}}>
          {[...new Set(row.samples.map(s=>s.metric.car))].map(car=><CarBadge key={car} car={car}/>)} {row.name}</td><td>{row.valid}/{rounds.length}</td>
          {rounds.map(r=>{const s=row.samples.find(x=>x.event===r.event);return <td key={r.event} className={s&&Number.isFinite(s.seconds)?s.seconds<=0?"summaryBetter":"summaryWorse":""} title={s?`Driver: ${time(s.metric[metric])}; reference: ${time(s.reference)}`:undefined}>{s?signed(s.seconds," s"):"—"}</td>;})}
          <Delta value={row.seconds} unit=" s"/></tr>)}</tbody>
      </table><p>Ranked by mean event gap in seconds to {referenceLabel}. Gap = driver − reference. Compare event coverage before interpreting ranks.</p></div>}
  </section>;
}
function CarBadge({car}:{car:string}){return <span style={{display:"inline-block",minWidth:26,padding:"2px 4px",marginRight:4,border:"1px solid #526177",background:CONFIG.CAR_COLOURS[car as keyof typeof CONFIG.CAR_COLOURS]||"#d4dae0",color:["22","18","24"].includes(car)?"white":"#111",fontWeight:800}}>{car}</span>;}
function FragmentHeaders(){return <><th>AVG</th><th>Δ s</th></>;}
function ReferenceCells({reference,count,drivers,seconds}:{reference?:number;count?:number;drivers?:number;seconds:number}){return <><td>{count!==undefined?`N=${count}`:<>{time(reference??NaN)}{drivers!==undefined&&<small style={{display:"block"}}>N={drivers} drivers included</small>}</>}</td><Delta value={seconds} unit=" s"/></>;}
