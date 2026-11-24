import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../../shared";
import { folderFor } from "../asset-images";
import { contentVersion } from "../asset-access";

test("safeNextPath keeps a normal in-site path", () => {
  assert.equal(safeNextPath("/assets?page=2"), "/assets?page=2");
  assert.equal(safeNextPath("/q/abc123"), "/q/abc123");
});

test("safeNextPath refuses anything that could leave the site after login (open redirect)", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/a b", "", null, undefined]) {
    assert.equal(safeNextPath(bad), "/", `must refuse ${String(bad)}`);
  }
  assert.equal(safeNextPath("/" + "a".repeat(400)), "/", "too long");
});

test("folderFor builds the photo folder from letters, digits, _ and - only (no path tricks)", () => {
  assert.equal(folderFor({ id: 5, code: "ENG" }, 42), "assets/ENG/42");
  const evil = folderFor({ id: 5, code: "../../etc/passwd" }, 42);
  assert.match(evil, /^assets\/[A-Za-z0-9_-]+\/42$/);
  assert.ok(!evil.includes(".."));
  assert.equal(folderFor({ id: 7, code: "วิศวะ" }, 1), "assets/unit-7/1", "a code with no usable characters falls back to the unit id");
});

test("contentVersion changes when a field changes and is stable otherwise", () => {
  const keys = ["name", "note"] as const;
  const a = contentVersion({ name: "A", note: null }, keys);
  assert.equal(contentVersion({ name: "A", note: null }, keys), a);
  assert.notEqual(contentVersion({ name: "B", note: null }, keys), a);
  assert.notEqual(contentVersion({ name: "A", note: "x" }, keys), a);
});
