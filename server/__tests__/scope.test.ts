import test from "node:test";
import assert from "node:assert/strict";
import { allowedFrom, descendantIds } from "../query";
import { user } from "./helpers";

// Faculty 1 > Dept 2 > Lab 4;  Faculty 1 > Dept 3;  Faculty 10 (a different faculty) > Dept 11
const units = [
  { id: 1, parent_id: null },
  { id: 2, parent_id: 1 },
  { id: 3, parent_id: 1 },
  { id: 4, parent_id: 2 },
  { id: 10, parent_id: null },
  { id: 11, parent_id: 10 },
];
const sorted = (ids: number[] | null) => ids && [...ids].sort((a, b) => a - b);

test("a unit includes all of its sub-units, at any depth", () => {
  assert.deepEqual(sorted(descendantIds(units, 1)), [1, 2, 3, 4]);
  assert.deepEqual(sorted(descendantIds(units, 2)), [2, 4]);
});

test("a unit never includes its parent, siblings or another faculty", () => {
  const ids = descendantIds(units, 2);
  for (const other of [1, 3, 10, 11]) assert.ok(!ids.includes(other), `unit ${other} must be outside unit 2's scope`);
});

test("a leaf unit sees only itself", () => {
  assert.deepEqual(descendantIds(units, 4), [4]);
});

test("a bad tree (a unit that is its own ancestor) does not loop forever", () => {
  const cyclic = [
    { id: 1, parent_id: 2 },
    { id: 2, parent_id: 1 },
  ];
  assert.deepEqual(sorted(descendantIds(cyclic, 1)), [1, 2]);
});

test("a user who sees all units has no restriction (null)", () => {
  assert.equal(allowedFrom(user({ seesAllUnits: true, unitId: null }), units), null);
});

test("a user with a unit sees that unit and below, and nothing of other faculties", () => {
  assert.deepEqual(sorted(allowedFrom(user({ unitId: 2 }), units)), [2, 4]);
});

test("a user with NO unit and no all-units right sees nothing ([] , not null)", () => {
  assert.deepEqual(allowedFrom(user({ unitId: null, seesAllUnits: false }), units), []);
});
