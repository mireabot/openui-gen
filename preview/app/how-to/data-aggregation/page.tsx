import type { Metadata } from "next";
import { DataAggregationGuide } from "@/components/how-to/data-aggregation-guide";
import { dataAggregationDoc } from "@/lib/how-to-docs";

export const metadata: Metadata = { title: "Data aggregation · How to · OpenUI", description: "How soccer, NFL, and NBA questions use league settings, ESPN and FotMob feeds, and cited web research to build a saved dataset for the OpenUI writer." };

export default function DataAggregationPage() {
  return <DataAggregationGuide markdown={dataAggregationDoc()} />;
}
