import {driverIdentityKey} from "../models/driver-identity";
import {carClassKey} from "../models/car-class";
import type {GradingDriver} from "./workbook-grading";
export const comparisonCategories=[
  {key:"silver",label:"Silver",colour:"#75879b",matches:(r:GradingDriver)=>r.category==="Silver"},
  {key:"goldPlatinum",label:"Gold / Platinum",colour:"#bd951e",matches:(r:GradingDriver)=>r.category==="Gold"||r.category==="Platinum"},
  {key:"bronze",label:"Bronze",colour:"#b87333",matches:(r:GradingDriver)=>r.category==="Bronze"},
];
const average=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;
const numbers=(rows:GradingDriver[])=>rows.map(r=>r.value).filter(Number.isFinite);
export function cohortStatistics(rows:GradingDriver[]){
  const values=numbers(rows),mean=average(values);
  const std=values.length>1?Math.sqrt(values.reduce((sum,n)=>sum+(n-mean)**2,0)/(values.length-1)):NaN;
  const top10=values.length>=10?average([...values].sort((a,b)=>a-b).slice(0,10)):NaN;
  return {mean,std,lower:mean-std,upper:mean+std,corrected:average(values.filter(n=>n>=mean-std&&n<=mean+std)),top10,best:values.length?Math.min(...values):NaN,count:rows.length,timed:values.length};
}
const teamKey=(value:string)=>value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s\p{P}]+/gu," ").trim();
export function gradingComparison(rows:GradingDriver[],focus:string,context:GradingDriver[]=rows){
  const sameDriver=(r:GradingDriver)=>driverIdentityKey(r.driver)===driverIdentityKey(focus);
  const focal=context.find(sameDriver),selected=rows.find(sameDriver);
  const eligible=focal?rows.filter(r=>carClassKey(r.className)===carClassKey(focal.className)):rows;
  const key=focal?teamKey(focal.team):"";
  const known=Boolean(key&&!/^(?:unknown(?: team)?|none|n a)$/.test(key));
  const members=known?eligible.filter(r=>teamKey(r.team)===key):[];
  const groups=[{key:"overall",label:"Overall",rows:eligible},...comparisonCategories.map(c=>({...c,rows:eligible.filter(c.matches)}))];
  const focusTime=selected?.value??NaN;
  const columns=groups.map(group=>{
    const stats=cohortStatistics(group.rows);
    const teamRows=group.key==="overall"?members:members.filter(r=>comparisonCategories.find(c=>c.key===group.key)!.matches(r));
    const team=cohortStatistics(teamRows);
    return {key:group.key,label:group.label,values:{focus:group.key==="overall"||group.rows.some(sameDriver)?focusTime:NaN,
      average:stats.mean,deltaAverage:focusTime-stats.mean,top10:stats.top10,deltaTop10:focusTime-stats.top10,deltaFastest:focusTime-stats.best,
      driverCount:stats.count,std:stats.std,lower:stats.lower,upper:stats.upper,corrected:stats.corrected,deltaCorrected:focusTime-stats.corrected,
      teamCount:known?team.count:NaN,teamAverage:team.mean,deltaTeamAverage:focusTime-team.mean,teamBest:team.best,deltaTeamBest:focusTime-team.best}};
  });
  return {columns,team:{name:known?focal!.team:"",members,cars:[...new Set(members.map(r=>r.car))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),timed:members.filter(r=>Number.isFinite(r.value)).length}};
}
export function lapHeatColour(value:number,values:number[]){
  const valid=values.filter(Number.isFinite);if(!Number.isFinite(value)||!valid.length)return "transparent";
  const min=Math.min(...valid),max=Math.max(...valid),p=min===max ? 0.5 : Math.max(0,Math.min(1,(value-min)/(max-min)));
  const colours=[[248,105,107],[255,235,132],[99,190,123]];
  const a=colours[p<=.5?0:1],b=colours[p<=.5?1:2],fraction=p<=.5?p*2:(p-.5)*2;
  return `rgb(${a.map((n,i)=>Math.round(n+(b[i]-n)*fraction)).join(",")})`;
}
