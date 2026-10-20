import test from "node:test";
import assert from "node:assert/strict";
import { compareDriversBySurname, driverSurname } from "../src/models/driver-identity";

test("driver menus sort by surname including particles, capitalised compound surnames and suffixes", () => {
  const names = ["Scott HUFFAKER II", "Louis ROSSI", "Paul di Resta", "Nick DE VRIES", "Álex PALOU"];
  assert.deepEqual(names.sort(compareDriversBySurname), ["Nick DE VRIES", "Paul di Resta", "Scott HUFFAKER II", "Álex PALOU", "Louis ROSSI"]);
  assert.equal(driverSurname("Felipe FERNÁNDEZ LASER"), "FERNÁNDEZ LASER");
  assert.equal(driverSurname("Scott Huffaker II"), "Huffaker");
  assert.equal(driverSurname("Rossi, Valentino"), "Rossi");
});
