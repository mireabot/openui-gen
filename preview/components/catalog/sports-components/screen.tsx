"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";

/** Source examples stay together as variations inside one gallery cell. */
export function Showcase({ children }: { title: string; children: ReactNode }) {
  const [selected, setSelected] = useState(0);
  const examples = Children.toArray(children);
  return <div className="flex min-w-0 flex-col gap-6">
    <div className="flex flex-wrap gap-2">{examples.map((example, index) => {
      const label = isValidElement<{ label: string }>(example) ? example.props.label : `Variation ${index + 1}`;
      return <button key={index} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)} className={`rounded-full border px-3 py-1.5 text-[11px] leading-4 transition-colors ${index === selected ? "border-ds-outline-control bg-ds-surface-filled text-ds-ink-primary" : "border-ds-outline-subtle text-ds-ink-secondary hover:text-ds-ink-primary"}`}>{label}</button>;
    })}</div>
    <div key={selected} className="min-w-0">{examples[selected]}</div>
  </div>;
}

export function Example({ children }: { label: string; first?: boolean; children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3">{children}</div>;
}
