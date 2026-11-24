import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../auth/password";

test("the right password verifies, a wrong one does not", async () => {
  const stored = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
});

test("two hashes of the same password differ (random salt)", async () => {
  assert.notEqual(await hashPassword("same"), await hashPassword("same"));
});

test("an unknown user (no stored hash) never verifies, whatever the password", async () => {
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("", null), false);
});

test("a malformed stored hash is refused, not thrown", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});
