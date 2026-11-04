/** One generation against the running backend, in whichever mode it runs: `npm run ask -- "Chelsea stats last season"`. */

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) throw new Error('Usage: npm run ask -- "your question"');
const base = process.env.BE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;

const health = await fetch(`${base}/health`).then(response => response.json() as Promise<{ mode?: string }>);
console.log(`mode: ${health.mode}\n`);

const response = await fetch(`${base}/lang/sports/stream`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
});
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

function show(event: string, data: any): void {
  if (event === "activity" && data.detail) console.log(`${data.stage}: ${data.detail}`);
  if (event === "usage") console.log(`  ${data.stage} · ${data.model} · ${data.inputTokens} in, ${data.outputTokens} out · $${data.costUSD.toFixed(4)} · ${data.ms} ms`);
  if (event === "issue") console.log(`issue: ${JSON.stringify(data.issue)}`);
  if (event === "failure") { console.error(`failed: ${data.message}`); process.exitCode = 1; }
  if (event === "done") console.log(`\nopen: http://localhost:3000/?run=${data.document.id}`);
}

let buffer = "";
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end: number;
  while ((end = buffer.indexOf("\n\n")) >= 0) {
    const lines = buffer.slice(0, end).split("\n");
    buffer = buffer.slice(end + 2);
    const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5)).join("\n");
    if (event && data) show(event, JSON.parse(data));
  }
}
