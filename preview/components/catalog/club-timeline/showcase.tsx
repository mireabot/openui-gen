import { DURAN, HARDEN, WILSON } from "./data";
import { ClubTimeline } from "./lib/club-timeline";
import { Example, Showcase } from "../sports-components/screen";

const withStats = DURAN.map(club => ({ ...club, stats: [
  { label: "Apps", value: String(club.appearances) },
  { label: "Goals", value: String(club.goals) },
  { label: "Assists", value: String(club.assists) },
] }));

/** NFL and NBA careers are ESPN seasons, so their dates are seasons and they have no loans. */
const TEAM_CAREERS = {
  nfl: { label: "Russell Wilson · 4 teams", clubs: WILSON },
  nba: { label: "James Harden · 6 teams, 2 mid-season trades", clubs: HARDEN },
};

export default function ClubTimelineShowcase({ sport = "soccer" }: { sport?: "soccer" | keyof typeof TEAM_CAREERS }) {
  if (sport !== "soccer") {
    const career = TEAM_CAREERS[sport];
    return <Showcase title="Club timeline">
      <Example label={career.label}><ClubTimeline clubs={career.clubs} initial={career.clubs.length - 1} /></Example>
    </Showcase>;
  }
  return <Showcase title="Club timeline">
    <Example label="m04 · Club history"><ClubTimeline clubs={DURAN} /></Example>
    <Example label="m05 · With stats"><ClubTimeline clubs={withStats} initial={withStats.length - 1} /></Example>
  </Showcase>;
}
