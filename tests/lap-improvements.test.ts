import test from 'node:test';
import assert from 'node:assert/strict';
import type {Lap} from '../src/models/race';
import {lapImprovements} from '../src/analysis/lap-improvements';
test('personal bests compare chronologically, independently per driver, session and sector',()=>{
 const make=(n:number,t:number,s:number)=>({id:String(n),event:'Race',session:'Race',driver:'Pol',lapNumber:n,lapTime:t,s1:s,s2:null,s3:null} as Lap);
 const rows=[make(3,101,29),make(1,100,30),make(2,99,31),make(4,99,0),{...make(5,95,25),driver:'Other'}];
 const result=lapImprovements(rows);
 assert.equal(result.get('1')!.size,0);
 assert.deepEqual([...result.get('2')!],['lapTime']);
 assert.deepEqual([...result.get('3')!],['s1']);
 assert.equal(result.get('4')!.size,0);assert.equal(result.get('5')!.size,0);
});
