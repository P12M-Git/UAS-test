import test from "node:test";
import assert from "node:assert/strict";
import {formatTime,formatNumber,plotPercent} from "../src/models/number-format";
test("time rounding carries into minutes instead of displaying seconds as 60",()=>{
 assert.equal(formatTime(119.9996),"2:00.000");assert.equal(formatTime(59.96,1),"1:00.0");
 assert.equal(formatTime(null),"—");assert.equal(formatNumber(-.00001,3),"0.000");
});
test("pace markers cannot create horizontal overflow for outliers or missing averages",()=>{
 assert.equal(plotPercent(2500,130,136),97);assert.equal(plotPercent(0,130,136),3);
 assert.equal(plotPercent(NaN,130,136),null);assert.equal(plotPercent(133,130,136),50);
});
