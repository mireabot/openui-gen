import type { Metadata } from "next";
import { DataAggregationGuide } from "@/components/how-to/data-aggregation-guide";
import { dataAggregationDoc } from "@/lib/how-to-docs";

export const metadata: Metadata = { title: "Data aggregation · How to · OpenUI", description: "An interactive walkthrough of question planning, ESPN and FotMob routing, Parallel research, and the dataset passed to the OpenUI writer." };

export default function DataAggregationPage() {
  return <DataAggregationGuide markdown={dataAggregationDoc()} />;
}
