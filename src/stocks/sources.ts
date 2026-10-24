/**
 * Trusted sources for stocks research, searched first (src/interface/parallel-research.ts
 * `preferDomains`). Yahoo Finance leads; then market data and filings, financial news, ETF data,
 * and the largest ETF issuers' own holdings pages. Other pages still count, ranked after these.
 */
export const STOCKS_PREFERRED_SOURCES: readonly string[] = [
  "finance.yahoo.com",
  // Market data and filings
  "morningstar.com", "nasdaq.com", "sec.gov", "marketwatch.com", "investing.com",
  // Financial news
  "reuters.com", "cnbc.com", "wsj.com", "bloomberg.com", "barrons.com",
  // ETF data
  "etf.com", "etfdb.com",
  // 13F holders: which funds own a stock and its share of their portfolios
  "13f.info", "whalewisdom.com", "fintel.io", "hedgefollow.com", "dataroma.com", "financecharts.com",
  // ETF issuers
  "ishares.com", "vanguard.com", "ssga.com", "invesco.com", "schwabassetmanagement.com", "ark-funds.com", "globalxetfs.com",
];
