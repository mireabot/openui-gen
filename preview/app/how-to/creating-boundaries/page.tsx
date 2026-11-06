import type { Metadata } from "next";
import { CreatingBoundariesGuide } from "@/components/how-to/creating-boundaries-guide";
import { creatingBoundariesDoc } from "@/lib/how-to-docs";

export const metadata: Metadata = { title: "Creating boundaries · How to · OpenUI", description: "The rules the OpenUI writer follows, where each one lives, and what a statement looks like with and without it." };

export default function CreatingBoundariesPage() {
  return <CreatingBoundariesGuide markdown={creatingBoundariesDoc()} />;
}
