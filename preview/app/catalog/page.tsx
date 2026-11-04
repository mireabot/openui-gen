import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenUIPreview } from "@/components/primitives/openui-render";
import { appearanceOf, readDesignWithKino, themeVars } from "@/lib/primitives/design";

const suiteSchema = z.object({ fixtures: z.array(z.object({
  key: z.string(),
  program: z.string(),
  dataset: z.object({ tool: z.literal("sports_dataset"), args: z.object({ run: z.string() }), result: z.record(z.string(), z.unknown()) }),
})) });

export default function Catalog() {
  const suite = suiteSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "..", "catalog", "openui", "fixtures.json"), "utf8")));
  const design = readDesignWithKino();
  const brand = design?.defaultTheme ?? "";
  const theme = design ? themeVars(design, brand, appearanceOf(design, brand)) : undefined;

  return <main className="h-full overflow-y-auto p-8">
    <h1 className="text-xl font-medium">Sports component catalog</h1>
    <p className="mt-2 mb-8 text-sm text-muted-foreground">Deterministic compiler fixtures rendered with Kino. These examples verify current rendering and do not establish equivalence with the source designs.</p>
    <nav className="mb-6 flex flex-wrap gap-4 text-sm">{suite.fixtures.filter(fixture => fixture.key.endsWith("/full") || fixture.key === "ColorCell/fluid").map(fixture => <a key={fixture.key} href={`#${fixture.key}`}>{fixture.key.split("/")[0]}</a>)}</nav>
    <div className="flex flex-wrap items-start gap-8">
      {suite.fixtures.filter(fixture => !fixture.key.startsWith("Each/") && !fixture.key.startsWith("Query/") && !fixture.key.startsWith("Nullable/")).map(fixture => <section key={fixture.key} id={fixture.key} data-fixture={fixture.key} className="w-[390px] shrink-0">
        <h2 className="mb-3 text-sm font-medium">{fixture.key}</h2>
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <OpenUIPreview program={fixture.program} seed={fixture.dataset} theme={theme} specs={design?.primitives} isStreaming={false} />
        </div>
      </section>)}
    </div>
  </main>;
}
