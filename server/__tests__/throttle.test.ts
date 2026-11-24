import test from "node:test";
import assert from "node:assert/strict";
import { clearFailures, isLocked, recordFailure } from "../auth/throttle";

// each test uses its own names/addresses: the counters live in memory for the whole run

test("five wrong passwords from one address lock that person (the next try is refused)", () => {
  for (let i = 0; i < 4; i++) {
    recordFailure("10.0.0.1", "alice");
    assert.equal(isLocked("10.0.0.1", "alice"), false);
  }
  recordFailure("10.0.0.1", "alice");
  assert.equal(isLocked("10.0.0.1", "alice"), true);
});

test("the lock does not leak to another person on another address", () => {
  for (let i = 0; i < 5; i++) recordFailure("10.0.0.2", "bob");
  assert.equal(isLocked("10.0.0.2", "bob"), true);
  assert.equal(isLocked("10.0.0.3", "carol"), false);
});

test("a correct sign-in clears the person's own counter", () => {
  for (let i = 0; i < 5; i++) recordFailure("10.0.0.4", "dave");
  assert.equal(isLocked("10.0.0.4", "dave"), true);
  clearFailures("10.0.0.4", "dave");
  assert.equal(isLocked("10.0.0.4", "dave"), false);
});

test("many addresses against ONE account lock the account (20 failures)", () => {
  for (let i = 0; i < 20; i++) recordFailure(`10.1.0.${i}`, "victim");
  assert.equal(isLocked("10.9.9.9", "victim"), true, "a fresh address is locked out of that account");
});

test("a correct sign-in cannot reset the shared account counter", () => {
  for (let i = 0; i < 20; i++) recordFailure(`10.2.0.${i}`, "target");
  clearFailures("10.2.0.0", "target");
  assert.equal(isLocked("10.9.9.8", "target"), true);
});
