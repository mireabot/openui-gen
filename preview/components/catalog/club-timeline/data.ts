import type { ClubStop } from "./lib/club-timeline";

export type ClubSpell = {
  id: string;
  name: string;
  /** Empty when there is no crest: the card shows a monogram on the club colour. */
  logo: string;
  color: string;
  year: string;
  dates: string;
  /** Null when the source has no location: the line is left out. */
  location: string | null;
  /** Share of the whole career, for a track drawn to true time. */
  from: number;
  to: number;
  appearances: number;
  goals: number;
  assists: number;
};

const crest = (id: number) => `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;
const CAREER_START = Date.UTC(2016, 2, 30);
const CAREER_END = Date.UTC(2026, 10, 4);
const share = (year: number, month: number, day = 1) => (Date.UTC(year, month, day) - CAREER_START) / (CAREER_END - CAREER_START);

/** Erling Haaland's senior clubs: FotMob career history, read 2026-11-04. The city is from each club's FotMob page. */
export const HAALAND: ClubSpell[] = [
  { id: "bryne", name: "Bryne", logo: crest(8531), color: "#ef4941", year: "2016", dates: "Mar 2016 – Jan 2017", location: "Bryne, Norway", from: 0, to: share(2017, 0, 31), appearances: 16, goals: 0, assists: 0 },
  { id: "molde", name: "Molde", logo: crest(9917), color: "#0068b0", year: "2017", dates: "Feb 2017 – Dec 2018", location: "Molde, Norway", from: share(2017, 1), to: share(2018, 11, 31), appearances: 48, goals: 19, assists: 5 },
  { id: "salzburg", name: "Salzburg", logo: crest(10013), color: "#f13032", year: "2019", dates: "Jan 2019 – Dec 2019", location: "Wals-Siezenheim, Austria", from: share(2019, 0), to: share(2019, 11, 31), appearances: 27, goals: 29, assists: 5 },
  { id: "dortmund", name: "Borussia Dortmund", logo: crest(9789), color: "#ffd900", year: "2020", dates: "Jan 2020 – Jun 2022", location: "Dortmund, Germany", from: share(2020, 0), to: share(2022, 5, 30), appearances: 89, goals: 86, assists: 19 },
  { id: "city", name: "Manchester City", logo: crest(8456), color: "#76b4e5", year: "2022", dates: "Jul 2022 – Present", location: "Manchester, England", from: share(2022, 6), to: 1, appearances: 211, goals: 175, assists: 29 },
];

/**
 * Jhon Durán's senior clubs: FotMob career history, read 2026-11-04, oldest first. Left out: Al Nassr's
 * three-week "back from loan" entry in July 2026 and its future one in July 2027, neither of which is a
 * spell he played. Dates are as FotMob gives them, so Al Nassr overlaps his Fenerbahçe loan.
 */
export const DURAN: (Omit<ClubSpell, "from" | "to"> & { loan?: boolean })[] = [
  { id: "envigado", name: "Envigado", logo: crest(4402), color: "#ff5406", year: "2019", dates: "Jan 2019 – Dec 2021", location: "Envigado, Colombia", appearances: 49, goals: 10, assists: 4 },
  { id: "chicago", name: "Chicago Fire", logo: crest(6397), color: "#ff0000", year: "2022", dates: "Jan 2022 – Jan 2023", location: "Chicago, Illinois, USA", appearances: 28, goals: 8, assists: 3 },
  { id: "chicago-ii", name: "Chicago Fire II", logo: crest(1348118), color: "#7bccef", year: "2022", dates: "Mar 2022 – Dec 2022", location: "Bridgeview, Illinois, USA", appearances: 2, goals: 0, assists: 0 },
  { id: "villa", name: "Aston Villa", logo: crest(10252), color: "#9d2358", year: "2023", dates: "Jan 2023 – Jan 2025", location: "Birmingham, England", appearances: 78, goals: 20, assists: 0 },
  { id: "nassr", name: "Al Nassr", logo: crest(101918), color: "#fbd129", year: "2025", dates: "Jan 2025 – Feb 2026", location: "Riyadh, Saudi Arabia", appearances: 18, goals: 12, assists: 0 },
  { id: "fenerbahce", name: "Fenerbahçe", logo: crest(8695), color: "#ffed00", year: "2025", dates: "Jul 2025 – Feb 2026", location: "İstanbul, Turkey", appearances: 21, goals: 5, assists: 2, loan: true },
  { id: "zenit", name: "Zenit St. Petersburg", logo: crest(8698), color: "#7fcbf3", year: "2026", dates: "Feb 2026 – Jun 2026", location: "St. Petersburg, Russia", appearances: 9, goals: 2, assists: 0, loan: true },
  { id: "benfica", name: "Benfica", logo: crest(9772), color: "#c00001", year: "2026", dates: "Jul 2026 – Jun 2027", location: "Lisboa, Portugal", appearances: 17, goals: 5, assists: 0, loan: true },
];

/**
 * Team sport careers, as the server builds them from ESPN's athlete stats (careerOf): one spell per
 * run of seasons with a team, a mid-season trade starting the next. Recorded 2026-11-05.
 */
export const HARDEN: ClubStop[] = [
  { id: "oklahoma-city-thunder-2009-10", name: "Oklahoma City Thunder", logo: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png", color: "#c67c03", year: "2009", dates: "2009-10 – 2011-12", location: "Oklahoma City" },
  { id: "houston-rockets-2012-13", name: "Houston Rockets", logo: "https://a.espncdn.com/i/teamlogos/nba/500/hou.png", color: "#d40026", year: "2012", dates: "2012-13 – 2020-21", location: "Houston" },
  { id: "brooklyn-nets-2020-21", name: "Brooklyn Nets", logo: "https://a.espncdn.com/i/teamlogos/nba/500/bkn.png", color: "#000000", year: "2020", dates: "2020-21 – 2021-22", location: "Brooklyn" },
  { id: "philadelphia-76ers-2021-22", name: "Philadelphia 76ers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png", color: "#000000", year: "2021", dates: "2021-22 – 2022-23", location: "Philadelphia" },
  { id: "la-clippers-2023-24", name: "LA Clippers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/lac.png", color: "#1d428a", year: "2023", dates: "2023-24 – 2025-26", location: "LA" },
  { id: "cleveland-cavaliers-2025-26", name: "Cleveland Cavaliers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/cle.png", color: "#860038", year: "2025", dates: "2025-26 – 2026-27", location: "Cleveland" },
];

export const WILSON: ClubStop[] = [
  { id: "seattle-seahawks-2012", name: "Seattle Seahawks", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", color: "#224970", year: "2012", dates: "2012 – 2021", location: "Seattle" },
  { id: "denver-broncos-2022", name: "Denver Broncos", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", color: "#002e4d", year: "2022", dates: "2022 – 2023", location: "Denver" },
  { id: "pittsburgh-steelers-2024", name: "Pittsburgh Steelers", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", color: "#000000", year: "2024", dates: "2024", location: "Pittsburgh" },
  { id: "new-york-giants-2025", name: "New York Giants", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", color: "#003c7f", year: "2025", dates: "2025", location: "New York" },
];
