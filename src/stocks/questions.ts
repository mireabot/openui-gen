import { OpenRouter } from "@openrouter/sdk";
import { z } from "zod";
import { config, requireKey } from "../config.js";
import type { QuestionId } from "../lang/compiler.js";
import { anthropicSender, usesAnthropic } from "../llm/anthropic.js";
import type { UsageReport } from "../run/recorder.js";
import { structuredCompletion, structuredParameters } from "../llm/structured-completion.js";
import { LOOKUPS, LOOKUP_KINDS, SubjectSchema, type Lookup, type Question, type Subject } from "./answers.js";
import { MEASURES } from "./quarters.js";

/**
 * The planner: Haiku reads the whole request once and breaks it into independent questions, each
 * routed to the lookup that answers it. There are no topic flags and no regex backstops; the
 * questions are the only reading of intent, and every later stage works from them.
 */

const LookupSchema = z.union(LOOKUP_KINDS.map(kind => LOOKUPS[kind].args.extend({ kind: z.literal(kind) })) as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]);
const PlanSchema = z.object({
  subject: SubjectSchema,
  // `answer` is written before `lookup`: naming what the answer is made of keeps the route honest.
  questions: z.array(z.object({ text: z.string().min(1).max(600), answer: z.string().min(1).max(200), lookup: LookupSchema }).strict()).min(1).max(8),
}).strict();
const PLAN_JSON_SCHEMA = z.toJSONSchema(PlanSchema, { target: "draft-2020-12" }) as Record<string, unknown>;

const PLAN_SYSTEM = `Plan the research for a request about US securities, companies or grouped assets.

questions: break the request into every independent question it asks, in the user's reading order, so nothing they asked for is dropped. Each runs as its own lookup, in parallel.
- text: the question in the user's own terms, keeping every period, count, measure and comparison they named ("Nike's last 8 quarterly reports: revenue, EPS and gross margin against analyst expectations"). It must make sense on its own.
- answer: what the answer is made of, in a few words ("8 rows of reported figures", "quotes from earnings calls", "analyst rating split").
- lookup: how to answer it. Prefer a structured lookup when it fully answers the question; use web for anything else, and split a request across lookups when parts need different ones (quarterly figures from quarters, management commentary from web).
${LOOKUP_KINDS.map(kind => `  ${kind}: ${LOOKUPS[kind].describe}`).join("\n")}
- quarters.measures: ${Object.entries(MEASURES).map(([key, m]) => `${key} (${m.label})`).join(", ")}. periods: how many quarters (default 4 when unnamed).
- web.searchQueries: 2-3 short keyword searches.
- stats.metrics: the statistics in plain words, in the user's order.
- peers.limit: an explicit count ("top 3 competitors"), else null.
- etfHolders.etfTickers: ETFs the user names for a membership check ("Is AAPL in ARKK?"); [] otherwise; never guess.
- benchmark.ticker: the one ticker the subject's price is compared with ("vs SPY", "against AMD"). A list of competitors is peers, not a benchmark.
- expectation: the position the user describes (shares, entry price, months, annual rate), null where not stated.
Route by what the answer is made of, never by the nearest topic word. web: management commentary, guidance narrative, reasons a stock moved, explanations of surprises, market share, competitive position, comparisons across companies, bull and bear arguments. consensus: only the current analyst rating split and price targets. quarters: figures per quarter.
Prices and price charts are always on screen from market data and are never a question. A request about price alone has one question: stats with ["Price", "Day range", "Volume"].

subject: ticker is the US ticker in capitals ("nvidia" → NVDA, "google" → GOOGL); name is the full name as it trades ("NIKE, Inc."). kind is ETF, Fund, Bond fund, Index or Theme for a grouped asset ("inside SMH", a fund's holdings), with tickers the requested groups (up to six); null and [] for a company. "Info about NBIS - ETFs it allocated" is the company NBIS with an etfHolders question. range: the price period asked about (1W, 1M, 3M, 6M, 1Y, YTD), else null.`;

let client: OpenRouter | undefined;

