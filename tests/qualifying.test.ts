import test from "node:test";
import assert from "node:assert/strict";
import {parseQualifying,qualifyingResults} from "../src/analysis/qualifying";
import {GET} from "../app/api/alkamel/qualifying/route";
import {randomUUID} from "node:crypto";
const header="NUMBER;DRIVER_NAME;TEAM;CLASS;LAP_NUMBER;LAP_TIME;S1;S2;S3;ELAPSED;CROSSING_FINISH_LINE_IN_PIT;PIT_TIME;FLAG_AT_FL;DELETED";
const csv=[header,
 "1;Test Driver;Team;GT3;1;1:31;30;30;31;1:31;;;GF;",
 "1;Test Driver;Team;GT3;2;1:30;29;31;30;3:01;;;GF;",
 "1;Test Driver;Team;GT3;3;1:10;20;25;25;4:11;B;;GF;",
 "1;Test Driver;Team;GT3;4;1:09;20;24;25;5:20;;;RF;",
 "1;Test Driver;Team;GT3;5;1:08;20;24;24;6:28;;;GF;1",
 "1;Other Driver;Team;GT3;6;1:20;26;27;27;7:48;;;GF;",
 "2;Incomplete;Team;LMP2;1;1:40;30;;40;1:40;;;GF;"].join("\n");
test("qualifying uses flying lap 1, excludes pits/red/deleted, and never mixes drivers or missing sectors",()=>{
 const laps=parseQualifying(csv);assert.equal(laps.length,7);
 const row=qualifyingResults(laps).find(r=>r.driver==="Test Driver")!;
 assert.equal(row.best,90);assert.equal(row.bestLap?.s2,31);assert.equal(row.bestS2,30);
 assert.equal(row.theoretical,89);assert.equal(row.potential,1);assert.equal(row.validLaps,2);
 assert.equal(qualifyingResults(laps).find(r=>r.driver==="Incomplete")!.theoretical,null);
});
test("qualifying endpoint validates paths and reuses its shared processed cache",async t=>{
 let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return new Response(csv);});
 const path=`Results/21_2026/01_${randomUUID()}/01_European Le Mans Series/202601011200_Qualifying/23_Analysis_Qualifying.CSV`;
 const request=new Request("http://localhost/api/alkamel/qualifying?"+new URLSearchParams({championship:"ELMS",path}));
 const first=await GET(request);assert.equal(first.status,200);assert.equal((await first.json()).laps.length,7);
 assert.equal((await(await GET(request)).json()).cached,true);assert.equal(calls,1);
 assert.equal((await GET(new Request("http://localhost/api/alkamel/qualifying?championship=ELMS&path=../secret"))).status,400);
});
