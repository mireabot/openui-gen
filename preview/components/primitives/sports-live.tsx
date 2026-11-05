"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { z } from "zod";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { IPhoneFrame, SCREEN_HEIGHT, SCREEN_WIDTH } from "@/components/canvas/iphone-frame";
import { StateToggle, type PreviewState } from "@/components/primitives/state-toggle";
import { Frame, pendingFrames, type Skeleton } from "@/components/primitives/skeleton";
import { BE_URL } from "@/lib/be-url";
import { parseImportedScreen, type ImportedScreen } from "@/lib/imported-screen";
import { OpenUIPreview, type DatasetSeed } from "./openui-render";

interface Issue { code: string; statementId?: string; message: string }
interface DocumentVersion { id: string; revision: number }
const Seed = z.object({ tool: z.literal("sports_dataset"), args: z.object({ run: z.string() }), result: z.record(z.string(), z.unknown()) });

/**
 * Like ui-canvas's Fit: the frame keeps its 402×874 logical size and scales down to the window height,
 * so the screen lays out exactly as on iOS while the whole of it stays in view.
 */
function useFitScale(ref: RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const top = ref.current ? ref.current.getBoundingClientRect().top + window.scrollY : 0;
      const width = ref.current?.parentElement?.clientWidth ?? window.innerWidth;
      const heightScale = window.innerWidth >= 1024 ? Math.max(0.5, (window.innerHeight - top - 24) / SCREEN_HEIGHT) : 1;
      setScale(Math.min(1, width / SCREEN_WIDTH, heightScale));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [ref]);
  return scale;
}

/**
 * A live generation against POST /lang/sports/stream: the skeleton first, then the OpenUI program
 * as it streams, rendered with the Kino components. Once a screen is done, the next Generate is a
 * follow-up on its document (POST /lang/sports/:id/follow-up): the screen stays as it is until the
 * new revision is done, then swaps in. "New screen" starts over. Each generation owns its controller
 * so old chunks cannot enter a new preview.
 */
interface Step { stage: string; done: boolean; cost: number; summary: string }

const clock = (ms: number) => { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };

