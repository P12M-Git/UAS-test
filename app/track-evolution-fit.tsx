"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { relativePace, consecutiveObservedLaps, type Stint } from "../src/analysis/relative-pace";
import { mean, median, std, mad } from "../src/analysis/driver_metrics";
import { CONFIG } from "../src/config";

const fmt=(n:number)=>Number.isFinite(n)?`${n>0?"+":""}${n.toFixed(3)}`:"—";
const lapTime=(n:number)=>Number.isFinite(n)?`${Math.floor(n/60)}:${(n%60).toFixed(3).padStart(6,"0")}`:"—";
type Row=ReturnType<typeof relativePace>[number];
export default function TrackEvolutionFit({stints,visible,driver,setDriver,cap,percent,setCap,setPercent}: {
  stints:Stint[];visible:Stint[];driver:string;setDriver:(s:string)=>void;
  cap:boolean;percent:number;setCap:(b:boolean)=>void;setPercent:(n:number)=>void;
}) {
  const [colour,setColour]=useState("category"),[dots,setDots]=useState(true),[fits,setFits]=useState(true);
  const [shownCategories,setShownCategories]=useState<string[]>(Object.keys(CONFIG.CATEGORY_COLOURS));
  const canvas=useRef<HTMLCanvasElement>(null);
  const normalised=useMemo(()=>relativePace(stints,cap?percent:undefined),[stints,cap,percent]);
  const ids=new Set(visible.map(s=>s.id));
  const rows=normalised.filter(r=>ids.has(r.stint.id) && shownCategories.includes(r.stint.category));
  const raceEnd=Math.max(1,...stints.map(s=>s.end).filter(Number.isFinite));
  const summaries=[...new Set(rows.map(r=>`${r.stint.car}|${r.stint.driver}`))].map(key=>{
    const group=rows.filter(r=>`${r.stint.car}|${r.stint.driver}`===key),stint=group[0].stint;
    const points=group.flatMap(r=>r.points),matched=points.filter(p=>p.delta!==null),deltas=matched.map(p=>p.delta!);
    return {key,stint,group,used:matched.length,total:points.length,missing:points.length-matched.length,
      normalised:median(matched.map(p=>p.normalised!)),delta:median(deltas),std:std(deltas),mad:mad(deltas),
      early:median(matched.filter(p=>p.lap.elapsed!<=raceEnd/3).map(p=>p.normalised!)),
      late:median(matched.filter(p=>p.lap.elapsed!>=raceEnd*2/3).map(p=>p.normalised!)),
      raw:mean(group.map(r=>r.matchedRawFit.slope).filter(Number.isFinite)),
      timeSlope:mean(group.map(r=>r.timeFit.slope).filter(Number.isFinite)),
      relative:mean(group.map(r=>r.relativeFit.slope).filter(Number.isFinite))};
  }).sort((a,b)=>(Number.isFinite(a.delta)?a.delta:Infinity)-(Number.isFinite(b.delta)?b.delta:Infinity));
  const lineColour=(s:Stint)=>s.driver===driver?"#a326cc":colour==="category"
    ? CONFIG.CATEGORY_COLOURS[s.category as keyof typeof CONFIG.CATEGORY_COLOURS] || "#64748b"
    : CONFIG.CAR_COLOURS[s.car as keyof typeof CONFIG.CAR_COLOURS] || "#64748b";
  useEffect(()=>{
    const el=canvas.current,ctx=el?.getContext("2d"); if(!el||!ctx)return;
    el.width=1400;el.height=550;ctx.fillStyle="#f5f6f7";ctx.fillRect(0,0,1400,550);
    ctx.font="14px Arial";
    const points=rows.flatMap(r=>r.points).filter(p=>p.delta!==null);
    if(!points.length){ctx.fillStyle="#17202a";ctx.fillText(rows.length ? "Insufficient reference: at least 3 rival drivers needed within ±2.5 minutes." : "No stints match the display filters.",90,80);return;}
    const values=points.map(p=>p.normalised!);
    if(fits) rows.forEach(r=>{if(Number.isFinite(r.timeFit.slope))r.points.filter(p=>p.normalised!==null).forEach(p=>values.push(r.timeFit.intercept+r.timeFit.slope*p.lap.elapsed!/60));});
    const low=Math.floor(Math.min(...values)),high=Math.max(low+1,Math.ceil(Math.max(...values)));
    const step=1;
    const x=(elapsed:number)=>90+elapsed/raceEnd*1270,y=(delta:number)=>475-(delta-low)/(high-low)*425;
    ctx.textAlign="right";
    for(let v=low;v<=high+0.001;v+=step){ctx.strokeStyle="#d2d8de";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(90,y(v));ctx.lineTo(1360,y(v));ctx.stroke();ctx.fillStyle="#17202a";ctx.fillText(lapTime(v),80,y(v)+4);}

    ctx.textAlign="center";for(let i=0;i<=8;i++)ctx.fillText((raceEnd*i/8/60).toFixed(0),x(raceEnd*i/8),500);
    ctx.fillText("Race elapsed (minutes) · Normalised lap time (m:ss.000)",720,532);
    for(const r of [...rows].sort((a,b)=>Number(a.stint.driver===driver)-Number(b.stint.driver===driver))){
      ctx.strokeStyle=lineColour(r.stint);ctx.fillStyle=ctx.strokeStyle;ctx.globalAlpha=driver&&r.stint.driver!==driver?0.6:1;ctx.lineWidth=r.stint.driver===driver?4:1.7;
      if(dots)r.points.forEach(p=>{if(p.delta===null)return;ctx.beginPath();ctx.arc(x(p.lap.elapsed!),y(p.normalised!),r.stint.driver===driver?3:2,0,Math.PI*2);ctx.fill();});
      ctx.beginPath();r.points.forEach((p,i)=>{if(p.normalisedSmooth===null)return;const prev=r.points[i-1];if(!prev||prev.normalisedSmooth===null||!consecutiveObservedLaps(prev.lap,p.lap))ctx.moveTo(x(p.lap.elapsed!),y(p.normalisedSmooth!));else ctx.lineTo(x(p.lap.elapsed!),y(p.normalisedSmooth!));});ctx.stroke();
      if(fits&&Number.isFinite(r.timeFit.slope)){
        const points=r.points.filter(p=>p.normalised!==null);ctx.setLineDash([6,4]);ctx.beginPath();points.forEach((p,i)=>{const px=x(p.lap.elapsed!),py=y(r.timeFit.intercept+r.timeFit.slope*p.lap.elapsed!/60);if(!i || !consecutiveObservedLaps(points[i-1].lap,p.lap))ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha=1;
  },[normalised,visible,driver,colour,dots,fits,raceEnd,shownCategories]);
  return <section>
    <h2>Track evolution fit</h2>
    <p>5-minute centred window (±2.5 min). Median per rival driver, then median across rivals in the same class; LMP2 includes Pro-Am. The analysed driver is excluded. At least 3 rivals required. Class references use the whole field, independently of driver/car/FIA display filters.</p>
    <p>Same clean-stint filter: no in/out laps or neutralised laps; exclude times above 120% of the eligible stint average. Normalised time = lap time − local reference + fixed event/class baseline (median of each driver’s whole-event median). Solid lines: trailing 3 consecutive clean-lap average, reset at stint/gap boundaries. This compares observed pace, not isolated track grip: fuel, tyres and traffic still contribute.</p>
    <div className="seasonControls">
      <label>COLOUR BY<select value={colour} onChange={e=>setColour(e.target.value)}><option value="category">FIA category</option><option value="car">Car / team</option></select></label>
      <label><span><input type="checkbox" checked={cap} onChange={e=>setCap(e.target.checked)}/>Percentage cutoff (% fastest in each class)</span><input type="number" min="100" max="200" step="0.5" value={percent} onChange={e=>setPercent(Math.max(100,Math.min(200,Number(e.target.value)||100)))}/></label>
      <label><input type="checkbox" checked={dots} onChange={e=>setDots(e.target.checked)}/>Normalised lap times</label>
      <label><input type="checkbox" checked={fits} onChange={e=>setFits(e.target.checked)}/>Normalised time fits vs elapsed (dashed)</label>
    </div>
    <fieldset className="raceChecks" aria-label="Visible FIA categories">
      <legend>SHOW DRIVER CATEGORIES</legend>
      <label><input type="checkbox" checked={shownCategories.length===Object.keys(CONFIG.CATEGORY_COLOURS).length}
        onChange={()=>setShownCategories(shownCategories.length===Object.keys(CONFIG.CATEGORY_COLOURS).length?[]:Object.keys(CONFIG.CATEGORY_COLOURS))}/>All</label>
      {Object.entries(CONFIG.CATEGORY_COLOURS).map(([name,c])=><label key={name} style={{borderLeft:`8px solid ${c}`,padding:"4px 10px"}}>
        <input type="checkbox" checked={shownCategories.includes(name)} onChange={()=>setShownCategories(previous=>previous.includes(name)?previous.filter(x=>x!==name):[...previous,name])}/>{name}</label>)}
      <span>Focus: purple. Filters affect plots and tables, not the class reference. Upper display filters still apply.</span>
    </fieldset>
    <p>Lines stop at missing/filtered laps and breaks in observed running. No interpolation or extrapolation across those gaps.</p>
    <canvas ref={canvas} className="raceCanvas" aria-label="Normalised lap times and elapsed-time fits versus race elapsed time"/>
    <p>Early / late = first / last third of the event; “—” means no comparable sample. Raw and relative DEG use the SAME referenced laps; driver summary DEG is the mean of valid stint slopes (s/lap).</p>
    <div className="tableWrap"><table><thead><tr>{["CAR / DRIVER","CLASS / FIA","USED / ELIGIBLE","INSUFFICIENT","MEDIAN NORMALISED","EARLY NORMALISED","LATE NORMALISED","STD Δ","MAD Δ","RAW DEG","RELATIVE DEG","TIME FIT (s/min)"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {summaries.map(s=><tr key={s.key} className={s.stint.driver===driver?"performanceFocus":""}>
        <td><button onClick={()=>setDriver(s.stint.driver)} style={{borderLeft:`6px solid ${lineColour(s.stint)}`}}>#{s.stint.car} {s.stint.driver}</button></td><td>{s.stint.className} / {s.stint.category}</td><td>{s.used} / {s.total}</td><td>{s.missing}</td>
        {[s.normalised,s.early,s.late,s.std,s.mad,s.raw,s.relative,s.timeSlope].map((v,i)=><td key={i}>{i<3?lapTime(v):fmt(v)}</td>)}
      </tr>)}
    </tbody></table></div>
    <details><summary>Per-stint degradation and sample coverage</summary><div className="tableWrap"><table><thead><tr>{["DRIVER / CAR","STINT","USED / ELIGIBLE","RAW DEG (ALL ELIGIBLE)","RAW DEG (MATCHED)","RELATIVE DEG","TIME FIT (s/min)"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {rows.map((r:Row)=><tr key={r.stint.id}><td>#{r.stint.car} {r.stint.driver}</td><td>{r.stint.ordinal}</td><td>{r.relativeFit.n} / {r.points.length}</td><td>{fmt(r.rawFit.slope)}</td><td>{fmt(r.matchedRawFit.slope)}</td><td>{fmt(r.relativeFit.slope)}</td><td>{fmt(r.timeFit.slope)}</td></tr>)}
    </tbody></table></div></details>
  </section>;
}
