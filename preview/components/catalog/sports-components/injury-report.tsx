import { INJURIES } from "./data";
import { InjuryList } from "./lib/injury-list";
import { InjuryCard } from "./lib/injury-report";
import { Example, Showcase } from "./screen";

/** One sport's injured players: the first two as cards, then the whole report as a list. */
export function InjuryReportShowcase({ sport = "soccer" }: { sport?: keyof typeof INJURIES }) {
  const players = INJURIES[sport];
  const [first, second] = players;
  return (
    <Showcase title="Injury report">
      <Example label="Card" first>
        <InjuryCard player={first} />
        <InjuryCard player={second} />
      </Example>
      <Example label="List element">
        <InjuryList title={sport === "soccer" ? "Chelsea injuries" : undefined} players={players} />
      </Example>
    </Showcase>
  );
}

export default function InjuryReport() {
  return <InjuryReportShowcase />;
}