const plural = (count: number, word: string, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;

/** "3 Parallel searches · 2 ESPN lookups · 8 sources: skysports.com, opta.com". */
function searchSummary(body: Record<string, unknown>): string {
  const count = (key: string) => Number(body[key] ?? 0);
  const hosts = [...new Set(((body.sources ?? []) as { url: string }[]).flatMap(source => { try { return [new URL(source.url).hostname]; } catch { return []; } }))].slice(0, 3);
  return [
    count("searches") ? plural(count("searches"), "Parallel search", "Parallel searches") : "",
    count("lookups") ? plural(count("lookups"), "ESPN lookup") : "",
    count("sourceCount") ? `${plural(count("sourceCount"), "source")}${hosts.length ? `: ${hosts.join(", ")}` : ""}` : "",
  ].filter(Boolean).join(" · ");
}

function stepWith(list: Step[], body: Record<string, unknown>): Step[] {
  const stage = String(body.stage);
  const previous = list.find(step => step.stage === stage);
  const next = { stage, done: body.status === "completed", cost: previous?.cost ?? 0, summary: searchSummary(body) };
  return previous ? list.map(step => step === previous ? next : step) : [...list, next];
}

/** A cost can arrive before its stage's first step: the finding model reports under "data" during search. */
function stepCost(list: Step[], stage: string, cost: number): Step[] {
  return list.some(step => step.stage === stage) ? list.map(step => step.stage === stage ? { ...step, cost: step.cost + cost } : step) : [...list, { stage, done: false, cost, summary: "" }];
}

export function SportsLive({ theme, specs, appearance }: {
  theme: CSSProperties | undefined; specs: Record<string, Record<string, unknown>> | undefined; appearance: "light" | "dark";
}) {
  const [program, setProgram] = useState("");
  const [seed, setSeed] = useState<DatasetSeed | null>(null);
  const [prompt, setPrompt] = useState("Premier League table this season");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [skeleton, setSkeleton] = useState<Skeleton | null>(null);
  const [view, setView] = useState<PreviewState>("active");
  const [document, setDocument] = useState<DocumentVersion | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [replayed, setReplayed] = useState(false);
  const [runs, setRuns] = useState<{ id: string; prompt: string; model: string; updatedAt: string }[]>([]);
  const abort = useRef<AbortController | null>(null);
  const device = useRef<HTMLDivElement>(null);
  const scale = useFitScale(device);

  useEffect(() => () => { abort.current?.abort(); abort.current = null; }, []);
  // Ticks only while running, so the timer holds at the end.
  useEffect(() => {
    if (state !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);

  /** Shows a schema as it is, with no model call. The prompt stays in the box, so Generate runs it for real once it looks right. */
  function replay(screen: ImportedScreen) {
    abort.current?.abort(); abort.current = null;
    reset(); setDocument(null); setSteps([]); setSaved("idle");
    setPrompt(screen.prompt || prompt); setSeed(screen.seed); setProgram(screen.program);
    setReplayed(true); setState("done");
  }

  async function replayRun(id: string) {
    try {
      const response = await fetch(`${BE_URL}/lang/sports/runs/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`Run ${id} is not available (${response.status})`);
      replay(parseImportedScreen(await response.json()));
    } catch (error) {
      setActivity([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function importFile(file: File) {
    try {
      replay(parseImportedScreen(JSON.parse(await file.text())));
    } catch (error) {
      setActivity([`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
    }
  }

  function exportScreen() {
    const blob = new Blob([JSON.stringify({ prompt, program, snapshot: seed }, null, 2)], { type: "application/json" });
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `screen-${seed?.args.run ?? "draft"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** Runs from any client, `npm run ask` included. */
  function loadRuns() {
    fetch(`${BE_URL}/lang/sports/runs`).then(response => response.ok ? response.json() : { runs: [] }).then(body => setRuns(body.runs ?? [])).catch(() => setRuns([]));
  }
  // The runs to replay, and ?run=<id> opens one directly.
  useEffect(() => {
    loadRuns();
    const run = new URLSearchParams(window.location.search).get("run");
    if (run) void replayRun(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!document) return;
    setSaved("saving");
    const response = await fetch(`${BE_URL}/lang/sports/${document.id}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: document.revision }) }).catch(() => null);
    setSaved(response?.ok ? "saved" : "failed");
  }

  function reset() {
    setIssues([]); setActivity([]); setSkeleton(null); setProgram(""); setSeed(null);
  }

  function newScreen() {
    abort.current?.abort(); abort.current = null;
    reset(); setDocument(null); setReplayed(false); setState("idle");
  }

  async function run() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // A follow-up keeps the screen until `done` commits the next revision; its content is staged.
    const base = state === "done" ? document : null;
    const staged: { seed: DatasetSeed | null; program: string | null } = { seed: null, program: null };
    if (base) { setIssues([]); setActivity([]); } else { reset(); setDocument(null); }
    setState("running");
    setSteps([]); setSaved("idle"); setReplayed(false); setStartedAt(Date.now()); setNow(Date.now());
    const on = (event: string, body: Record<string, unknown>) => {
      if (abort.current !== controller || controller.signal.aborted) return;
      if (event === "activity") { setActivity((a) => [...a, String(body.detail ?? body.stage)]); setSteps(list => stepWith(list, body)); }
      else if (event === "usage") setSteps(list => stepCost(list, String(body.stage), Number(body.costUSD ?? 0)));
      else if (event === "data") { if (base) staged.seed = Seed.parse(body); else setSeed(Seed.parse(body)); }
      else if (event === "skeleton") { if (!base) setSkeleton(body as unknown as Skeleton); }
      else if (event === "openui") {
        if (base) staged.program = body.replace ? String(body.text ?? "") : (staged.program ?? "") + String(body.text ?? "");
        else setProgram(previous => body.replace ? String(body.text ?? "") : previous + String(body.text ?? ""));
      }
      else if (event === "issue") setIssues((i) => [...i, body.issue as Issue]);
      else if (event === "done") {
        if (staged.seed) setSeed(staged.seed);
        if (typeof body.program === "string") setProgram(body.program);
        setDocument((body.document as DocumentVersion | undefined) ?? null);
        setState("done");
      }
      else if (event === "failure") {
        setActivity((a) => [...a, String(body.message)]);
        setState("failed");
      }
    };
    try {
      const res = await fetch(base ? `${BE_URL}/lang/sports/${base.id}/follow-up` : `${BE_URL}/lang/sports/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(base ? { baseRevision: base.revision } : {}) }), signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1] ?? "message";
          const payload = frame.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
          if (payload) on(event, JSON.parse(payload) as Record<string, unknown>);
        }
      }
      if (abort.current === controller && !controller.signal.aborted) setState((s) => (s === "running" ? "done" : s));
    } catch (error) {
      if (controller.signal.aborted || abort.current !== controller) return;
      setActivity((a) => [...a, error instanceof Error ? error.message : String(error)]);
      setState("failed");
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:gap-12">
      <section data-preview-controls className="flex min-w-0 flex-col gap-3">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="h-11 min-w-0 flex-1 basis-[220px] rounded-lg border bg-background px-3 text-[14px]" />
          <button type="submit" disabled={state === "running"} className="h-11 rounded-lg bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50">
            {state === "running" ? "Generating…" : "Generate"}
          </button>
          {document && (
            <button type="button" onClick={newScreen} disabled={state === "running"} className="h-11 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">
              New screen
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="relative min-w-0 max-w-full">
            <select value="" onFocus={loadRuns} onChange={(e) => { if (e.target.value) void replayRun(e.target.value); }} disabled={state === "running"} className="h-11 w-full min-w-0 appearance-none rounded-lg border bg-background pr-9 pl-3 [field-sizing:content] disabled:opacity-50">
              <option value="">Replay a previous run (no model)</option>
              {runs.map((r) => <option key={r.id} value={r.id}>{r.updatedAt.slice(5, 16).replace("T", " ")} · {r.model.replace("claude-", "")} · {r.prompt.slice(0, 60)}</option>)}
            </select>
            <CaretDownIcon size={12} weight="bold" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
          </span>
          <label className="flex h-11 cursor-pointer items-center rounded-lg border px-4 font-medium">
            Import schema
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ""; }} />
          </label>
          {program && seed && state !== "running" && <button type="button" onClick={exportScreen} className="h-11 rounded-lg border px-4 font-medium">Export schema</button>}
        </div>
        {replayed && <p className="text-xs font-medium text-muted-foreground">Replayed from a saved schema · no model calls · Generate runs this prompt for real</p>}
        {document && <p className="text-xs text-muted-foreground">Revision {document.revision}{state === "done" ? " · the next Generate is a follow-up on this screen" : ""}</p>}
        <section data-preview-pipeline className="mt-4 flex min-w-0 flex-col gap-3 text-[14px] leading-[18px]">
          <h2 className="text-[13px] font-medium">Progress pipeline</h2>
          {state === "idle" && <p className="text-[13px] text-muted-foreground">Generation progress will appear here.</p>}
          {state !== "idle" && !replayed && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="flex justify-between gap-3 font-medium tabular-nums">
                <span>{state === "running" ? steps.at(-1)?.stage ?? "Starting" : state === "done" ? "Done" : "Stopped"}</span>
                <span>${steps.reduce((sum, step) => sum + step.cost, 0).toFixed(3)} · {clock(now - startedAt)}</span>
              </p>
              {steps.map(step => (
                <p key={step.stage} className="flex justify-between gap-3 text-muted-foreground tabular-nums">
                  <span>{step.done ? "✓" : "…"} {step.stage}{step.summary ? ` · ${step.summary}` : ""}</span>
                  <span>${step.cost.toFixed(3)}</span>
                </p>
              ))}
              {state === "done" && document && (
                <button type="button" onClick={save} disabled={saved === "saving" || saved === "saved"} className="h-11 rounded-lg border px-4 font-medium disabled:opacity-50">
                  {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : saved === "failed" ? "Could not save. Try again" : "Save result"}
                </button>
              )}
            </div>
          )}
          <ol className="flex min-w-0 flex-col gap-1 break-words text-muted-foreground">{activity.map((a, i) => <li key={i}>{a}</li>)}</ol>
          {issues.length > 0 && <ul className="list-disc rounded-lg border border-destructive/40 p-3 pl-7 text-destructive">{issues.map((x, i) => <li key={i}>{x.statementId ? `${x.statementId}: ` : ""}{x.message}</li>)}</ul>}
          {program && <p className="text-xs font-medium text-muted-foreground">OpenUI Lang</p>}
          {program && <pre className="max-h-[420px] min-w-0 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap [overflow-wrap:anywhere]">{program}</pre>}
        </section>
      </section>
      <section data-preview-screen className="flex min-w-0 justify-center lg:sticky lg:top-0">
        <div ref={device} className="relative w-fit">
          <StateToggle value={view} onChange={setView} className="absolute top-3 right-3 z-30" />
          <div style={{ zoom: scale }}>
            <IPhoneFrame appearance={appearance} className="border border-kino-outline-control">
              {program ? (
                <OpenUIPreview key={seed?.args.run ?? "loading"} program={program} seed={seed} theme={theme} specs={specs} isStreaming={state === "running"} skeleton={view === "skeleton"} pending={state === "running" && skeleton ? pendingFrames(skeleton, program).map((f, i) => <Frame key={i} f={f} />) : null} />
              ) : skeleton ? (
                // Before the program: the planned parts as shapes.
                <div className="flex min-h-[874px] flex-col px-6 pt-(--safe-top) pb-(--safe-bottom)" style={{ ...theme, gap: skeleton.gap, background: "var(--ds-surface-screen)" }}>
                  {skeleton.blocks.map((f, i) => <Frame key={i} f={f} />)}
                </div>
              ) : (
                <div className="flex h-[874px] items-center justify-center px-6 pt-(--safe-top) text-center text-[14px]" style={{ ...theme, background: "var(--ds-surface-screen)", color: "var(--ds-ink-secondary)" }}>
                  {state === "running" ? activity[activity.length - 1] ?? "Starting…" : "Ask about a league, a club or a player."}
                </div>
              )}
            </IPhoneFrame>
          </div>
        </div>
      </section>
    </div>
  );
}
