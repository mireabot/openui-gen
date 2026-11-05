"use client";

import example from "./chelsea-injuries.json";
import { OpenUIExample, type ExampleTheme } from "./openui-example";

export function ChelseaInjuries(props: ExampleTheme) {
  return <OpenUIExample {...props} schema={example} filename="chelsea-injury-report.json" sources={example.snapshot.result.report.sources} sourceLabel="Injury report sources" />;
}
