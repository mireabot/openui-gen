"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SoccerBallIcon } from "@phosphor-icons/react/dist/csr/SoccerBall";
import { BasketballIcon } from "@phosphor-icons/react/dist/csr/Basketball";
import { FootballIcon } from "@phosphor-icons/react/dist/csr/Football";

export function AppNav() {
  const pathname = usePathname();
  return <nav className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-7 border-b border-ds-outline-subtle bg-ds-surface-screen px-5 pt-3 text-[13px] text-ds-ink-primary sm:px-6 sm:pt-0">
    <Link href="/" className="mr-3 mb-1 flex basis-full items-center gap-2.5 whitespace-nowrap tracking-tight sm:mb-0 sm:basis-auto">
      <span className="flex items-center -space-x-2">
        <span className="relative z-20 flex size-7 -translate-y-0.5 items-center justify-center rounded-full bg-ds-surface-screen ring-2 ring-ds-surface-screen"><SoccerBallIcon size={26} weight="fill" /></span>
        <span className="relative z-10 flex size-7 translate-y-0.5 items-center justify-center rounded-full bg-ds-surface-screen ring-2 ring-ds-surface-screen"><BasketballIcon size={26} weight="fill" /></span>
        <span className="flex size-7 -translate-y-0.5 items-center justify-center rounded-full bg-ds-surface-screen ring-2 ring-ds-surface-screen"><FootballIcon size={26} weight="fill" /></span>
      </span>
      <span className="text-[15px]">OpenUI <strong className="font-bold">Sports</strong></span>
    </Link>
    {[{ href: "/", label: process.env.NEXT_PUBLIC_PREVIEW_HOME === "landing" ? "Home" : "Preview" }, { href: "/catalog", label: "Components" }, { href: "/how-to", label: "How to" }].map(item => {
      const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className={`flex h-11 items-center border-b-2 pt-0.5 sm:h-14 ${current ? "border-ds-ink-brand font-medium" : "border-transparent text-ds-ink-secondary hover:text-ds-ink-primary"}`}>{item.label}</Link>;
    })}
  </nav>;
}
