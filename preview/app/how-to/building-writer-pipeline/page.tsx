import type { Metadata } from "next";
import { BuildingWriterPipelineGuide } from "@/components/how-to/building-writer-pipeline-guide";
import { buildingWriterPipelineDoc } from "@/lib/how-to-docs";

export const metadata: Metadata = { title: "Building the writer pipeline · How to · OpenUI", description: "How the OpenUI writer picks a component for each requested fact group, how the compiler validates each statement, and how to verify the writer with the relevance probe." };

export default function BuildingWriterPipelinePage() {
  return <BuildingWriterPipelineGuide markdown={buildingWriterPipelineDoc()} />;
}
