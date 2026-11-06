import { SportsLive } from "@/components/primitives/sports-live";
import { appearanceOf, readDesign, themeVars } from "@/lib/primitives/design";
import styles from "./preview.module.css";

/**
 * Live OpenUI generation for sports: a prompt, the streamed program rendered in an iPhone frame
 * with the Kino theme, and the program text. Built as a static page; the theme is read from
 * design/ at build time.
 */
export default function Home() {
  const design = readDesign();
  const brand = design?.defaultTheme ?? "";
  const appearance = design ? appearanceOf(design, brand) : "dark";
  const theme = design ? themeVars(design, brand, appearance) : undefined;

  return (
    <main className={`${styles.workspace} flex h-full flex-col gap-6 overflow-y-auto p-5 md:p-8`}>
      <header className="flex flex-col gap-1">
        <h1 className="text-[18px] leading-[22px] font-medium">OpenUI generation</h1>
        <p className="text-[14px] leading-[18px] text-muted-foreground">Ask about a soccer, NFL or NBA team, league or player. Follow the pipeline as the screen takes shape.</p>
      </header>
      <SportsLive theme={theme} specs={design?.primitives} appearance={appearance} />
    </main>
  );
}
