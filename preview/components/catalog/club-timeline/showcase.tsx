import { DURAN } from "./data";
import { ClubTimeline } from "./lib/club-timeline";
import { Example, Showcase } from "../sports-components/screen";

const withStats = DURAN.map(club => ({ ...club, stats: [
  { label: "Apps", value: String(club.appearances) },
  { label: "Goals", value: String(club.goals) },
  { label: "Assists", value: String(club.assists) },
] }));

export default function ClubTimelineShowcase() {
  return <Showcase title="Club timeline">
    <Example label="m04 · Club history"><ClubTimeline clubs={DURAN} /></Example>
    <Example label="m05 · With stats"><ClubTimeline clubs={withStats} initial={withStats.length - 1} /></Example>
  </Showcase>;
}
