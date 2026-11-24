import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { checkOrigin, requireRole } from "../auth/guard";
import { fakeReq, fakeRes, user } from "./helpers";

type Middleware = (req: Request, res: Response, next: NextFunction) => unknown;

/** Runs a middleware and says whether it called next() (let the request through). */
function passes(mw: Middleware, req: Request, res: Response): boolean {
  let called = false;
  mw(req, res, () => {
    called = true;
  });
  return called;
}

test("requireRole lets a listed role through", () => {
  const { res, out } = fakeRes();
  assert.equal(passes(requireRole("super_admin", "technician"), fakeReq({ user: user({ role: "technician" }) }), res), true);
  assert.equal(out.status, 200);
});

test("requireRole refuses a role that is not listed (403)", () => {
  const { res, out } = fakeRes();
  assert.equal(passes(requireRole("super_admin"), fakeReq({ user: user({ role: "viewer" }) }), res), false);
  assert.equal(out.status, 403);
});

test("requireRole refuses a request with no user (403, never a crash)", () => {
  const { res, out } = fakeRes();
  assert.equal(passes(requireRole("super_admin"), fakeReq({}), res), false);
  assert.equal(out.status, 403);
});

test("checkOrigin lets reads through whatever the origin", () => {
  const { res } = fakeRes();
  assert.equal(passes(checkOrigin, fakeReq({ method: "GET", headers: { origin: "https://evil.example" } }), res), true);
});

test("checkOrigin refuses a cross-site write", () => {
  const { res, out } = fakeRes();
  assert.equal(passes(checkOrigin, fakeReq({ method: "POST", headers: { "sec-fetch-site": "cross-site" } }), res), false);
  assert.equal(out.status, 403);
});

test("checkOrigin refuses a write from another origin", () => {
  const { res, out } = fakeRes();
  assert.equal(passes(checkOrigin, fakeReq({ method: "DELETE", headers: { origin: "https://evil.example" } }), res), false);
  assert.equal(out.status, 403);
});

test("checkOrigin lets a write from the site itself through", () => {
  const { res } = fakeRes();
  assert.equal(passes(checkOrigin, fakeReq({ method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } }), res), true);
});
