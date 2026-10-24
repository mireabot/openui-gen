"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { GRID_OVERLAY } from "@/lib/canvas/ground-rules";
import { IOS_FONT_STACK, iosVars, type Appearance } from "@/lib/canvas/ios";
import { cn } from "@/lib/utils";

/** iPhone 17 Pro logical screen, in CSS px (= pt). */
export const SCREEN_WIDTH = 402;
export const SCREEN_HEIGHT = 874;
/** Status bar and home indicator safe areas. */
export const SAFE_TOP = 62;
export const SAFE_BOTTOM = 34;
const SCREEN_RADIUS = 55;

/** On when the board's grid toggle is on: every frame draws the 8px base grid. */
export const FrameGridContext = createContext(false);

/** Client provider for server pages: `<FrameGrid on>` turns the overlay on below it. */
export function FrameGrid({ on, children }: { on: boolean; children: ReactNode }) {
  return <FrameGridContext value={on}>{children}</FrameGridContext>;
}

const { step, color, stroke } = GRID_OVERLAY;
const GRID_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(to right, ${color} ${stroke}px, transparent ${stroke}px), linear-gradient(to bottom, ${color} ${stroke}px, transparent ${stroke}px)`,
  backgroundSize: `${step}px ${step}px`,
};

/**
 * A plain rounded 402×874 iPhone screen: no bezel, status bar, Dynamic Island or home
 * indicator. The iOS colour variables (`--ios-*`) are scoped to this element, so
 * `bg-ios-card`, `text-ios-label`, … resolve per frame and the page theme is unaffected.
 * A dark frame also carries `.dark` so EvilCharts pick their dark colours.
 *
 * Children fill the screen edge to edge and scroll inside it. The safe areas are exposed
 * as `--safe-top` / `--safe-bottom`, so a variation pads with `pt-(--safe-top)` and can
 * still paint its background behind the status bar.
 */
export function IPhoneFrame({
  appearance = "light",
  children,
  className,
  fullHeight = false,
}: {
  appearance?: Appearance;
  children?: ReactNode;
  className?: string;
  /** Grow to the content's height instead of clipping at 874 (inspection only). */
  fullHeight?: boolean;
}) {
  const grid = useContext(FrameGridContext);
  return (
    <div
      data-ios-screen
      className={cn(
        "relative shrink-0 overflow-hidden bg-ios-grouped text-ios-label shadow-sm ring-1 ring-black/10",
        appearance === "dark" && "dark",
        className,
      )}
      style={{
        ...(iosVars(appearance) as CSSProperties),
        ["--safe-top" as string]: `${SAFE_TOP}px`,
        ["--safe-bottom" as string]: `${SAFE_BOTTOM}px`,
        width: SCREEN_WIDTH,
        height: fullHeight ? undefined : SCREEN_HEIGHT,
        minHeight: SCREEN_HEIGHT,
        borderRadius: SCREEN_RADIUS,
        fontFamily: IOS_FONT_STACK,
        colorScheme: appearance,
      }}
    >
      {/* Content — keyed by appearance so charts re-resolve their colours. */}
      <div
        key={appearance}
        data-scroll-inside
        className={cn(
          "overflow-x-hidden overscroll-contain [scrollbar-width:none]",
          fullHeight ? "relative min-h-[874px]" : "absolute inset-0 overflow-y-auto",
        )}
      >
        {children}
      </div>
      {grid && <div aria-hidden data-grid-overlay className="pointer-events-none absolute inset-0 z-50" style={GRID_STYLE} />}
    </div>
  );
}

/** Same outer size as an `IPhoneFrame`, for a Mobbin screenshot or a placeholder. */
export function IPhoneImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      className="shrink-0 overflow-hidden bg-muted shadow-sm ring-1 ring-black/10"
      style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, borderRadius: SCREEN_RADIUS }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Mobbin URLs, sized by the frame */}
      <img src={src} alt={alt} className="size-full object-contain" draggable={false} />
    </div>
  );
}
