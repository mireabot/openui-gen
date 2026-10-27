"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { z } from "zod";
import { IPhoneFrame, SCREEN_HEIGHT } from "@/components/canvas/iphone-frame";
import { StateToggle, type PreviewState } from "@/components/primitives/state-toggle";
import { Frame, type Skeleton } from "@/components/primitives/skeleton";
import { BE_URL } from "@/lib/be-url";
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
      setScale(Math.min(1, Math.max(0.5, (window.innerHeight - top - 24) / SCREEN_HEIGHT)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
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
  const abort = useRef<AbortController | null>(null);
  const device = useRef<HTMLDivElement>(null);
  const scale = useFitScale(device);

  useEffect(() => () => { abort.current?.abort(); abort.current = null; }, []);

  function reset() {
    setIssues([]); setActivity([]); setSkeleton(null); setProgram(""); setSeed(null);
  }

  function newScreen() {
    abort.current?.abort(); abort.current = null;
    reset(); setDocument(null); setState("idle");
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
    const on = (event: string, body: Record<string, unknown>) => {
      if (abort.current !== controller || controller.signal.aborted) return;
      if (event === "activity") setActivity((a) => [...a, String(body.detail ?? body.stage)]);
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
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-col gap-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="h-11 w-[300px] rounded-lg border bg-background px-3 text-[14px]" />
          <button type="submit" disabled={state === "running"} className="h-11 rounded-lg bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50">
            {state === "running" ? "Generating…" : "Generate"}
          </button>
          {document && (
            <button type="button" onClick={newScreen} disabled={state === "running"} className="h-11 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">
              New screen
            </button>
          )}
        </form>
        {document && <p className="text-xs text-muted-foreground">Revision {document.revision}{state === "done" ? " · the next Generate is a follow-up on this screen" : ""}</p>}
        <div ref={device} className="relative w-fit">
          <StateToggle value={view} onChange={setView} className="absolute top-3 right-3 z-30" />
          <div style={{ zoom: scale }}>
            <IPhoneFrame appearance={appearance}>
              {program ? (
                <OpenUIPreview key={seed?.args.run ?? "loading"} program={program} seed={seed} theme={theme} specs={specs} isStreaming={state === "running"} skeleton={view === "skeleton"} />
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
      </div>
      <div className="flex min-w-[320px] flex-1 flex-col gap-3 pt-14 text-[14px] leading-[18px]">
        <ol className="flex flex-col gap-1 text-muted-foreground">{activity.map((a, i) => <li key={i}>{a}</li>)}</ol>
        {issues.length > 0 && <ul className="list-disc rounded-lg border border-destructive/40 p-3 pl-7 text-destructive">{issues.map((x, i) => <li key={i}>{x.statementId ? `${x.statementId}: ` : ""}{x.message}</li>)}</ul>}
        {program && <p className="text-xs font-medium text-muted-foreground">OpenUI Lang</p>}
        {program && <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12px] leading-[18px] whitespace-pre">{program}</pre>}
      </div>
    </div>
  );
}
