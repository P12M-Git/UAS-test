import test from "node:test";
import assert from "node:assert/strict";
import type { Lap } from "../src/models/race";
import { reconstructSectorTraffic } from "../src/analysis/sector-traffic";
import { parseTimingCsv } from "../src/parser/uraice_adapter";

const lap = (car: string, number: number, start: number, sectors: [number, number, number] = [30,30,30], extra: Partial<Lap> = {}): Lap => {
  const duration = sectors.reduce((sum,value)=>sum+value,0);
  return { id: `${car}-${number}`, event: "Race 2026", session: "Race", sourceFile: "2026 ELMS 01 Test Race.csv", carNumber: car,
    driver: car, category: "Silver", team: "Team", className: "LMP2", proAm: false,
    lapNumber: number, lapTime: duration, elapsed: start + duration, elapsedReliable: true,
    s1: sectors[0], s2: sectors[1], s3: sectors[2], position: null, classPosition: null, gapLeader: null,
    gapAhead: null, gapBehind: null, carAhead: null, carBehind: null, pitIn: false, pitOut: false, valid: true,
    raceState: "GREEN", green: true, clean: number > 1, cleanAir: null, trafficCount: 0, overtakes: [], ...extra };
};

test("an S1 encounter counts even when the finish-line gap is ten seconds", () => {
  const focal = lap("1",2,90), other = lap("9",2,80,[39,21,30],{className:"LMGT3"});
  reconstructSectorTraffic([focal,other]);
  assert.equal(focal.cleanAir,false);
  assert.equal(focal.sectorGaps?.find(gap=>gap.sector===1)?.gapAhead,1);
  assert.equal(focal.sectorGaps?.find(gap=>gap.sector===3)?.gapAhead,10);
  assert.deepEqual(focal.trafficCars,["9"]);
  assert.deepEqual(focal.sectorPasses,[]);
});

test("sector gaps include lapped cars of a different class and record the lap difference", () => {
  const focal=lap("1",5,410), slower=lap("99",3,400,[39,34,37],{className:"LMGT3"});
  reconstructSectorTraffic([focal,slower]);
  assert.equal(focal.cleanAir,false);
  const gap=focal.sectorGaps?.find(point=>point.sector===1);
  assert.equal(gap?.carAhead,"99");
  assert.equal(gap?.carAheadLap,3);
  assert.equal(gap?.lapDifference,2);
  assert.equal(gap?.gapAhead,1);
});

test("a pass between sector loops counts for both cars even without a sampled gap below two", () => {
  const fast=lap("1",5,400), slow=lap("99",3,390,[35,40,45],{className:"LMGT3"});
  reconstructSectorTraffic([fast,slow]);
  for (const focal of [fast,slow]) {
    assert.ok(focal.sectorGaps?.every(gap=>gap.gapAhead===null||gap.gapAhead>=2));
    assert.equal(focal.cleanAir,false);
    assert.equal(focal.cleanAirReason,"sector-pass");
  }
  assert.deepEqual(fast.sectorPasses,["99"]);
  assert.deepEqual(slow.sectorPasses,["1"]);
});

test("the threshold is strictly below two seconds and a sole car is not its own traffic", () => {
  for (const gap of [1.999,2,2.001]) {
    const ahead=lap("1",2,90), behind=lap("2",2,90+gap);
    reconstructSectorTraffic([ahead,behind]);
    assert.equal(behind.cleanAir,gap>=2);
  }
  const sole=lap("1",2,90);
  reconstructSectorTraffic([sole,{...sole}]);
  assert.equal(sole.cleanAir,true);
  assert.equal(sole.trafficCount,0);
});

test("missing sector data or untrusted cumulative clocks cannot establish clear air", () => {
  const missing=lap("1",2,90,[30,30,30],{s1:null,s2:null,s3:null});
  reconstructSectorTraffic([missing]);
  assert.equal(missing.cleanAir,null);
  assert.equal(missing.cleanAirReason,"missing-sector-timing");
  const clock=lap("1",2,90,[30,30,30],{elapsedReliable:false});
  reconstructSectorTraffic([clock]);
  assert.equal(clock.cleanAir,null);
  const otherwiseClear=lap("1",2,90), incompleteRival=lap("2",2,80,[30,30,30],{s1:null,s2:null,s3:null});
  reconstructSectorTraffic([otherwiseClear,incompleteRival]);
  assert.equal(otherwiseClear.cleanAir,null);
  const focal=lap("1",2,90), unknown=lap("2",2,90,[30,30,30],{s1:null,s2:null,s3:null});
  reconstructSectorTraffic([focal,unknown]);
  assert.equal(focal.cleanAir,false); // A confirmed line crossing at zero gap is still evidence.
});

test("pit-lane order changes and other sessions do not create sector traffic", () => {
  const focal=lap("1",5,400), pit=lap("99",3,390,[35,40,45],{pitOut:true,clean:false});
  reconstructSectorTraffic([focal,pit]);
  assert.equal(focal.cleanAir,true);
  assert.deepEqual(focal.sectorPasses,[]);
  const differentSession=lap("99",5,399,[30,30,30],{session:"Practice"});
  reconstructSectorTraffic([focal,differentSession]);
  assert.equal(focal.cleanAir,true);
});

test("parser reconstructs the common sector clock from actual elapsed timing", () => {
  const csv="NUMBER;LAP_NUMBER;LAP_TIME;S1_SECONDS;S2_SECONDS;S3_SECONDS;ELAPSED;DRIVER_NAME;CLASS;FLAG_AT_FL\n1;5;90;30;30;30;490;Fast;LMP2;GF\n99;3;120;35;40;45;510;Slow;LMGT3;GF";
  const data=parseTimingCsv(csv,"2026 ELMS 01 Test Race.csv");
  const fast=data.laps.find(lap=>lap.carNumber==="1")!;
  assert.deepEqual(fast.sectorGaps?.map(gap=>gap.elapsed),[400,430,460,490]);
  assert.equal(fast.cleanAir,false);
  assert.deepEqual(fast.sectorPasses,["99"]);
});
