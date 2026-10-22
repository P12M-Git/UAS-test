import test from "node:test";
import assert from "node:assert/strict";
import { loadRaceLibrary } from "../src/race-load-queue";
import type { AlkamelRace } from "../src/alkamel";

const races = ["a","b","c","d"].map(id => ({ id } as AlkamelRace));

test("an empty analysis selection still loads the entire library exactly once", async () => {
  const loaded: string[] = [];
  await loadRaceLibrary({ races, priority: () => [], signal: new AbortController().signal, load: async race => { loaded.push(race.id); } });
  assert.deepEqual([...loaded].sort(),["a","b","c","d"]);
});

test("changing the selection changes priority without dropping other races", async () => {
  let selected = ["c"];
  const loaded: string[] = [];
  await loadRaceLibrary({ races, priority: () => selected, signal: new AbortController().signal, concurrency: 1, load: async race => {
    loaded.push(race.id);
    if (race.id === "c") selected = ["d"];
    else selected = [];
  } });
  assert.deepEqual(loaded,["c","d","a","b"]);
});

test("a failed race does not stop the remaining library from loading", async () => {
  const attempted: string[] = [], failed: string[] = [];
  await loadRaceLibrary({ races, priority: () => [], signal: new AbortController().signal, concurrency: 1,
    load: async race => { attempted.push(race.id); if (race.id === "b") throw new Error("source unavailable"); },
    onError: race => { failed.push(race.id); },
  });
  assert.deepEqual(attempted,["a","b","c","d"]);
  assert.deepEqual(failed,["b"]);
});

test("leaving the application can explicitly stop queued downloads", async () => {
  const controller = new AbortController(), loaded: string[] = [];
  await loadRaceLibrary({ races, priority: () => [], signal: controller.signal, concurrency: 1,
    load: async race => { loaded.push(race.id); controller.abort(); },
  });
  assert.deepEqual(loaded,["a"]);
});
