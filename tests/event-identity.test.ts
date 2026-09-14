import test from "node:test";
import assert from "node:assert/strict";
import {eventLabel,eventTheme} from "../src/models/event-identity";
test("event names retain season and distinguish Le Mans regardless of file prefix",()=>{
 assert.equal(eventLabel("26ELMSR01_BARC.csv"),"ELMS, Barcelona, 2026");
 assert.equal(eventLabel("26ELMS505_SILV.csv"),"ELMS, Silverstone, 2026");
 assert.equal(eventLabel("25ELMSR04_SPAF.csv"),"ELMS, Spa-Francorchamps, 2025");
 for(const file of ["26ELMSR00_LM24.csv","26WECR03_LM24.csv","Le Mans 2026.csv","lemans_2026.csv"]){
  assert.equal(eventLabel(file),"WEC, LM24, 2026");assert.equal(eventTheme(eventLabel(file)),"event-wec");
 }
 assert.equal(eventTheme("ELMS, Barcelona, 2026"),"event-elms");
});
