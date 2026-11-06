import { z } from "zod";
import { config } from "../config.js";
import { modelSender } from "../llm/generation.js";
import { structuredCompletion, type StructuredCompletionHooks } from "../llm/structured-completion.js";
import type { PlayerCandidate, PlayerPick, PlayerQuery } from "./fotmob.js";

const Schema = z.object({ fotmobId: z.number().int().nullable(), searchAgain: z.string().nullable() }).strict();

const SYSTEM = `You work out which footballer a screen is about, so it can show the right photo. You get what the user asked, the player's name as written, any detail shown beside it, and FotMob's search results: each with their current club and every senior club they played for.
Use the request and your knowledge. Players change clubs, so a player asked about at a club they have since left is still that player: look through each career. Names can be spelled differently or written in another order.
fotmobId: the id of the result who is this player, or null if none of them is. Only choose an id from the results.
searchAgain: when none of the results is the player, the name FotMob would know them by, e.g. "Heung-min Son" for "Son Heung-Min"; otherwise null. If the name is not a footballer (a club, say), both are null.`;

/** Which FotMob result is the player the request means. A cheap model call, only made when the name alone does not settle it. */
export async function pickPlayer(query: PlayerQuery, candidates: readonly PlayerCandidate[], request: string, hooks?: StructuredCompletionHooks): Promise<PlayerPick> {
  const result = await structuredCompletion({
    stage: "data",
    request: {
      model: config().SPORTS_PLAN_MODEL, maxTokens: 300, schema: z.toJSONSchema(Schema) as Record<string, unknown>,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ request, player: query.name, ...(query.team ? { team: query.team } : {}), ...(query.context ? { shownAs: query.context } : {}), results: candidates }) }],
    },
    send: modelSender({ effort: "low" }),
    parse: text => Schema.parse(JSON.parse(text)),
    ...(hooks ? { hooks } : {}),
  });
  return result.value;
}
