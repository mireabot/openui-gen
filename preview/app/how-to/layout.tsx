import Link from "next/link";
import { GuideNav } from "@/components/how-to/guide-nav";
import styles from "./how-to.module.css";

export default function HowToLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/how-to" className={styles.sidebarTitle}>How to</Link>
      <p className={styles.sidebarCaption}>Inside the generation pipeline</p>
      <span className={styles.navGroup}>THE PROCESSES</span>
      <GuideNav />
      <div className={styles.sidebarFoot}><span>Read the flow. Try the decisions.</span><p>Interactive guides built from the implementation.</p><Link href="/">Back to OpenUI Preview ↗</Link></div>
    </aside>
    <main className={styles.content} id="how-to-content">{children}</main>
  </div>;
}
