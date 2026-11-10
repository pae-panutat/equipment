import { createApp } from "./app";
import { prepare } from "./startup";
import { config } from "./config";

// Standalone API process for local development (Next dev server proxies /api/v1 here).
prepare()
  .then(() => {
    createApp().listen(config.apiPort, () => console.log(`API listening on http://localhost:${config.apiPort}`));
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
