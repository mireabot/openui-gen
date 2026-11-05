import Link from "next/link";
import type { Metadata } from "next";
import { AgentBody, AgentView, ForAgentsButton } from "@/components/how-to/agent-view";
import { allGuidesDoc } from "@/lib/how-to-docs";
import styles from "./how-to.module.css";

export const metadata: Metadata = { title: "How to · OpenUI", description: "Interactive guides to the OpenUI generation pipeline." };

export default function HowTo() {
  return <AgentView><div className={styles.indexPage}>
    <div className={styles.eyebrow}>OPENUI / FIELD GUIDE</div>
    <div className={styles.titleRow}><h1>How it comes together.</h1><ForAgentsButton /></div>
    <p className={styles.lead}>Follow the decisions behind a generated screen. Start with the data that makes it possible.</p>
    <AgentBody markdown={allGuidesDoc()} file="how-to.md">
    <Link href="/how-to/data-aggregation" className={styles.guideCard}>
      <div className={styles.guideGraphic}><span>ESPN</span><span>FotMob</span><span>Parallel</span><i>↓</i><strong>One collected dataset</strong></div>
      <div className={styles.guideCopy}><span className={styles.eyebrow}>PROCESS 01 · INTERACTIVE GUIDE</span><h2>Data aggregation</h2><p>How a request becomes questions, how each question finds its source, and what reaches the writer.</p><span className={styles.textLink}>Explore the pipeline <span>↗</span></span></div>
    </Link>
    <Link href="/how-to/swiftui-rendering" className={styles.guideCard}>
      <div className={styles.guideGraphic}><span>Program text</span><span>Catalog</span><span>Handles</span><i>↓</i><strong>One SwiftUI screen</strong></div>
      <div className={styles.guideCopy}><span className={styles.eyebrow}>PROCESS 02 · INTERACTIVE GUIDE</span><h2>SwiftUI rendering</h2><p>How a primitive reaches Swift, how layouts compose, how a screen streams in, and how data binds to a view.</p><span className={styles.textLink}>Explore the bridge <span>↗</span></span></div>
    </Link>
    </AgentBody>
  </div></AgentView>;
}
