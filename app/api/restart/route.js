import crypto from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/restart with header "x-restart-token: <RESTART_TOKEN>"
// Exits the process; Passenger starts a fresh one on the next request.
export async function POST(request) {
  const expected = process.env.RESTART_TOKEN;
  const given = request.headers.get("x-restart-token") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected || "");
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response("Forbidden", { status: 403 });
  }
  setTimeout(() => process.exit(0), 500);
  return Response.json({ ok: true, restarting: true });
}
