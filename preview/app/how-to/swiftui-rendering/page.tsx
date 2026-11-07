import type { Metadata } from "next";
import { SwiftUIRenderingGuide } from "@/components/how-to/swiftui-rendering-guide";
import { swiftUIRenderingDoc } from "@/lib/how-to-docs";
import { readDesign, themeVars } from "@/lib/primitives/design";

export const metadata: Metadata = { title: "From DSL to SwiftUI · How to · OpenUI", description: "An interactive walkthrough of how OpenUI Lang primitives, sports components, layouts, streamed programs and data become SwiftUI views." };

export default function SwiftUIRenderingPage() {
  const design = readDesign();
  return <SwiftUIRenderingGuide markdown={swiftUIRenderingDoc()} theme={design ? themeVars(design, design.defaultTheme, "dark") : undefined} specs={design?.primitives} />;
}
