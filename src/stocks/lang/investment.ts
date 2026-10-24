import type { z } from "zod";
import { ui, type Node, type Ref, type PropsIn } from "../../lang/program.js";
import type { PropsOf } from "../../lang/primitives.js";
import { Expectation } from "../schema.js";

type E = Ref<z.infer<typeof Expectation>>;
type NumericField = "startingValue" | "endingValue" | "change" | "periodRate" | "endUnitPrice" | "unitPrice" | "quantity" | "annualRate" | "months";
type Format = PropsIn<PropsOf<"Number">>["format"];
type Role = PropsIn<PropsOf<"Number">>["role"];
function value(e: E, field: NumericField, format: Format = "currency", role: Role = "title2", signed = false, ink?: PropsIn<PropsOf<"Number">>["ink"]): Node {
  return ui.Number({ value: e[field], format, role, weight: "medium", roll: true, signed, ink: ink ?? null });
}
function metric(e: E, label: string, field: NumericField, format: Format = "currency", hero = false, signed = false, ink?: PropsIn<PropsOf<"Number">>["ink"]): Node {
  return ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: label, role: "footnote", ink: "secondary" }), value(e, field, format, hero ? "title1" : "title2", signed, ink)] });
}
const gain = (e: E) => metric(e, "Gain / loss", "change", "currency", false, true, e.changeInk);
const ending = (e: E) => metric(e, "Ending value", "endingValue");
const outcomes = (e: E) => ui.Grid({ columns: "2", gap: 16, children: [gain(e), ending(e)] });
const horizon = (e: E) => ui.ChoiceTags({ label: "Time horizon", options: e.horizons, value: e.months });
const scenarios = (e: E) => ui.ChoiceTags({ label: "Illustrative annual price return", options: e.alternatives, value: e.annualRate });
const position = (e: E) => ui.Stack({ axis: "v", gap: 8, children: [
  ui.Slider({ label: "Position size", value: e.quantity, min: 0, max: e.maxQuantity, step: 1, unit: "shares" }), metric(e, "Initial investment", "startingValue"), ui.Stack({ axis: "h", gap: 4, children: [ui.Text({ content: "1 share =", role: "footnote", ink: "secondary" }), value(e, "unitPrice", "currency", "footnote"), ui.Text({ content: "· initial price", role: "footnote", ink: "secondary" })] }),
] });
const controls = (e: E) => ui.Stack({ axis: "v", gap: 16, children: [position(e), horizon(e), scenarios(e)] });
const note = (e: E) => ui.Text({ content: e.note, role: "footnote", ink: "secondary" });
const basis = (e: E) => ui.Disclosure({ label: "How this is calculated", children: [ui.Text({ content: e.basis, role: "footnote", ink: "secondary" }), ui.Text({ content: e.priceCaption, role: "footnote", ink: "secondary" })] });
const identity = (e: E) => ui.Stack({ axis: "h", gap: 12, children: [ui.Avatar({ name: e.name, size: 40, image: e.logo }), ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: e.name, role: "headline", weight: "semibold" }), ui.Text({ content: e.ticker, role: "footnote", ink: "secondary" }), ui.Text({ content: e.priceCaption, role: "footnote", ink: "secondary" })] })] });
function contentCard(label: string, children: Node[], supporting: PropsIn<PropsOf<"Text">>["content"]): Node {
  return ui.Card({ children: [ui.Pill({ label }), ui.Stack({ axis: "v", gap: 12, children }), ui.Text({ content: supporting, role: "footnote", ink: "secondary" })] });
}

export function InvestmentExpectation(e: E, variant: "ending" | "narrative" | "scenarios" | "position" | "comparison" | "context"): Node {
  let children: Node[];
  switch (variant) {
    case "ending": children = [identity(e), ui.Card({ children: [metric(e, "Assumed ending value", "endingValue", "currency", true), ui.Grid({ columns: "2", gap: 16, children: [gain(e), metric(e, "Period return", "periodRate", "percent")] }), ui.Stack({ axis: "h", gap: 12, children: [value(e, "startingValue"), ui.Icon({ name: "arrow.right", size: 16 }), value(e, "endingValue")] }), horizon(e)] }), position(e), scenarios(e), note(e)]; break;
    case "narrative": children = [identity(e), ui.Card({ children: [ui.Stack({ axis: "wrap", gap: 4, children: [ui.Text({ content: "With", role: "title1", weight: "medium" }), value(e, "startingValue", "currency", "title1"), ui.Text({ content: "invested, an assumed", role: "title1", weight: "medium" }), value(e, "annualRate", "percent", "title1", true), ui.Text({ content: "annual price return becomes", role: "title1", weight: "medium" }), value(e, "change", "currency", "title1", true, e.changeInk), ui.Text({ content: "over", role: "title1", weight: "medium" }), value(e, "months", "integer", "title1"), ui.Text({ content: "months.", role: "title1", weight: "medium" })] }), ui.Divider({}), metric(e, "You would end with", "endingValue"), note(e)] }), controls(e)]; break;
    case "scenarios": children = [identity(e), position(e), horizon(e), ui.Card({ children: [ui.ChoiceTags({ label: "Tap a scenario · illustrative annual assumptions", options: e.alternatives, value: e.annualRate, style: "rows" }), ui.Divider({}), note(e)] })]; break;
    case "position": children = [identity(e), position(e), ui.Card({ children: [metric(e, "Shares in your position", "quantity", "integer", true), ui.Text({ content: "Whole shares at the initial price", role: "footnote", ink: "secondary" }), ui.Divider({}), ui.Grid({ columns: "2", gap: 16, children: [metric(e, "Initial price", "unitPrice"), metric(e, "Assumed future price", "endUnitPrice")] }), outcomes(e), note(e)] }), horizon(e), scenarios(e)]; break;
    case "comparison": children = [identity(e), controls(e), ui.Card({ children: [ui.Grid({ columns: "2", gap: 16, children: [ui.Stack({ axis: "v", gap: 12, children: [ui.Pill({ label: "Stock scenario" }), ending(e), gain(e)] }), ui.Stack({ axis: "v", gap: 12, children: [ui.Pill({ label: "Cash · 0%" }), metric(e, "Ending value", "startingValue"), ui.Text({ content: "$0.00 interest", role: "body" })] })] }), ui.Divider({}), ui.Text({ content: "Cash assumes zero interest. The stock path includes market loss risk. Cash interest, fees, tax and dividends are excluded.", role: "footnote", ink: "secondary" })] })]; break;
    case "context": children = [identity(e), contentCard("1 · Holding-period scenario", [outcomes(e), horizon(e), scenarios(e)], "Illustrative annual assumption, compounded over your horizon."), contentCard("2 · DCF valuation", [ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: e.dcfLabel, role: "footnote", ink: "secondary" }), ui.Text({ content: e.dcfValue, role: "title2", weight: "medium" })] })], e.dcfNote), contentCard("3 · Piotroski strength", [ui.Stack({ axis: "v", gap: 4, children: [ui.Text({ content: e.strengthLabel, role: "footnote", ink: "secondary" }), ui.Text({ content: e.strengthValue, role: "title2", weight: "medium" })] })], e.strengthNote), position(e)]; break;
  }
  return ui.Calculation({ values: e, children: [...children, basis(e)] });
}
