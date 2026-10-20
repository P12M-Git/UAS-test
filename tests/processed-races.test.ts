import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GET } from "../app/api/alkamel/processed/route";

const csv = "NUMBER;LAP_NUMBER;LAP_TIME;ELAPSED;DRIVER_NAME;CLASS;TEAM;FLAG_AT_FL\n1;1;90;90;Test Driver;LMP2;Test Team;GF\n1;2;89;179;Test Driver;LMP2;Test Team;GF";
const request = () => new Request("http://localhost/api/alkamel/processed?" + new URLSearchParams({
  championship: "ELMS",
  path: "Results/21_2026/01_Barcelona/01_European Le Mans Series/202604121200_Race/Hour 4/23_Analysis_Race.CSV",
  sourceFile: `2026 ELMS cache ${randomUUID()}.csv`,
}));

test("production loads races without a configured persistent directory", async t => {
  const originalDirectory = process.env.RACE_CACHE_DIR;
  const originalEnvironment = process.env.NODE_ENV;
  delete process.env.RACE_CACHE_DIR;
  Reflect.set(process.env, "NODE_ENV", "production");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  try {
    const raceRequest = request();
    const first = await GET(raceRequest);
    const body = await first.json();
    assert.equal(first.status, 200);
    assert.equal(body.dataset.laps.length, 2);
    assert.match(body.storageWarning, /temporary/);
    const second = await GET(raceRequest);
    assert.equal((await second.json()).cached, true);
  } finally {
    if (originalDirectory === undefined) delete process.env.RACE_CACHE_DIR;
    else process.env.RACE_CACHE_DIR = originalDirectory;
    if (originalEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", originalEnvironment);
  }
});

test("an inaccessible cache does not discard a successfully processed CSV", async t => {
  const originalDirectory = process.env.RACE_CACHE_DIR;
  const directory = await mkdtemp(join(tmpdir(), "uraice-storage-test-"));
  const blocked = join(directory, "file-not-directory");
  await writeFile(blocked, "blocked");
  process.env.RACE_CACHE_DIR = blocked;
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  try {
    const response = await GET(request());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.dataset.laps.length, 2);
    assert.match(body.storageWarning, /could not save/);
  } finally {
    if (originalDirectory === undefined) delete process.env.RACE_CACHE_DIR;
    else process.env.RACE_CACHE_DIR = originalDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
