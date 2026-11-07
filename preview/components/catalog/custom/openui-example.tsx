"use client";

import type { ComponentProps } from "react";
import { parseImportedScreen } from "@/lib/imported-screen";
import { OpenUIPreview } from "@/components/primitives/openui-render";

export type ExampleTheme = Pick<ComponentProps<typeof OpenUIPreview>, "theme" | "specs">;
export interface ExampleSource { readonly name: string; readonly url: string }

export function OpenUIExample({ schema, filename, sources, sourceLabel = "Sources", theme, specs }: ExampleTheme & {
  schema: unknown;
  filename: string;
  sources: readonly ExampleSource[];
  sourceLabel?: string;
}) {
  const screen = parseImportedScreen(schema);
  function downloadSchema() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="min-w-0">
    <OpenUIPreview program={screen.program} seed={screen.seed} theme={theme} specs={specs} isStreaming={false} layout="inline" />
    <div className="mt-6 border-t border-ds-outline-subtle pt-4">
      <details>
        <summary className="cursor-pointer text-[13px] leading-[18px] text-ds-ink-secondary">View OpenUI program</summary>
        <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-ds-surface-card p-4 text-[11px] leading-[18px] text-ds-ink-secondary [overflow-wrap:anywhere]"><code>{screen.program}</code></pre>
      </details>
      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] leading-[18px] text-ds-ink-secondary">{sourceLabel}</summary>
        <ul className="mt-3 flex flex-col gap-2">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="text-[13px] leading-[18px] text-ds-ink-secondary underline decoration-ds-outline-control underline-offset-4 hover:text-ds-ink-primary">{source.name} ↗</a></li>)}</ul>
      </details>
      <button type="button" onClick={downloadSchema} className="mt-4 rounded-full border border-ds-outline-control px-3 py-1.5 text-[13px] leading-[18px] text-ds-ink-primary hover:bg-ds-surface-filled">Download schema</button>
    </div>
  </div>;
}
