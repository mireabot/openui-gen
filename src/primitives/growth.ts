/** The same deterministic calculation is used by the server and web. Rates are assumptions. */
export interface GrowthInputs { unitPrice: number | null; quantity: number | null; months: number | null; annualRate: number | null }
export function growthValues(input: GrowthInputs, model = "compound-growth") {
  const { unitPrice: price, quantity, months, annualRate: rate } = input;
  const valid = price !== null && Number.isFinite(price) && price > 0 && quantity !== null && Number.isSafeInteger(quantity) && quantity >= 0 && months !== null && Number.isFinite(months) && months > 0 && rate !== null && Number.isFinite(rate) && rate >= -100;
  const startingValue = valid ? price * quantity : null;
  const factor = valid ? model === "simple-growth" ? 1 + rate / 100 * months / 12 : (1 + rate / 100) ** (months / 12) : null;
  const endingValue = startingValue !== null && factor !== null ? startingValue * factor : null;
  const endUnitPrice = valid && factor !== null ? price * factor : null;
  if (endingValue === null || !Number.isFinite(endingValue) || endUnitPrice === null || !Number.isFinite(endUnitPrice) || factor === null || factor < 0) return { startingValue: null, endingValue: null, change: null, periodRate: null, endUnitPrice: null, valid: false, changeInk: "secondary" };
  const change = endingValue - startingValue!;
  return { startingValue, endingValue, change, periodRate: (factor - 1) * 100, endUnitPrice, valid: true, changeInk: change < 0 ? "orange" : change > 0 ? "green" : "secondary" };
}

export interface ChoiceOption { label: string; value: number; icon: string; detail?: string; trailing?: string }
/** Optional alternatives are recalculated together; their rates never become probabilities. */
export function calculatedGrowth(record: Record<string, unknown>, model = "compound-growth") {
  const input: GrowthInputs = { unitPrice: numeric(record.unitPrice), quantity: numeric(record.quantity), months: numeric(record.months), annualRate: numeric(record.annualRate) };
  const result = growthValues(input, model);
  const alternatives = Array.isArray(record.alternatives) ? record.alternatives.map(raw => {
    const option = raw as ChoiceOption;
    const r = growthValues({ ...input, annualRate: option.value }, model);
    return { ...option, detail: r.endingValue === null ? "Unavailable" : `${money(r.endingValue)} ending value`, trailing: r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${money(r.change)}`, ...r };
  }) : [];
  return { ...record, ...result, alternatives };
}
function numeric(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
