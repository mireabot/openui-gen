import type { MockValue } from "../../research/dataset-schema.js";
import { calculatedGrowth } from "../../primitives/growth.js";
import { assetLogoPath } from "./asset-logo.js";

export interface ExpectationInput {
  name: string; ticker: string; initialPrice: number | null; volume: number | null; months?: number; annualRate?: number; priceCaption?: string;
  dcf?: { label: string; value: string; note: string }; strength?: { label: string; value: string; note: string };
}
/** The record contains an explicit price/position and labelled assumptions, never a fabricated target. */
export function expectationRecord(input: ExpectationInput): Record<string, MockValue> {
  const months = input.months ?? 3, annualRate = input.annualRate ?? 12;
  const alternatives = [{ label: "Bear −20%", value: -20, icon: "chart.line.downtrend.xyaxis", detail: "", trailing: "" }, { label: "Base +12%", value: 12, icon: "minus", detail: "", trailing: "" }, { label: "Bull +30%", value: 30, icon: "chart.line.uptrend.xyaxis", detail: "", trailing: "" }];
  if (Number.isFinite(annualRate) && !alternatives.some(s => s.value === annualRate)) alternatives.push({ label: `Your assumption ${annualRate}%`, value: annualRate, icon: "person", detail: "", trailing: "" });
  const horizons = [1, 3, 6];
  if (Number.isFinite(months) && months > 0 && !horizons.includes(months)) horizons.push(months);
  return calculatedGrowth({
    name: input.name, ticker: input.ticker, logo: assetLogoPath(input.ticker), unitPrice: input.initialPrice, quantity: input.volume, months, annualRate,
    maxQuantity: Math.max(100, input.volume !== null && Number.isSafeInteger(input.volume) && input.volume >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, input.volume * 2) : 100),
    priceCaption: input.priceCaption ?? "Initial price supplied with this position",
    note: "Illustrative price scenarios, not a forecast. Excludes dividends, fees and tax. Whole shares at the initial price.",
    basis: "Period return = (1 + annual return / 100)^(months / 12) − 1. Initial investment = initial price × whole shares. Ending value = initial investment × (1 + period return). Rates are assumptions with no assigned likelihood. DCF is long-term valuation context; Piotroski measures financial health. Neither forecasts a short-run return.",
    horizons: horizons.map(value => ({ label: `${value} ${value === 1 ? "month" : "months"}`, value, icon: "calendar", detail: "", trailing: "" })), alternatives,
    dcfLabel: input.dcf?.label ?? "Intrinsic value", dcfValue: input.dcf?.value ?? "Not sourced", dcfNote: input.dcf?.note ?? "Needs dated financial statements and explicit growth / WACC inputs. Long-term valuation context.",
    strengthLabel: input.strength?.label ?? "Financial-health score", strengthValue: input.strength?.value ?? "Not sourced", strengthNote: input.strength?.note ?? "Needs nine financial criteria; independent of the assumed return.",
  }) as Record<string, MockValue>;
}
