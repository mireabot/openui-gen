import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { SoccerBallIcon } from "@phosphor-icons/react/dist/ssr/SoccerBall";
import { BasketballIcon } from "@phosphor-icons/react/dist/ssr/Basketball";
import { FootballIcon } from "@phosphor-icons/react/dist/ssr/Football";
import { GithubLogoIcon } from "@phosphor-icons/react/dist/ssr/GithubLogo";
import { LaunchVideo } from "@/components/launch-video";
import { DesignSystemPrimitive, DesignSystemProvider } from "@/components/primitives/render";
import type { Design } from "@/lib/primitives/design";

/** The sports, white on a translucent secondary-ink circle. */
const SPORTS = [SoccerBallIcon, BasketballIcon, FootballIcon];

const REPO = "https://github.com/mireabot/openui-sports";

/** The link cards; the repo card is full width and opens GitHub. */
const LINKS = [
  { href: "/catalog", icon: "chart.bar", title: "Components", body: "Every sports component, drawn from its OpenUI program with soccer, NBA and NFL samples." },
  { href: "/how-to", icon: "book", title: "Docs", body: "How a question becomes data, how the writer picks components, and how SwiftUI renders the program." },
  { href: REPO, icon: "arrow.up.right", title: "Build your own", body: "Fork or clone the repo to generate screens in your own app. The preview studio shows each run's data, program and screen as it streams, so you can debug a run." },
];

const text = (content: string, role: string, weight: string, ink: string) =>
  <DesignSystemPrimitive name="Text" props={{ content, role, weight, ink }} slots={{}} />;

/**
 * The home page when the preview runs without a generation backend (NEXT_PUBLIC_PREVIEW_HOME=landing):
 * what the project is, links to the components, the docs and the repo, and a footer crediting OpenUI.
 * The link cards are design system primitives, so they match the components they lead to.
 */
export function Landing({ theme, specs }: { theme?: CSSProperties; specs?: Design["primitives"] }) {
  return <main className="flex h-full flex-col overflow-y-auto bg-ds-surface-screen text-ds-ink-primary [color-scheme:dark]" style={theme}>
    <DesignSystemProvider specs={specs}>
      <div className="mx-auto my-auto flex w-full max-w-[640px] flex-col items-center px-5 py-16 text-center">
        <div className="flex gap-4">{SPORTS.map((Glyph, index) => <span key={index} className="flex size-14 items-center justify-center rounded-full bg-ds-ink-secondary/20 text-ds-ink-primary"><Glyph size={28} weight="fill" /></span>)}</div>
        <h1 className="mt-8 text-[28px] leading-[34px] font-semibold tracking-[-0.5px]">OpenUI Sports</h1>
        <p className="mt-3 max-w-[520px] text-[15px] leading-[22px] text-ds-ink-secondary">
          Ask about a soccer, NBA or NFL team, league or player. The server gathers the data, a model writes the answer as an OpenUI Lang program, and the iOS app renders that program as SwiftUI views while it streams in.
        </p>
        <LaunchVideo src="https://media.naivesolution.dev/media/openui-launch-v2.mp4" className="mt-12 h-[240px]" />
        <div className="mt-4 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {LINKS.map(link => <Link key={link.href} href={link.href} className={`block rounded-[24px] transition-transform active:scale-[0.98] [&>div]:h-full ${link.href === REPO ? "sm:col-span-2" : ""}`}>
            <DesignSystemPrimitive name="Card" props={{ surface: "card", padding: 20, gap: 16 }} slots={{ children: [
              <DesignSystemPrimitive key="icon" name="IconTile" props={{ icon: link.icon, style: "soft", size: 40 }} slots={{}} />,
              <DesignSystemPrimitive key="copy" name="Stack" props={{ axis: "v", gap: 4 }} slots={{ children: [
                <Fragment key="title">{text(link.title, "headline", "semibold", "primary")}</Fragment>,
                <Fragment key="body">{text(link.body, "footnote", "regular", "secondary")}</Fragment>,
              ] }} />,
            ] }} />
          </Link>)}
        </div>
        <footer className="mt-12 flex items-center justify-center gap-5 text-[13px] leading-[18px] text-ds-ink-secondary">
          <a href="https://www.openui.com" className="flex items-center gap-2 hover:text-ds-ink-primary">
            Powered by <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/openui-logo.svg`} alt="" width={30} height={24} /> <span className="font-medium text-ds-ink-primary">OpenUI</span>
          </a>
          <span className="h-4 w-px bg-ds-outline-subtle" />
          <a href={REPO} className="text-ds-ink-secondary hover:text-ds-ink-primary"><GithubLogoIcon size={20} weight="fill" /></a>
        </footer>
      </div>
    </DesignSystemProvider>
  </main>;
}
