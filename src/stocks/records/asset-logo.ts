/** Only an explicit security ticker can request a logo; names remain monogram fallbacks. */
export function assetLogoPath(ticker: string | undefined): string {
  const symbol = ticker?.trim().toUpperCase() ?? "";
  return symbol.length <= 15 && /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/.test(symbol) ? `/media/logos/${symbol}` : "";
}
