import { readFileSync } from "node:fs";
import path from "node:path";

const read = (name: string) => readFileSync(path.join(process.cwd(), "content/how-to", `${name}.md`), "utf8").trim();

export const dataAggregationDoc = () => read("data-aggregation");
export const swiftUIRenderingDoc = () => read("swiftui-rendering");
export const buildingWriterPipelineDoc = () => read("building-writer-pipeline");

/** The index page copies every guide, so one paste carries the whole field guide. */
export const allGuidesDoc = () => `# OpenUI Sports: how it comes together\n\nThese guides explain the generation pipeline behind a generated screen.\n\n${dataAggregationDoc()}\n\n${buildingWriterPipelineDoc()}\n\n${swiftUIRenderingDoc()}`;
