import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile,rename} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {gzipSync,gunzipSync} from "node:zlib";
import {qualifyingUrl,type Championship} from "../../../../src/alkamel";
import {parseQualifying} from "../../../../src/analysis/qualifying";
import {download} from "../../../../src/reliable-download";
export const runtime="nodejs";
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  let url:string;
  try{url=qualifyingUrl(params.get("championship") as Championship,params.get("path")||"");}
  catch{return Response.json({error:"Invalid qualifying session"},{status:400});}
  const directory=process.env.RACE_CACHE_DIR||join(tmpdir(),"uraice-races");
  const key=createHash("sha256").update("qualifying-1:"+url).digest("hex");
  const file=join(directory,`${key}.json.gz`);
  try {
    try{return Response.json({laps:JSON.parse(gunzipSync(await readFile(file)).toString()),cached:true});}catch{}
    const csv=await download(url,r=>r.text(),{timeoutMs:60_000});
    if(!csv.includes("LAP_NUMBER"))throw new Error("Unexpected qualifying CSV");
    const laps=parseQualifying(csv);
    if(!laps.length)throw new Error("No qualifying laps published");
    try{await mkdir(directory,{recursive:true});const temporary=join(directory,`${key}.${crypto.randomUUID()}.tmp`);await writeFile(temporary,gzipSync(JSON.stringify(laps)));await rename(temporary,file);}catch{}
    return Response.json({laps,cached:false});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Qualifying unavailable"},{status:502});}
}
