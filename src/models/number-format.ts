export function formatTime(value:number|null|undefined,precision=3){
  if(value===null||value===undefined||!Number.isFinite(value))return "—";
  const scale=10**precision;
  const units=Math.round(Math.abs(value)*scale);
  const minutes=Math.floor(units/(60*scale));
  const seconds=(units%(60*scale))/scale;
  return `${value<0&&units>0?"-":""}${minutes}:${seconds.toFixed(precision).padStart(precision?precision+3:2,"0")}`;
}
export function formatNumber(value:number,precision=2){
  if(!Number.isFinite(value))return "—";
  return (Number(value.toFixed(precision))===0?0:value).toFixed(precision);
}
export function plotPercent(value:number,min:number,max:number){
  if(![value,min,max].every(Number.isFinite))return null;
  return Math.max(3,Math.min(97,3+94*(value-min)/(max-min||1)));
}