/** A typed ticker wins over the model's reading. */
export function tickerIn(prompt: string): string | null {
  const dollar = /\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/.exec(prompt);
  if (dollar) return dollar[1]!.toUpperCase();
  const NOT = new Set(["I", "A", "US", "USA", "AI", "CEO", "ETF", "IPO", "VS", "EPS", "PE", "YTD", "UK", "EU", "ETFS", "FUNDS", "BONDS", "BOND", "FUND", "NAV"]);
  return prompt.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)?.find(w => !NOT.has(w)) ?? null;
}

export interface Plan { readonly subject: Subject; readonly questions: readonly Question[] }

export function parsePlan(text: string, prompt: string, first = 1): Plan {
  const plan = PlanSchema.parse(JSON.parse(text));
  const typed = tickerIn(prompt);
  return {
    subject: { ...plan.subject, ticker: typed && !plan.subject.kind ? typed : plan.subject.ticker },
    questions: plan.questions.map((q, i) => ({ id: `q${first + i}` as QuestionId, text: q.text, lookup: q.lookup as unknown as Lookup })),
  };
}

export async function planQuestions(prompt: string, usage?: (report: UsageReport) => void): Promise<Plan> {
  const model = config().OPENROUTER_SUMMARY_MODEL;
  client ??= new OpenRouter({ apiKey: requireKey("OPENROUTER_API_KEY"), appTitle: "openui-gen" });
  const result = await structuredCompletion({
    stage: "summarize",
    request: {
      model, stream: false, maxTokens: 4_000, ...structuredParameters(model),
      responseFormat: { type: "json_schema", jsonSchema: { name: "stocks_questions", strict: true, schema: PLAN_JSON_SCHEMA } },
      messages: [{ role: "system", content: PLAN_SYSTEM }, { role: "user", content: prompt }],
    },
    send: usesAnthropic() ? anthropicSender(config().ANTHROPIC_SUMMARY_MODEL) : chatRequest => client!.chat.send({ chatRequest }),
    parse: text => parsePlan(text, prompt),
    hooks: { usage: ({ model: m, usage: u, attempt, ms }) => usage?.({ stage: "summarize", engine: "llm", model: m, attempt, inputTokens: u.promptTokens, outputTokens: u.completionTokens, costUSD: u.costUSD ?? 0, ms }) },
  });
  return result.value;
}

const FollowUpSchema = z.object({
  /** The follow-up rewritten as a standalone request. */
  request: z.string().min(1).max(600),
  /** New or revised questions; `replaces` names the saved question a revision supersedes. */
  questions: z.array(z.object({ replaces: z.string().regex(/^q\d+$/).nullable(), text: z.string().min(1).max(600), answer: z.string().min(1).max(200), lookup: LookupSchema }).strict()).max(6),
  /** Revise only how saved answers are shown: parts the writer may rewrite without new data. */
  restyle: z.array(z.string().regex(/^pick\d+$/)).max(12),
  removeParts: z.array(z.string().regex(/^pick\d+$/)).max(12),
}).strict();
const FOLLOW_UP_JSON_SCHEMA = z.toJSONSchema(FollowUpSchema, { target: "draft-2020-12" }) as Record<string, unknown>;

export interface FollowUpPlan {
  readonly request: string;
  /** Questions to answer now, with fresh ids; `replaces` is the saved question each supersedes. */
  readonly questions: readonly (Question & { readonly replaces: QuestionId | null })[];
  readonly restyle: readonly string[];
  readonly removeParts: readonly string[];
}

/**
 * A follow-up against a saved screen: which saved questions to revise, which to add, which parts only
 * change presentation, and which to remove. Everything not named stays exactly as it is.
 */
