import type { Metadata } from "next";
import { SwiftUIRenderingGuide } from "@/components/how-to/swiftui-rendering-guide";
import { swiftUIRenderingDoc } from "@/lib/how-to-docs";
import { readDesignWithKino, themeVars } from "@/lib/primitives/design";

export const metadata: Metadata = { title: "SwiftUI rendering · How to · OpenUI", description: "An interactive walkthrough of how OpenUI lang primitives, layouts, streamed programs and data become SwiftUI views." };

export default function SwiftUIRenderingPage() {
  const design = readDesignWithKino();
  return <SwiftUIRenderingGuide markdown={swiftUIRenderingDoc()} theme={design ? themeVars(design, design.defaultTheme, "dark") : undefined} specs={design?.primitives} />;
}
