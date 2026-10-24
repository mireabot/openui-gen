import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMediaRoutes } from "../src/routes/media.js";
import { companyLogo } from "../src/stocks/data.js";

const cache = await mkdtemp(path.join(tmpdir(), "stock-assets-"));
process.env.MASSIVE_CACHE_DIR = cache;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const requested: string[] = [];
const routes = createMediaRoutes(async ticker => { requested.push(ticker); return ticker === "MISS" ? null : { body: png, type: "image/png" }; });
const manifest = await routes.request("/stocks/nvda/assets", { headers: { Origin: "http://localhost:3000" } });
assert.equal(manifest.status, 200);
assert.equal(manifest.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
assert.deepEqual(await manifest.json(), { ticker: "NVDA", logo: { status: "available", url: "/media/logos/NVDA", contentType: "image/png" } });
const image = await routes.request("/media/logos/NVDA");
assert.equal(image.status, 200);
assert.equal(image.headers.get("Content-Type"), "image/png");
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
assert.equal(image.headers.get("X-Content-Type-Options"), "nosniff");
for (const ticker of ["brk.b", "brk-b"]) {
  assert.equal((await routes.request(`/stocks/${ticker}/assets`)).status, 200);
  assert.equal((await routes.request(`/media/logos/${ticker}`)).status, 200);
}
assert.equal((await routes.request("/media/logos/A..B")).status, 400);
assert.equal((await routes.request("/stocks/NVDA%2Fsecret/assets")).status, 400);
const unavailable = await routes.request("/stocks/MISS/assets");
assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await unavailable.json(), { ticker: "MISS", logo: { status: "unavailable", url: null, contentType: null } });
assert.equal((await routes.request("/media/logos/MISS")).status, 404);
const failed = createMediaRoutes(async () => { throw new Error("private API diagnostics"); });
assert.equal((await failed.request("/stocks/NVDA/assets")).status, 502);
const failure = await failed.request("/media/logos/NVDA");
assert.equal(failure.status, 502);
assert.ok(!(await failure.text()).includes("private"));
assert.ok(requested.includes("BRK-B"));

const realFetch = globalThis.fetch;
const calls: string[] = [];
try {
  globalThis.fetch = async input => { calls.push(String(input)); return new Response(png, { headers: { "Content-Type": "image/png" } }); };
  const first = await companyLogo("NVDA", async () => { throw new Error("Massive must not be called for a public logo"); });
  assert.deepEqual(first?.body, png);
  assert.match(calls[0]!, /^https:\/\/images\.financialmodelingprep\.com\/symbol\/NVDA.png$/);
  await companyLogo("NVDA", async () => null);
  assert.equal(calls.length, 1, "binary data is cached per asset URL");
  globalThis.fetch = async input => {
    calls.push(String(input));
    if (String(input).includes("images.financialmodelingprep.com")) throw new Error("network unavailable");
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  };
  assert.ok(await companyLogo("AMD", async () => null), "a provider outage still tries the next public source");
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  assert.equal(await companyLogo("MISS", async () => { throw new Error("Massive plan rejected"); }), null);
} finally { globalThis.fetch = realFetch; await rm(cache, { recursive: true, force: true }); }
console.log("stock assets: own lookup, binary proxy, ticker normalization, cache, CORS, fallback and unavailable-state checks passed");
