"use client";

import { useEffect, type RefObject } from "react";

export type RailKind = "line" | "pill" | "centred" | "track" | "crests";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Where a scroller's scrollLeft sits with each child centred, as far as it can scroll. */
export function stops(element: HTMLElement): number[] {
  const most = element.scrollWidth - element.clientWidth;
  return [...element.children].filter((child) => !(child as HTMLElement).dataset.spacer).map((child) => {
    const item = child as HTMLElement;
    return clamp(item.offsetLeft + item.offsetWidth / 2 - element.clientWidth / 2, 0, most);
  });
}

export function toProgress(element: HTMLElement): number {
  const at = stops(element);
  const left = element.scrollLeft;
  for (let index = 0; index < at.length - 1; index++) {
    const [from, to] = [at[index]!, at[index + 1]!];
    if (left <= to) return to === from ? index : index + clamp((left - from) / (to - from), 0, 1);
  }
  return Math.max(0, at.length - 1);
}

export function toLeft(element: HTMLElement, progress: number): number {
  const at = stops(element);
  const index = clamp(Math.floor(progress), 0, Math.max(0, at.length - 1));
  const next = Math.min(index + 1, at.length - 1);
  return (at[index] ?? 0) + ((at[next] ?? 0) - (at[index] ?? 0)) * (progress - index);
}

export const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * A mouse can't drag a scroller the way a finger does, so a drag moves it here, then settles on a stop:
 * the nearest one, or the next one along if a short drag didn't reach it. Touch and trackpad stay native.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let start: { x: number; left: number } | null = null;
    let moved = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      start = { x: event.clientX, left: element.scrollLeft };
      moved = false;
      clearTimeout(settle);
    };
    const move = (event: PointerEvent) => {
      if (!start) return;
      const distance = event.clientX - start.x;
      if (!moved && Math.abs(distance) < 4) return;
      moved = true;
      element.dataset.dragging = "true";
      element.style.scrollSnapType = "none";
      element.scrollLeft = start.left - distance;
    };
    const up = (event: PointerEvent) => {
      if (!start) return;
      const { x, left } = start;
      start = null;
      if (!moved) return;
      const at = stops(element);
      const nearest = (value: number) => at.reduce((best, stop, index) => (Math.abs(stop - value) < Math.abs(at[best]! - value) ? index : best), 0);
      const from = nearest(left);
      const distance = event.clientX - x;
      let target = nearest(element.scrollLeft);
      if (target === from && Math.abs(distance) > 40) target = clamp(from + (distance < 0 ? 1 : -1), 0, at.length - 1);
      delete element.dataset.dragging;
      element.scrollTo({ left: at[target] ?? 0, behavior: smooth() });
      element.dispatchEvent(new Event("scroll"));
      settle = setTimeout(() => { element.style.scrollSnapType = ""; }, 400);
    };
    // A drag that ends over a year must not also count as tapping it.
    const click = (event: MouseEvent) => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } };
    const dragStart = (event: Event) => event.preventDefault();
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    element.addEventListener("click", click, true);
    element.addEventListener("dragstart", dragStart);
    return () => {
      clearTimeout(settle);
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      element.removeEventListener("click", click, true);
      element.removeEventListener("dragstart", dragStart);
    };
  }, [ref]);
}

