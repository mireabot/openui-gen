import type { Metadata } from "next";
import { SportsCatalog } from "@/components/catalog/sports-catalog";
import { StreamingGuide } from "@/components/catalog/custom/streaming-guide";
import { ChelseaInjuries } from "@/components/catalog/custom/chelsea-injuries";
import { readDesign, themeVars } from "@/lib/primitives/design";

export const metadata: Metadata = { title: "Components · OpenUI", description: "Design system sports cards, charts, lists and club timelines with their variations." };

export default function Catalog() {
  const design = readDesign();
  const theme = design ? themeVars(design, design.defaultTheme, "dark") : undefined;
  return <SportsCatalog theme={theme} specs={design?.primitives} custom={[
    { id: "StreamingGuide", name: "League streaming guide", summary: "Custom component built from primitives upon request.", preview: <StreamingGuide theme={theme} specs={design?.primitives} /> },
    { id: "ChelseaInjuries", name: "Chelsea injury report", summary: "Custom component built from primitives upon request. Season injury summaries, recovery updates and reported return dates.", preview: <ChelseaInjuries theme={theme} specs={design?.primitives} /> },
  ]} />;
}
