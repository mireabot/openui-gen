"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/how-to/how-to.module.css";

const guides = [
  { href: "/how-to/data-aggregation", title: "Data aggregation", chapters: [
    ["walkthrough", "Follow a request"], ["routing", "Choose the route"], ["web-research", "Inside web research"], ["writer", "The writer handoff"], ["recovery", "When something fails"],
  ] },
  { href: "/how-to/swiftui-rendering", title: "SwiftUI rendering", chapters: [
    ["bridge", "Follow a primitive"], ["contract", "What crosses the bridge"], ["layout", "Compose a layout"], ["streaming", "Stream a screen"], ["identity", "Keep a view alive"], ["binding", "Bind data"], ["gaps", "Known gaps"],
  ] },
  { href: "/how-to/creating-boundaries", title: "Creating boundaries", chapters: [
    ["layers", "Where the rules live"], ["general", "Rules for every screen"], ["sports", "Sports rules"], ["adding", "Add a boundary"],
  ] },
];

export function GuideNav() {
  const pathname = usePathname();
  return <div className={styles.guideNav}>{guides.map((guide, index) => {
    const current = pathname === guide.href;
    return <div key={guide.href}>
      <Link href={guide.href} className={styles.guideLink} data-current={current}><span>{String(index + 1).padStart(2, "0")}</span> {guide.title} <span>↗</span></Link>
      <div className={styles.chapterPanel} data-open={current} inert={!current}>
        <div className={styles.chapterLinks}>{guide.chapters.map(([id, label], chapter) => <a key={id} href={`${guide.href}#${id}`} style={{ "--chapter": chapter } as CSSProperties}>{label}</a>)}</div>
      </div>
    </div>;
  })}</div>;
}
