import crypto from "node:crypto";
import type { Request } from "express";
import { config } from "../config";

export const cmuEnabled = () => Boolean(config.cmuOAuth.clientId && config.cmuOAuth.clientSecret);

export function redirectUri(req: Request): string {
  return `${config.publicUrl || `${req.protocol}://${req.get("host")}`}/api/v1/auth/cmu/callback`;
}

export function newState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function authorizeUrl(req: Request, state: string): string {
  const c = config.cmuOAuth;
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("scope", c.scope);
  u.searchParams.set("state", state);
  return u.toString();
}

export type CmuProfile = { email: string; displayName: string; organization: string[] };

async function readJson(res: Response, what: string): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`${what} failed with HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Exchange the authorization code, then read the account's basic info. Only the @cmu.ac.th email is trusted from it. */
export async function fetchProfile(req: Request, code: string): Promise<CmuProfile> {
  const c = config.cmuOAuth;
  const tokenRes = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(req),
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = await readJson(tokenRes, "CMU token request");
  const accessToken = typeof token.access_token === "string" ? token.access_token : "";
  if (!accessToken) throw new Error("CMU token response had no access_token");

  const infoRes = await fetch(c.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const info = await readJson(infoRes, "CMU account info request");

  const email = String(info[c.emailField] ?? "").trim().toLowerCase();
  const str = (k: string) => (typeof info[k] === "string" ? (info[k] as string).trim() : "");
  const name = [str("firstname_TH") || str("firstname_EN"), str("lastname_TH") || str("lastname_EN")].filter(Boolean).join(" ");
  const organization = c.orgFields.map(str).filter(Boolean); // faculty/office names as CMU reports them (Thai and English)
  return { email, displayName: name || email.split("@")[0], organization };
}
