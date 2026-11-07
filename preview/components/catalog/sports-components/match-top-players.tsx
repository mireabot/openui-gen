import { PLAYERS } from "./data";
import { MatchTopPlayers, type MatchPlayer } from "./lib/match-top-players";
import { Example, Showcase } from "./screen";

const [, saka, palmer, joao, rice] = PLAYERS;
const RATING_HIGH = "bg-ds-tone-good-fg text-ds-surface-screen";
const RATING_MID = "bg-ds-ink-brand text-ds-surface-screen";
const player = (who: (typeof PLAYERS)[number], value: string, valueClass?: string): MatchPlayer => ({ ...who!, value, valueClass });

/** MatchTopPlayers with three rows, one row, and a side with fewer players. Figures are illustrative. */
export default function MatchTopPlayersShowcase() {
  return (
    <Showcase title="Match top players">
      <Example label="Top rated: as many rows as the request asks" first>
        <MatchTopPlayers
          title="Top rated"
          metric="Rating"
          rows={[
            { home: player(palmer!, "8.6", RATING_HIGH), away: player(saka!, "7.7", RATING_HIGH) },
            { home: player(joao!, "7.5", RATING_HIGH), away: player(rice!, "6.9", RATING_MID) },
          ]}
        />
      </Example>
      <Example label="Top scorer of each side: one row">
        <MatchTopPlayers title="Top scorers" metric="Goals" rows={[{ home: player(palmer!, "2"), away: player(saka!, "1") }]} />
      </Example>
      <Example label="A side with fewer scorers leaves its cell empty">
        <MatchTopPlayers
          title="Top scorers"
          metric="Goals"
          rows={[
            { home: player(palmer!, "2"), away: player(saka!, "1") },
            { home: player(joao!, "1") },
          ]}
        />
      </Example>
    </Showcase>
  );
}
