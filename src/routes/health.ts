import { Hono } from "hono";

export const health = new Hono();

/** GET /health — liveness. */
health.get("/health", (c) => c.json({ status: "ok" }, 200));
