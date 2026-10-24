"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Measured height: interruptible CSS transitions keep children mounted through either direction. */
export function Collapse({ open, instant = false, id, children }: { open: boolean; instant?: boolean; id?: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div id={id} aria-hidden={!open} inert={!open} data-instant={instant || undefined} className="primitive-collapse" style={{ height: open ? height : 0, opacity: open ? 1 : 0 }}>
      <div ref={content}>{children}</div>
    </div>
  );
}
