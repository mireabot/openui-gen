import { TEAMS } from "./data";
import { Crest, TeamDetail } from "./lib/team-detail";
import { Example, Showcase } from "./screen";

/** TeamDetail (type inline) and the Crest it uses. */
export default function TeamDetailShowcase() {
  return (
    <Showcase title="Team detail">
      <Example label="Inline, with nickname" first>
        <TeamDetail team={TEAMS.arsenal} />
        <TeamDetail team={TEAMS.everton} />
      </Example>
      <Example label="Inline, without nickname">
        <TeamDetail team={TEAMS.brentford} />
      </Example>
      <Example label="Inline, long name truncates first">
        <div className="w-60">
          <TeamDetail team={TEAMS.wolves} />
        </div>
      </Example>
      <Example label="Crest sizes">
        <div className="flex items-end gap-4">
          {([20, 40, 56, 80] as const).map((size) => <Crest key={size} team={TEAMS.chelsea} size={size} />)}
        </div>
      </Example>
    </Showcase>
  );
}
