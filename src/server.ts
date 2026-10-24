import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { assertCredentials, config } from "./config.js";
import { log } from "./log.js";
import { PROJECT_ROOT } from "./paths.js";
import { health } from "./routes/health.js";
import { stocksLangRoutes } from "./routes/lang.js";
import { mediaRoutes } from "./routes/media.js";

const app = new Hono();
app.route("/", health);
app.route("/", stocksLangRoutes());
app.route("/", mediaRoutes);

/**
 * The preview is a static Next.js export served from the same origin, so the browser calls the
 * API without CORS. Absent in development, where `npm run preview` serves it on its own port.
 */
const previewDir = path.join(fileURLToPath(PROJECT_ROOT), "preview", "out");
if (existsSync(previewDir)) {
  const root = path.relative(process.cwd(), previewDir) || ".";
  app.use("/*", serveStatic({ root }));
  app.get("/*", serveStatic({ root, path: "index.html" }));
}

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  log.error("unhandled", { message: err.message, stack: err.stack });
  return c.json({ error: "internal_error" }, 500);
});

const cfg = config();
assertCredentials();

serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
  log.info("listening", { port: info.port, model: cfg.OPENROUTER_MODEL, preview: existsSync(previewDir) });
});

export { app };
