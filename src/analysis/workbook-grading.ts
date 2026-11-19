import {driverIdentityKey} from "../models/driver-identity";
export type GradingMode="Qualifying"|"Race"|"Race 20";
export interface GradingDriver {driver:string;car:string;category:string;className:string;team:string;value:number;total:number;}
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;
const numeric=(rows:GradingDriver[])=>rows.map(r=>r.value).filter(Number.isFinite);
const sampleStd=(v:number[])=>v.length>1?Math.sqrt(v.reduce((s,x)=>s+(x-mean(v))**2,0)/(v.length-1)):NaN;
const top10=(v:number[])=>v.length>=10?mean([...v].sort((a,b)=>a-b).slice(0,10)):NaN;
const teamKey=(name:string)=>name.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g," ");
export function workbookGrading(input:GradingDriver[],focus:string,mode:GradingMode){
  const qualifying=mode==="Qualifying";
  const rows=[...input].sort((a,b)=>(Number.isFinite(a.value)?a.value:Infinity)-(Number.isFinite(b.value)?b.value:Infinity));
  const silverRows=rows.filter(r=>r.category==="Silver");
  const all=numeric(rows),silver=numeric(silverRows);
  const selected=rows.find(r=>driverIdentityKey(r.driver)===driverIdentityKey(focus));
  const value=selected?.value??NaN, avg=mean(all),silverAvg=mean(silver);
  const silverStd=sampleStd(silver);
  const referenceCategory=qualifying?"Bronze":"Gold";
  const referenceValues=numeric(rows.filter(r=>r.category===referenceCategory||r.category==="Platinum"));
  const spread=sampleStd(referenceValues);
  const corrected=(v:number[],center:number,sd:number)=>mean(v.filter(n=>n>=center-sd&&n<=center+sd));
  const silverCorr=corrected(silver,silverAvg,silverStd),allCorr=corrected(referenceValues,avg,spread);
  const selectedTeam=selected?teamKey(selected.team):"";
  const knownTeam=selectedTeam && !/^(?:unknown(?: team)?|\u2014|\?|-)$/.test(selectedTeam);
  const team=knownTeam?rows.filter(r=>teamKey(r.team)===selectedTeam):[];
  const teamValues=numeric(team),teamAvg=mean(teamValues),teamBest=teamValues.filter(n=>n>1).length?Math.min(...teamValues.filter(n=>n>1)):NaN;
  const pace=mode==="Race 20"?"Best 20 AVG":"Fastest lap";
  const metric=(key:string,label:string,n:number,kind:"time"|"delta"|"count"="time")=>({key,label,value:n,kind});
  return [
    metric("focus",`${pace} · focus`,value),
    metric("silverAvg",`AVG Silver · ${pace}`,silverAvg),metric("average",`AVG ${pace}`,avg),
    metric("deltaSilver","Delta to AVG Silver",value-silverAvg,"delta"),metric("deltaAverage",`Delta to AVG ${pace}`,value-avg,"delta"),
    metric("silverTop10","AVG Silver TOP 10",top10(silver)),metric("top10",`AVG ${pace} TOP 10`,top10(all)),
    metric("deltaSilverTop10","Delta to AVG Silver TOP 10",value-top10(silver),"delta"),metric("deltaTop10",`Delta to ${pace} TOP 10`,value-top10(all),"delta"),
    metric("deltaFastest",`Delta to fastest ${pace}`,value-(all.length?Math.min(...all):NaN),"delta"),
    metric("silverCount","Number of Silver",rows.filter(r=>r.category==="Silver").length,"count"),
    metric("driverCount","Number of drivers",rows.length||NaN,"count"),
    metric("silverStd","Standard deviation Silver",silverStd),metric("silverLower","Interval 1 Silver",silverAvg-silverStd),metric("silverUpper","Interval 2 Silver",silverAvg+silverStd),
    metric("silverCorrected","AVG Silver corrected",silverCorr),metric("deltaSilverCorrected","Delta to AVG Silver corrected",value-silverCorr,"delta"),
    metric("std",`Standard deviation ${referenceCategory} / Platinum`,spread),metric("lower","Interval 1",avg-spread),metric("upper","Interval 2",avg+spread),
    metric("corrected",`AVG ${pace} corrected · ${referenceCategory} / Platinum`,allCorr),metric("deltaCorrected",`Delta to AVG ${pace} corrected`,value-allCorr,"delta"),
    metric("teamCount","Number in Team",team.length||NaN,"count"),metric("teamAverage",`${pace} AVG in Team`,teamAvg),
    metric("deltaTeamAverage","Delta to AVG in Team",value-teamAvg,"delta"),metric("teamBest",`Fastest ${pace} in Team`,teamBest),
    metric("deltaTeamBest","Delta to fastest in Team",value-teamBest,"delta"),
  ];
}
