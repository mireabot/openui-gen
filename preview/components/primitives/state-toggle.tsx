"use client";

import { cn } from "@/lib/utils";

export type PreviewState = "active" | "skeleton";

/** Active / Skeleton switch for the preview frame. */
export function StateToggle({ value, onChange, className }: { value: PreviewState; onChange: (v: PreviewState) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5 rounded-full border bg-background/90 p-0.5 text-[12px] shadow-sm backdrop-blur", className)}>
      {(["active", "skeleton"] as const).map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className={cn("rounded-full px-2.5 py-1 capitalize", value === s ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
          {s}
        </button>
      ))}
    </div>
  );
}
