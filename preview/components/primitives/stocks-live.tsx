"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { IPhoneFrame } from "@/components/canvas/iphone-frame";
import { StateToggle, type PreviewState } from "@/components/primitives/state-toggle";
import { Frame, type Skeleton } from "@/components/primitives/skeleton";
import { BE_URL } from "@/lib/be-url";
import { StocksOpenUI, type StocksDataSeed } from "./openui-render";

interface Issue { code: string; statementId?: string; message: string }
const Seed = z.object({ tool: z.literal("stocks_dataset"), args: z.object({ run: z.string() }), result: z.record(z.string(), z.unknown()) });

/**
 * A live generation against POST /lang/stocks/stream: the skeleton first, then the OpenUI program
 * as it streams, rendered with the Kino components. Each generation owns its controller so old
 * chunks cannot enter a new preview.
 */
export function StocksLive({ theme, specs, appearance }: {
  theme: CSSProperties | undefined; specs: Record<string, Record<string, unknown>> | undefined; appearance: "light" | "dark";
}) {
  const [program, setProgram] = useState("");
  const [seed, setSeed] = useState<StocksDataSeed | null>(null);
  const [prompt, setPrompt] = useState("Show competitors of NVDA");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [skeleton, setSkeleton] = useState<Skeleton | null>(null);
  const [view, setView] = useState<PreviewState>("active");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => { abort.current?.abort(); abort.current = null; }, []);

  function reset() {
    setIssues([]); setActivity([]); setSkeleton(null); setProgram(""); setSeed(null);
  }

  async function run() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    reset(); setState("running");
    const on = (event: string, body: Record<string, unknown>) => {
      if (abort.current !== controller || controller.signal.aborted) return;
      if (event === "activity") setActivity((a) => [...a, String(body.detail ?? body.stage)]);
      else if (event === "data") setSeed(Seed.parse(body));
      else if (event === "skeleton") setSkeleton(body as unknown as Skeleton);
      else if (event === "openui") setProgram(previous => body.replace ? String(body.text ?? "") : previous + String(body.text ?? ""));
      else if (event === "issue") setIssues((i) => [...i, body.issue as Issue]);
      else if (event === "done") {
        if (typeof body.program === "string") setProgram(body.program);
        setState("done");
      }
      else if (event === "failure") {
        setActivity((a) => [...a, String(body.message)]);
        setState("failed");
      }
    };
    try {
      const res = await fetch(`${BE_URL}/lang/stocks/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: controller.signal,
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
        </form>
        <div className="relative w-fit">
          <StateToggle value={view} onChange={setView} className="absolute top-3 right-3 z-30" />
          <IPhoneFrame appearance={appearance}>
            {program ? (
              <StocksOpenUI key={seed?.args.run ?? "loading"} program={program} seed={seed} theme={theme} specs={specs} isStreaming={state === "running"} skeleton={view === "skeleton"} />
            ) : skeleton ? (
              // Before the program: the planned parts as shapes.
              <div className="flex min-h-[874px] flex-col px-6 pt-(--safe-top) pb-(--safe-bottom)" style={{ ...theme, gap: skeleton.gap, background: "var(--ds-surface-screen)" }}>
                {skeleton.blocks.map((f, i) => <Frame key={i} f={f} />)}
              </div>
            ) : (
              <div className="flex h-[874px] items-center justify-center px-6 pt-(--safe-top) text-center text-[14px]" style={{ ...theme, background: "var(--ds-surface-screen)", color: "var(--ds-ink-secondary)" }}>
                {state === "running" ? activity[activity.length - 1] ?? "Starting…" : "Ask about a company, a fund or a position."}
              </div>
            )}
          </IPhoneFrame>
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
