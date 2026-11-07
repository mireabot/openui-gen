import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { SoccerBallIcon } from "@phosphor-icons/react/dist/ssr/SoccerBall";
import { BasketballIcon } from "@phosphor-icons/react/dist/ssr/Basketball";
import { FootballIcon } from "@phosphor-icons/react/dist/ssr/Football";
import { DesignSystemPrimitive, DesignSystemProvider } from "@/components/primitives/render";
import type { Design } from "@/lib/primitives/design";

/** The sports, white on a tone circle: soccer info, basketball good, football warn. */
const SPORTS = [
  { Glyph: SoccerBallIcon, tone: "bg-ds-tone-info-bg" },
  { Glyph: BasketballIcon, tone: "bg-ds-tone-good-bg" },
  { Glyph: FootballIcon, tone: "bg-ds-tone-warn-bg" },
];

const LINKS = [
  { href: "/catalog", icon: "chart.bar", title: "Components", body: "Every sports component, drawn from its OpenUI program with soccer, NBA and NFL samples." },
  { href: "/how-to", icon: "book", title: "Docs", body: "How a question becomes data, how the writer picks components, and how SwiftUI renders the program." },
];

const text = (content: string, role: string, weight: string, ink: string) =>
  <DesignSystemPrimitive name="Text" props={{ content, role, weight, ink }} slots={{}} />;

/**
 * The home page when the preview runs without a generation backend (NEXT_PUBLIC_PREVIEW_HOME=landing):
 * what the project is and links to the components and the docs. The link cards are design system
 * primitives, so they match the components they lead to.
 */
export function Landing({ theme, specs }: { theme?: CSSProperties; specs?: Design["primitives"] }) {
  return <main className="flex h-full overflow-y-auto bg-ds-surface-screen text-ds-ink-primary [color-scheme:dark]" style={theme}>
    <DesignSystemProvider specs={specs}>
      <div className="m-auto flex w-full max-w-[640px] flex-col items-center px-5 py-16 text-center">
        <div className="flex gap-4">{SPORTS.map(({ Glyph, tone }, index) => <span key={index} className={`flex size-14 items-center justify-center rounded-full text-ds-ink-primary ${tone}`}><Glyph size={28} weight="fill" /></span>)}</div>
        <h1 className="mt-8 text-[28px] leading-[34px] font-semibold tracking-[-0.5px]">OpenUI Sports</h1>
        <p className="mt-3 max-w-[520px] text-[15px] leading-[22px] text-ds-ink-secondary">
          Ask about a soccer, NBA or NFL team, league or player. The server gathers the data, a model writes the answer as an OpenUI Lang program, and the iOS app renders that program as SwiftUI views while it streams in.
        </p>
        <div className="mt-12 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {LINKS.map(link => <Link key={link.href} href={link.href} className="block rounded-[24px] transition-transform active:scale-[0.98] [&>div]:h-full">
            <DesignSystemPrimitive name="Card" props={{ surface: "card", padding: 20, gap: 16 }} slots={{ children: [
              <DesignSystemPrimitive key="icon" name="IconTile" props={{ icon: link.icon, style: "soft", size: 40 }} slots={{}} />,
              <DesignSystemPrimitive key="copy" name="Stack" props={{ axis: "v", gap: 4 }} slots={{ children: [
                <Fragment key="title">{text(link.title, "headline", "semibold", "primary")}</Fragment>,
                <Fragment key="body">{text(link.body, "footnote", "regular", "secondary")}</Fragment>,
              ] }} />,
            ] }} />
          </Link>)}
        </div>
      </div>
    </DesignSystemProvider>
  </main>;
}
