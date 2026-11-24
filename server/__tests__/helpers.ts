import type { Request, Response } from "express";
import type { AuthUser } from "../../shared";

/** A signed-in user for tests; override only what the test is about. */
export function user(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    displayName: "ทดสอบ",
    username: "tester",
    cmuEmail: null,
    role: "viewer",
    unitId: null,
    unitName: null,
    loginMethod: "local",
    seesAllUnits: false,
    ...over,
  } as AuthUser;
}

/** The smallest res the guards need. `out` records the status and body that were sent. */
export function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

export function fakeReq(init: { method?: string; headers?: Record<string, string>; user?: AuthUser }) {
  const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: init.method ?? "GET",
    protocol: "http",
    user: init.user,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}
