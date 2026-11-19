import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ComparisonPlot} from "../app/workspace-season-summary";
import type {GradingDriver} from "../src/analysis/workbook-grading";
Object.assign(globalThis,{React});
const rows:GradingDriver[]=[100,110,300].map((value,i)=>({driver:`Driver SURNAME${i}`,car:String(i+1),category:"Silver",className:"LMP2",team:"Team",value,total:20}));
const render=(values:GradingDriver[])=>renderToStaticMarkup(React.createElement(ComparisonPlot,{rows:values,focus:rows[1].driver,context:""}));
test("selected driver has a highlighted row and marker; excluded outlier no longer controls the scale",()=>{
 const full=render(rows);assert.match(full,/comparison-plot-focus/);assert.match(full,/Selected driver/);assert.match(full,/5:00.000/);
 const filtered=render(rows.slice(0,2));assert.match(filtered,/1:50.000/);assert.doesNotMatch(filtered,/5:00.000|NaN|Infinity/);
});
test("an empty plot shows an empty state without invalid numerical coordinates",()=>{
 assert.match(render([]),/No included timed drivers/);assert.doesNotMatch(render([]),/NaN|Infinity/);
});
