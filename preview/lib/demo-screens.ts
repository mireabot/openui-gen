import catalog from "../../catalog/openui/fixtures.json";
import type { ImportedScreen } from "./imported-screen";

/**
 * Screens built from the component catalog's samples, to look at a data structure with no model
 * call. Each demo nests catalog records inside one answer and calls their components by name at the
 * new paths, the way the writer would; the preview expands the calls with its bundled templates.
 */

interface Fixture { readonly key: string; readonly program: string; readonly dataset: { readonly result: { readonly answers: { readonly q1: { readonly record: unknown } } } } }
const fixtures = (catalog as { fixtures: Fixture[] }).fixtures;

function sample(key: string): Fixture {
  const fixture = fixtures.find(item => item.key === key);
  if (!fixture) throw new Error(`The catalog has no ${key} sample`);
  return fixture;
}

const recordOf = (key: string) => sample(key).dataset.result.answers.q1.record;

function nestedGame(): ImportedScreen {
  const run = "demo-nested-game";
  return {
    prompt: "How did Cole Palmer play in Chelsea's latest game? Key stats only.",
    seed: { tool: "sports_dataset", args: { run }, result: { answers: { q1: {
      status: "complete", question: "Cole Palmer's performance in Chelsea's latest game", title: "Latest game", source: "Demo · catalog samples",
      latestGame: { match: recordOf("MatchCard/full"), player: recordOf("StatsCard/full") },
    } } } },
    program: [
      `root = Screen([pick1])`,
      `d = Query("sports_dataset", {run: "${run}"}, {})`,
      `pick1 = Section(d.answers.q1.title, [pick1_match, pick1_player], null, null, d.answers.q1.source)`,
      `pick1_match = MatchCard(d.answers.q1.latestGame.match)`,
      `pick1_player = StatsCard(d.answers.q1.latestGame.player, false)`,
    ].join("\n") + "\n",
  };
}

export const DEMO_SCREENS: readonly { readonly id: string; readonly label: string; readonly screen: () => ImportedScreen }[] = [
  { id: "nested-game", label: "Nested response · game card + player stat rail", screen: nestedGame },
];
