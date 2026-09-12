"use client";
import { useMemo,useState } from "react";
import type { Lap } from "../src/models/race";
import { gapInFront } from "../src/analysis/gap-in-front";
export default function GapInFront({laps,visible,focus}:{laps:Lap[];visible:Lap[];focus:string}){
 const [car,setCar]=useState("");const [axis,setAxis]=useState("elapsed");const [autoY,setAutoY]=useState(true);
 const [limit,setLimit]=useState(10);const [near,setNear]=useState(2);
 const options=[...new Set(visible.map(l=>l.carNumber))];
 const selected=options.includes(car)?car:visible.find(l=>l.driver===focus)?.carNumber||options[0]||"";
 const points=useMemo(()=>gapInFront(laps,visible.filter(l=>l.carNumber===selected)),[laps,visible,selected]);
 const valid=points.filter(p=>p.gap!==null);const close=valid.filter(p=>p.gap!<=near);
 const xVal=(p:typeof points[number])=>axis==="lap"?p.lap.lapNumber:(p.lap.elapsed??0)/60;
 const ceiling=autoY?Math.max(1,Math.ceil(Math.max(0,...valid.map(p=>p.gap!)))):limit;
 const maxX=Math.max(1,...points.map(xVal));const x=(n:number)=>65+n/maxX*1010;const y=(n:number)=>330-n/ceiling*290;
 return <section><h2>GAP IN FRONT · ABSOLUTE SAME-CLASS TIMING GAP</h2>
 <div className="seasonControls">
 <label>CAR <select value={selected} onChange={e=>setCar(e.target.value)}>{options.map(c=><option key={c} value={c}>#{c} · {visible.find(l=>l.carNumber===c)?.team}</option>)}</select></label>
 <label>X AXIS <select value={axis} onChange={e=>setAxis(e.target.value)}><option value="elapsed">Elapsed minutes</option><option value="lap">Race laps</option></select></label>
 <label><input type="checkbox" checked={autoY} onChange={e=>setAutoY(e.target.checked)}/> Auto Y · show all gaps</label>
 <label>Y MAX (s)<input type="number" min="1" disabled={autoY} value={limit} onChange={e=>setLimit(Math.max(1,Number(e.target.value)||1))}/></label>
 <label>CLOSE GAP (s)<input type="number" min="0" step="0.5" value={near} onChange={e=>setNear(Math.max(0,Number(e.target.value)||0))}/></label>
 </div>
 <p>Absolute difference between ELAPSED timestamps at completion of the same race lap, to the preceding car in the same class. All laps included: start, pits, neutralisations and final laps. LMP2 includes Pro-Am. Rivals are found in the full field, even when hidden by driver filters. This CSV does not provide a direct same-class gap column; the gap is calculated from its timing timestamps.</p>
 <p>{valid.length} comparable crossings · {close.length} at ≤{near.toFixed(1)} s ({valid.length?(100*close.length/valid.length).toFixed(1):"—"}%). This is proximity, not proven blocking or time lost.</p>
 <svg viewBox="0 0 1100 385" style={{width:"100%",background:"#f5f6f7"}} role="img" aria-label="Gap in seconds to the same-class car ahead">
 {Array.from({length:11},(_,i)=>i*ceiling/10).map(n=><g key={n}><line x1="65" x2="1075" y1={y(n)} y2={y(n)} stroke="#ccd3d9"/><text x="56" y={y(n)+4} textAnchor="end" fontSize="12">{n.toFixed(1)}</text></g>)}
 {Array.from({length:11},(_,i)=>i*maxX/10).map(n=><text key={n} x={x(n)} y="351" textAnchor="middle" fontSize="12">{n.toFixed(0)}</text>)}
 <text x="550" y="377" textAnchor="middle">{axis==="lap"?"Race lap":"Race elapsed (minutes)"}</text><text transform="translate(18,190) rotate(-90)" textAnchor="middle">Gap in front (seconds)</text>
 {near<=ceiling&&<line x1="65" x2="1075" y1={y(near)} y2={y(near)} stroke="#c42c39" strokeDasharray="5 4"/>}
 {points.map((p,i)=>{if(p.gap===null||p.gap>ceiling)return null;const prev=points[i-1];
 const connect=prev&&prev.gap!==null&&prev.gap<=ceiling&&prev.ahead===p.ahead&&prev.lap.event===p.lap.event&&prev.lap.session===p.lap.session&&prev.lap.driver===p.lap.driver&&prev.lap.lapNumber+1===p.lap.lapNumber;
 return <g key={p.lap.id}>{connect&&<line x1={x(xVal(prev))} y1={y(prev.gap!)} x2={x(xVal(p))} y2={y(p.gap)} stroke="#244b75" strokeWidth="2"/>}<circle cx={x(xVal(p))} cy={y(p.gap)} r="3" fill={p.gap<=near?"#c42c39":"#244b75"}><title>{p.lap.driver} · Lap {p.lap.lapNumber} · Ahead #{p.ahead} · {p.gap.toFixed(3)} s</title></circle></g>;})}
 </svg>
 <p>Y limit only changes the visible range, not the statistics. Lines break on missing observations, rival changes and driver changes. No gap is invented when there is no preceding same-class crossing. No pit, flag, lap-time or rival-next-lap filters. Large gaps can include a lap deficit and are not proof of blocking.</p>
 <details><summary>Crossing details · {points.length} observations</summary><div className="tableWrap"><table><thead><tr><th>LAP</th><th>ELAPSED min</th><th>DRIVER</th><th>AHEAD</th><th>GAP s</th><th>STATUS</th></tr></thead><tbody>{points.map(p=><tr key={p.lap.id}><td>{p.lap.lapNumber}</td><td>{((p.lap.elapsed??0)/60).toFixed(2)}</td><td>{p.lap.driver}</td><td>{p.ahead?`#${p.ahead}`:"—"}</td><td>{p.gap?.toFixed(3)??"—"}</td><td>{p.reason||"Comparable"}</td></tr>)}</tbody></table></div></details>
 </section>;
}
