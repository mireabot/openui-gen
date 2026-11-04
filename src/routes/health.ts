import { Hono } from "hono";
import { config } from "../config.js";

export const health = new Hono();

/** GET /health — liveness. */
health.get("/health", (c) => c.json({ status: "ok", mode: config().GENERATION_MODE, dataSource: config().DATA_SOURCE }, 200));
