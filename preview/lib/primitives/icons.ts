/**
 * Web preview stand-ins for SF Symbols. The DSL names SF Symbols (canonical; validated by the
 * backend), but SF glyphs may only be shown on Apple platforms, so the web preview draws the
 * closest Phosphor glyph. `.fill` maps to Phosphor's fill weight.
 */
const MAP: Record<string, string> = {
  "chevron.right": "CaretRight", "chevron.left": "CaretLeft", "chevron.down": "CaretDown", "chevron.up": "CaretUp",
  "xmark": "X", "plus": "Plus", "minus": "Minus", "checkmark": "Check", "ellipsis": "DotsThree",
  "magnifyingglass": "MagnifyingGlass", "gearshape": "Gear", "gear": "Gear", "bell": "Bell", "house": "House",
  "person": "User", "person.2": "Users", "person.crop.circle": "UserCircle", "heart": "Heart", "star": "Star",
  "bookmark": "BookmarkSimple", "tag": "Tag", "calendar": "CalendarBlank", "clock": "Clock", "timer": "Timer",
  "chart.bar": "ChartBar", "chart.line.uptrend.xyaxis": "ChartLineUp", "chart.pie": "ChartPie",
  "arrow.up.right": "ArrowUpRight", "arrow.down.left": "ArrowDownLeft", "arrow.down.right": "ArrowDownRight", "arrow.up": "ArrowUp", "arrow.down": "ArrowDown",
  "arrow.left.arrow.right": "ArrowsLeftRight", "square.and.arrow.up": "Export", "doc.on.doc": "Copy",
  "creditcard": "CreditCard", "banknote": "Money", "dollarsign.circle": "CurrencyCircleDollar", "cart": "ShoppingCart",
  "lock": "Lock", "lock.open": "LockOpen", "snowflake": "Snowflake", "wallet.pass": "Wallet", "map": "MapTrifold",
  "mappin": "MapPin", "location": "NavigationArrow", "phone": "Phone", "envelope": "Envelope", "globe": "Globe",
  "link": "Link", "photo": "Image", "camera": "Camera", "play": "Play", "pause": "Pause", "film": "FilmStrip",
  "bed.double": "Bed", "moon": "Moon", "sun.max": "Sun", "flame": "Flame", "drop": "Drop", "fork.knife": "ForkKnife",
  "figure.run": "PersonSimpleRun", "heart.text.square": "Heartbeat", "bolt": "Lightning", "sparkles": "Sparkle",
  "bandage": "Bandaids", "soccerball": "SoccerBall", "figure.soccer": "SoccerBall", "basketball": "Basketball", "football": "Football",
  "info.circle": "Info", "exclamationmark.triangle": "Warning", "checkmark.circle": "CheckCircle", "xmark.circle": "XCircle",
  "qrcode": "QrCode", "faceid": "Scan", "slider.horizontal.3": "Sliders", "line.3.horizontal.decrease": "Funnel",
};

/** Phosphor component name and weight for an SF Symbols name. */
export function phosphorFor(sf: string): { name: string; weight: "regular" | "fill" } {
  const fill = /\.fill(\.|$)/.test(sf);
  const base = sf.replace(/\.fill(?=\.|$)/g, "").replace(/\.circle$|\.square$/, (m) => (MAP[sf.replace(/\.fill/g, "")] ? m : ""));
  const name = MAP[sf.replace(/\.fill/g, "")] ?? MAP[base] ?? base.split(".")[0]!.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
  return { name, weight: fill ? "fill" : "regular" };
}
