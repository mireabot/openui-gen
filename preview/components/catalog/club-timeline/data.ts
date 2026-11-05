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
