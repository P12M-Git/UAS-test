/** Le Mans belongs to WEC even when its imported filename starts with ELMS. */
export function eventChampionship(event:string):"ELMS"|"WEC" {
  return /\bWEC\b|LM24|LE[\s_-]*MANS/i.test(event)?"WEC":"ELMS";
}
export function eventTheme(event:string){return eventChampionship(event)==="WEC"?"event-wec":"event-elms";}
export function eventLabel(file:string):string {
  const stem=file.replace(/\.csv$/i,"");
  const code=stem.match(/(\d{2})(?:ELMS|WEC|LMC)(?:R\d{2})?[_ -]([A-Z0-9]+)/i);
  const year=stem.match(/(?:^|\D)(20\d{2})(?!\d)/)?.[1] || (code?`20${code[1]}`:undefined);
  const names:Record<string,string>={BARC:"Barcelona",RICA:"Le Castellet",IMOL:"Imola",SPAF:"Spa-Francorchamps",SPA:"Spa-Francorchamps",SILV:"Silverstone",PORT:"Portimão"};
  const championship=eventChampionship(stem);
  const circuit=championship==="WEC"&&/LM24|LE[\s_-]*MANS/i.test(stem)?"LM24":
    code?names[code[2].toUpperCase()]||code[2]:stem.replace(/\b(?:ELMS|WEC|20\d{2})\b/gi,"").replace(/^[, _-]+|[, _-]+$/g,"");
  return [championship,circuit,year].filter(Boolean).join(", ");
}
