// Single-process entry for the host (Passenger startup file) and `npm start`:
// Express serves /api/v1, Next.js serves everything else.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

// The host shows no Passenger log, so keep the reason for a failed start next to the app.
function fail(err) {
  console.error("Startup failed:", err);
  try {
    const entry = `${new Date().toISOString()} node ${process.version}\n${util.inspect(err)}\n\n`;
    fs.appendFileSync(path.join(__dirname, "startup-error.log"), entry);
  } catch (writeError) {
    console.error("Could not write startup-error.log:", writeError);
  }
  process.exit(1);
}

async function start() {
  // Required here, not at the top, so a missing or broken package is recorded too.
  const next = require("next");
  const { createApp } = require("./dist/server/app");
  const { prepare } = require("./dist/server/startup");

  const dev = process.env.NODE_ENV !== "production";
  const port = Number(process.env.PORT || 3000);
  const nextApp = next({ dev, dir: __dirname });
  const handleNext = nextApp.getRequestHandler();

  await prepare();
  await nextApp.prepare();
  const api = createApp();
  http
    .createServer((req, res) => (req.url && req.url.startsWith("/api/v1") ? api(req, res) : handleNext(req, res)))
    .on("error", fail)
    .listen(port, () => console.log(`Ready on port ${port}`));
}

process.on("uncaughtException", fail);
start().catch(fail);
