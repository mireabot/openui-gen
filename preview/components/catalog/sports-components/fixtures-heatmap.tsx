import { FixturesHeatmap, type FixtureResult } from "./lib/fixtures-heatmap";
import { Example, Showcase } from "./screen";

/** "WWDLW…" → results; "-" is a fixture still to play. */
const run = (letters: string): FixtureResult[] =>
  [...letters].map((c) => (c === "W" ? "win" : c === "D" ? "draw" : c === "L" ? "loss" : "upcoming"));

/** FixturesHeatmap: a strong run, a weak season with fixtures still to come, and a short run in a narrow grid. */
export default function FixturesHeatmapShowcase() {
  return (
    <Showcase title="Fixtures heatmap">
      <Example label="Strong form" first>
        <FixturesHeatmap value="2.4" caption="Points per game · last 20 matches" results={run("WWDWWLWWWDWWWLWDWWWW")} />
      </Example>
      <Example label="A whole season: 38 matches, 19 to a row, smaller squares">
        <FixturesHeatmap value="1.37" caption="Points per game · Premier League 2025/26" results={run("DDWDLLWWDWWLWDLWDLWDLWWWWDDLWLLLLLLDWL")} />
      </Example>
      <Example label="A season with fixtures to come">
        <FixturesHeatmap value="0.7" caption="Points per game · Premier League" results={run("LDLLWLDLLLDWLLDLLW--------------------")} />
      </Example>
      <Example label="Short run, five per row, no overview">
        <FixturesHeatmap value="60%" caption="Win rate · last 5 away" results={run("WLWWD")} columns={5} overview={false} />
      </Example>
    </Showcase>
  );
}
