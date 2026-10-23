import test from 'node:test';
import assert from 'node:assert/strict';
import {download, withDeadline} from '../src/reliable-download';
import {compactRace} from '../src/compact-race';
import type {RaceDataset} from '../src/models/race';
test('retries a transient failure and reads the body', async t => {
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response('',{status:502}):Response.json({ok:true}));
 assert.deepEqual(await download('https://example.test',r=>r.json()),{ok:true});assert.equal(calls,2);
});
test('body deadline releases the operation',async()=>{
 await assert.rejects(withDeadline(new Promise(()=>{}),10),/timed out/);
});
test('a broken body retries and a permanent failure has a finite attempt count',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{
  calls++;
  return new Response(new ReadableStream({start(controller){controller.error(new Error('Body connection lost'));}}));
 });
 await assert.rejects(download('https://example.test',r=>r.text()),/Body connection lost/);
 assert.equal(calls,3);
});
test('user cancellation does not retry',async t=>{
 const controller=new AbortController();controller.abort();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('');});
 await assert.rejects(download('https://example.test',r=>r.text(),{signal:controller.signal}));assert.equal(calls,0);
});
test('compaction retains calculated sector traffic results',()=>{
 const dataset={laps:[{cleanAir:false,trafficCount:2,cleanAirReason:'sector-pass',sectorGaps:[{}],trafficCars:['2'],sectorPasses:['2']}],diagnostics:[]} as unknown as RaceDataset;
 compactRace(dataset);assert.equal(dataset.laps[0].cleanAir,false);assert.equal(dataset.laps[0].trafficCount,2);assert.equal(dataset.laps[0].cleanAirReason,'sector-pass');assert.equal(dataset.laps[0].sectorGaps,undefined);
});
