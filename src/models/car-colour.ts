import {CONFIG} from "../config";
import catalogue from "../alkamel-catalogue.json";
import {eventLabel} from "./event-identity";
export const ALMS_2027_LMP2_COLOURS:Record<string,string>={
  "22":"#ff0000","11":"#808080","43":"#ffff00","30":"#948a54",
  "3":"#ff8000","83":"#e6b8b7","24":"#7030a0","20":"#92cddd",
  "25":"#215867","4":"#c00040","2":"#00b0f0","16":"#ffc000",
  "55":"#dbe5f1","37":"#366092","66":"#3300cc","34":"#92d050",
};
const contexts=new Set<string>();
export function registerColourRaces(races:{championship:string;season:string;sourceFile:string}[]){
  for(const race of races)if(race.championship==="ALMS"&&race.season==="2026-2027"){
    contexts.add(race.sourceFile);contexts.add(eventLabel(race.sourceFile));
  }
}
registerColourRaces(catalogue);
export function carColour(car:string,context=""){
  const event=context.split("|")[0];
  return (contexts.has(context)||contexts.has(event)?ALMS_2027_LMP2_COLOURS[car]:undefined)
    ||CONFIG.CAR_COLOURS[car as keyof typeof CONFIG.CAR_COLOURS]||"#c7d0da";
}
export function carTextColour(background:string){
  const n=Number.parseInt(background.slice(1),16);return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)<130?"#fff":"#111";
}
