// Single-process entry for the host (Passenger startup file) and `npm start`:
// Express serves /api/v1, Next.js serves everything else.
const http = require("node:http");
const next = require("next");
const { createApp } = require("./dist/server/app");
const { prepare } = require("./dist/server/startup");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const nextApp = next({ dev, dir: __dirname });
const handleNext = nextApp.getRequestHandler();

(async () => {
  await prepare();
  await nextApp.prepare();
  const api = createApp();
  http
    .createServer((req, res) => (req.url && req.url.startsWith("/api/v1") ? api(req, res) : handleNext(req, res)))
    .listen(port, () => console.log(`Ready on port ${port}`));
})().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
