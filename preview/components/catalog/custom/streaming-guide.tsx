"use client";

import example from "./streaming-guide.json";
import { OpenUIExample, type ExampleTheme } from "./openui-example";

const sources = [
  { name: "Premier League · NBCUniversal", url: "https://www.nbcuniversal.com/article/nbcuniversal-reaches-six-year-extension-serve-exclusive-us-home-premier-league" },
  { name: "Serie A · Paramount", url: "https://www.paramountpressexpress.com/paramount-plus/releases/?view=112947-cbs-sports-and-lega-serie-a-extend-us-media-rights-partnership-through-20262027-season-with-all-matches-to-continue-to-be-streamed-on-paramount-plus" },
  { name: "LaLiga · ESPN", url: "https://espnpressroom.com/press-release/espn-presents-the-2026-27-laliga-season-beginning-aug-15/" },
  { name: "Bundesliga · league announcement", url: "https://www.bundesliga.com/en/bundesliga/news/bundesliga-broadens-broadcast-accessibility-for-fans-in-us-with-new-deals-versants-usa-sports-nbcuniversals-telemundo-38268" },
];

export function StreamingGuide(props: ExampleTheme) {
  return <OpenUIExample {...props} schema={example} filename="league-streaming-guide.json" sources={sources} sourceLabel="Viewing-rights sources" />;
}
