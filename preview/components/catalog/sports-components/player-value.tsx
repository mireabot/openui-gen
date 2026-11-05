import history from "./player-value-data.json";
import { PlayerValue, type ClubStretch } from "./lib/player-value";
import { Example, Showcase } from "./screen";

type Saved = { id: number; name: string; lineColor: string; tagColor: string; points: [string, number][] };

const stretches = (saved: Saved[]): ClubStretch[] => saved.map((stretch) => ({
  name: stretch.name,
  lineColor: stretch.lineColor,
  tagColor: stretch.tagColor,
  logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${stretch.id}.png`,
  points: stretch.points.map(([date, value]) => ({ date, value })),
}));

const palmer = stretches(history.palmer as Saved[]);
const haaland = stretches(history.haaland as Saved[]);

/** PlayerValue with FotMob's real history: three clubs, four clubs, and values under a million. Drag across a chart to read it. */
export default function PlayerValueShowcase() {
  return (
    <Showcase title="Player value">
      <Example label="Three clubs: drag across the chart" first>
        <PlayerValue caption="Cole Palmer · Market value" stretches={palmer} />
      </Example>
      <Example label="Four clubs">
        <PlayerValue caption="Erling Haaland · Market value" stretches={haaland} />
      </Example>
      <Example label="Under a million reads in thousands">
        <PlayerValue caption="Cole Palmer · Value at Manchester City U18" stretches={palmer.slice(0, 1)} />
      </Example>
    </Showcase>
  );
}
