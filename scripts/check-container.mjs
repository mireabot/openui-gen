import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

/** The built image boots, serves the preview at / and answers the API. No provider calls are made. */

const image = process.argv[2] ?? "openui-gen:ci";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
// Non-default PORT verifies Railway's runtime port override.
const container = docker("run", "--detach", "--publish", "127.0.0.1::8091", "--env", "PORT=8091", "--env", "ANTHROPIC_API_KEY=ci-unused", "--env", "PARALLEL_API_KEY=ci-unused", image);
try {
  const base = `http://${docker("port", container, "8091/tcp")}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(base + "/health", { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Server may still be booting. */ }
    if (docker("inspect", "--format", "{{.State.Running}}", container) !== "true") break;
    await setTimeout(500);
  }
  assert.ok(ready, "container did not become healthy");
  assert.deepEqual(await (await fetch(base + "/health")).json(), { status: "ok" });
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /OpenUI generation/);
  const missing = await fetch(base + "/tools/sports_dataset", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(missing.status, 404);
  const bad = await fetch(base + "/lang/sports/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "" }) });
  assert.equal(bad.status, 400);
  console.log("container: health, preview, dataset tool and request validation passed");
} finally {
  try { docker("rm", "--force", container); } catch { /* already gone */ }
}
