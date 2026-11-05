"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import styles from "@/app/how-to/how-to.module.css";

const AgentContext = createContext({ open: false, toggle: () => {} });

export function AgentView({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AgentContext.Provider value={{ open, toggle: () => setOpen(value => !value) }}>{children}</AgentContext.Provider>;
}

export function ForAgentsButton() {
  const { open, toggle } = useContext(AgentContext);
  return <button type="button" className={styles.forAgents} aria-pressed={open} data-active={open} onClick={toggle}>{open ? "Back to the page" : "For agents"}</button>;
}

/** The guide itself stays mounted while the Markdown shows, so its demos keep their state. */
export function AgentBody({ markdown, file, children }: { markdown: string; file: string; children: ReactNode }) {
  const { open } = useContext(AgentContext);
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return <>
    {open && <section className={styles.markdownPanel}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}>{file}</span><button type="button" className={styles.primaryButton} onClick={copy}>{copied ? "Copied" : "Copy Markdown"}</button></div>
      <pre><code>{markdown}</code></pre>
    </section>}
    <div hidden={open}>{children}</div>
  </>;
}
