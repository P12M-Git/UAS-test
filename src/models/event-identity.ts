/** Le Mans belongs to WEC even when its imported filename starts with ELMS. */
export function eventChampionship(event:string):"ELMS"|"WEC"|"ALMS"|"IMSA" {
  if (/\bIMSA\b/i.test(event)) return "IMSA";
  if (/\bALMS\b/i.test(event)) return "ALMS";
  return /\bWEC\b|LM24|LE[\s_-]*MANS/i.test(event)?"WEC":"ELMS";
}
export function eventTheme(event:string){const championship=eventChampionship(event);return championship==="WEC"?"event-wec":championship==="ALMS"?"event-alms":championship==="IMSA"?"event-imsa":"event-elms";}
export function compareEventsByRound(a: string, b: string): number {
  const series = eventChampionship(a).localeCompare(eventChampionship(b));
  if (series) return series;
  const year = Number(a.match(/20\d{2}/)?.[0] || 0) - Number(b.match(/20\d{2}/)?.[0] || 0);
  if (year) return year;
  const round = (event: string) => Number(event.match(/^(?:ELMS|WEC|ALMS|IMSA)[, ]+(\d{1,2})(?:\D|$)/i)?.[1] || Infinity);
  return round(a) - round(b) || a.localeCompare(b, undefined, { numeric: true });
}
export function eventLabel(file:string):string {
  const stem=file.replace(/\.csv$/i,"");
  const code=stem.match(/(\d{2})(?:ELMS|WEC|ALMS|IMSA|LMC)(?:R\d{2}|\d{3})?[_ -]([A-Z0-9]+)/i);
  const year=stem.match(/(?:^|\D)(20\d{2})(?!\d)/)?.[1] || (code?`20${code[1]}`:undefined);
  const names:Record<string,string>={BARC:"Barcelona",RICA:"Le Castellet",IMOL:"Imola",SPAF:"Spa-Francorchamps",SPA:"Spa-Francorchamps",SILV:"Silverstone",PORT:"Portimão"};
  const championship=eventChampionship(stem);
  const circuit=championship==="WEC"&&/LM24|LE[\s_-]*MANS/i.test(stem)?"LM24":
    code?names[code[2].toUpperCase()]||code[2]:stem.replace(/\b(?:ELMS|WEC|ALMS|IMSA|20\d{2})\b/gi,"").replace(/^[, _-]+|[, _-]+$/g,"");
  return [championship,circuit,year].filter(Boolean).join(", ");
}