export async function planFollowUp(input: { prompt: string; subject: Subject; questions: readonly { id: string; text: string; lookup: unknown }[]; parts: readonly { id: string; block?: string; questions?: readonly string[] | undefined; statements?: Readonly<Record<string, string>> }[]; targets?: readonly string[] | undefined; turns: readonly { role: string; content: string }[] }, usage?: (report: UsageReport) => void): Promise<FollowUpPlan> {
  const model = config().OPENROUTER_SUMMARY_MODEL;
  client ??= new OpenRouter({ apiKey: requireKey("OPENROUTER_API_KEY"), appTitle: "openui-gen" });
  // Parts in screen order (top to bottom), each with the copy it shows first, so "the chart at the bottom" can be resolved.
  const looks = (part: (typeof input.parts)[number]) => [...Object.values(part.statements ?? {}).join("\n").matchAll(/"((?:[^"\\]|\\.){3,80})"/g)].map(m => m[1]!).filter(text => !/^(?:v|h|wrap|body|headline|footnote|title\d|semibold|medium|secondary|tertiary|card|container|control|center|start|end|between|warn|neutral|stocks_dataset|[a-z]+\.[a-z.]+)$/.test(text)).slice(0, 3);
  const reads = (part: (typeof input.parts)[number]) => [...new Set([...Object.values(part.statements ?? {}).join("\n").matchAll(/\bd\.answers\.q\d+(?:\.[A-Za-z]+){0,2}/g)].map(m => m[0]))].slice(0, 4);
  const saved = JSON.stringify({ subject: input.subject, questions: input.questions, parts: input.parts.map((p, i) => ({ id: p.id, position: i + 1, made: p.block === "fallback" ? "server default" : "composed", shows: p.questions ?? [], looks: looks(p), reads: reads(p) })), ...(input.targets?.length ? { targets: input.targets } : {}) });
  const first = Math.max(0, ...input.questions.map(q => Number(q.id.slice(1)))) + 1;
  const result = await structuredCompletion({
    stage: "summarize",
    request: {
      model, stream: false, maxTokens: 4_000, ...structuredParameters(model),
      responseFormat: { type: "json_schema", jsonSchema: { name: "stocks_follow_up", strict: true, schema: FOLLOW_UP_JSON_SCHEMA } },
      messages: [{ role: "system", content: `${PLAN_SYSTEM}

This is a follow-up to a saved screen about the same subject. Change only what the user asks; everything else stays as it is.
questions: only questions that need new data. A question that changes a saved one (another period, more measures, a different comparison) sets replaces to the saved question's id; a new topic sets replaces null. [] when the follow-up only changes presentation.
restyle: parts whose presentation changes without new data ("show it as a chart", "make it shorter"). When targets are given, change only those parts.
removeParts: parts the user asks to drop. Use position, made, looks and reads to find them: "repeated" parts read the same data as an earlier part.
request: the follow-up as a standalone request, including the subject.` },
        ...input.turns.slice(-8).map(turn => ({ role: turn.role === "assistant" ? "assistant" as const : "user" as const, content: turn.content })),
        { role: "user", content: `Saved screen: ${saved}\n\nFollow-up: ${input.prompt}` }],
    },
    send: usesAnthropic() ? anthropicSender(config().ANTHROPIC_SUMMARY_MODEL) : chatRequest => client!.chat.send({ chatRequest }),
    parse: text => {
      const plan = FollowUpSchema.parse(JSON.parse(text));
      const known = new Set(input.questions.map(q => q.id));
      const parts = new Set(input.parts.map(p => p.id));
      const inTargets = (id: string) => !input.targets?.length || input.targets.some(t => t === id || t.startsWith(`${id}_`) || t.startsWith(`${id}/`));
      return {
        request: plan.request,
        questions: plan.questions.map((q, i) => ({ id: `q${first + i}` as QuestionId, text: q.text, lookup: q.lookup as unknown as Lookup, replaces: q.replaces && known.has(q.replaces) ? q.replaces as QuestionId : null })),
        restyle: plan.restyle.filter(id => parts.has(id) && inTargets(id)),
        removeParts: plan.removeParts.filter(id => parts.has(id) && inTargets(id)),
      };
    },
    hooks: { usage: ({ model: m, usage: u, attempt, ms }) => usage?.({ stage: "summarize", engine: "llm", model: m, attempt, inputTokens: u.promptTokens, outputTokens: u.completionTokens, costUSD: u.costUSD ?? 0, ms }) },
  });
  return result.value;
}
