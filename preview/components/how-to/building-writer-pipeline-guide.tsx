"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "@/app/how-to/how-to.module.css";
import { AgentBody, AgentView, ForAgentsButton } from "./agent-view";
import { GuideSelect } from "./guide-parts";

const ASK = "src/sports/ask.ts";
const COMPILER = "src/lang/compiler.ts";
const SCREEN = "src/sports/screen.ts";
const COMPONENTS = "src/sports/components.ts";
const PROBE = "scripts/check-writer-relevance.ts";

function Source({ file, line, children }: { file: string; line: number; children: ReactNode }) {
  return <span className={styles.workingSource}>{children}<code>{file}:{line}</code></span>;
}

function Connector({ label }: { label: string }) {
  return <div className={styles.verticalConnector}><span>{label}</span><i>↓</i></div>;
}

const pad = (n: number) => String(n).padStart(2, "0");

// 01 ---------------------------------------------------------------- follow one statement

const stages = [
  { name: "Messages", overline: "PROMPT", node: "System turn + user turn", detail: "Rules · signatures · tokens · templates · request · briefing", title: "writerMessages builds two turns.", text: "The system turn holds the rules, the primitive signatures, the token values and the sports templates. The user turn holds the required question ids, the request and the briefing.", note: "The system turn is the same for every screen, so it stays one cache entry. Everything that varies goes in the user turn.", file: COMPILER, line: 663 },
  { name: "Reasoning", overline: "WRITER", node: "One component per fact group", detail: "Subject · facts · time scope · comparison", title: "The writer picks a component, then checks itself.", text: "The prompt tells the writer to choose by meaning, using each component's useWhen. A data-shape match only identifies a candidate. Before it answers, the writer runs a silent check against the original request.", note: "Reasoning is prompt only. The compiler cannot tell a valid call to the wrong component from a valid call to the right one.", file: COMPILER, line: 677 },
  { name: "Stream", overline: "COMPILER", node: "StatementStream", detail: "Split at newlines outside brackets and strings", title: "The stream is split into statements.", text: "Each statement is admitted as soon as its line closes. The writer does not have to finish before the first part reaches the client.", note: "A statement that never closes reaches admit at the end of the stream and fails as an incomplete statement.", file: COMPILER, line: 695 },
  { name: "Gate", overline: "COMPILER", node: "admit → validate", detail: "Name · parse · refuses · expand · nodes · limits", title: "Each statement passes the gate or is rejected.", text: "admit checks the name, parses the statement and validates every node against the primitive library. A rejected statement is recorded under the writer's own name, so repair can quote it back.", note: "The first check that fails stops the statement. Admitted statements are never revised.", file: COMPILER, line: 251 },
  { name: "Coverage", overline: "COMPILER", node: "Reads → questions", detail: "A part shows q1 when it reads q1's content", title: "Coverage comes from reads, not claims.", text: "The compiler collects the dataset paths each finished part reads and groups them by question. shows decides whether those reads count as showing the answer.", note: "Reading only title, status or source names an answer. It does not show it.", file: SCREEN, line: 22 },
  { name: "Repair", overline: "SECOND REQUEST", node: "One repair round", detail: "Unfinished parts · questions not shown · rejected statements", title: "The writer gets one chance to fix it.", text: "If anything is open, the compiler appends one user turn to the same messages. It lists exactly what is missing and quotes each rejected statement with its problems.", note: "Repair asks only for missing statements. It runs once.", file: COMPILER, line: 174 },
  { name: "Fallback", overline: "SERVER", node: "Default parts", detail: "Built from the answer's shape, no model call", title: "The server fills what is still missing.", text: "finish drops unfinished parts and adds a default part for each required question that is still not shown. The screen always shows every question.", note: "The default part uses the first fitting component. It does not apply the writer's relevance rules.", file: COMPILER, line: 319 },
] as const;

function Walkthrough() {
  const [step, setStep] = useState(0);
  const current = stages[step]!;
  return <section id="walkthrough" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>01 / FOLLOW ONE STATEMENT</span><h2>From prompt to screen.</h2></div><span className={styles.quiet}>Add one stage at a time</span></div>
    <div className={styles.walkthrough}>
      <div className={styles.stepper} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>{stages.map((stage, index) => <button key={stage.name} type="button" data-active={step === index} data-done={index < step} onClick={() => setStep(index)}><span>{pad(index + 1)}</span>{stage.name}</button>)}</div>
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene}>
          {stages.slice(0, step + 1).map((stage, index) => <div key={stage.name}>
            {index > 0 && <Connector label={["", "Sent together", "Streamed text", "Each statement", "Finished parts", "Gaps found", "Still not shown"][index]!} />}
            {stage.name === "Reasoning"
              ? <div className={styles.writerNode}><span>Writer</span><code>label = Component(d.answers.q1.record)</code><small>{stage.detail}</small></div>
              : <div className={styles.datasetNode}><span className={styles.nodeOverline}>{stage.overline}</span><strong>{stage.node}</strong><span>{stage.detail}</span></div>}
          </div>)}
        </div>
        <aside className={styles.stageAnnotation}><span className={styles.annotationNumber}>{pad(step + 1)}</span><h3>{current.title}</h3><p>{current.text}</p><div className={styles.annotationNote}>{current.note}</div><Source file={current.file} line={current.line}>Read this in the code</Source></aside>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>The compiler validates the contract. The writer owns relevance.</span><div className={styles.stageControls}><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button><button type="button" className={styles.primaryButton} onClick={() => setStep(step === stages.length - 1 ? 0 : step + 1)}>{step === stages.length - 1 ? "Start again ↺" : "Add the next stage →"}</button></div></div>
    </div>
  </section>;
}

// 02 ---------------------------------------------------------------- writer reasoning

interface Candidate { readonly key: string; readonly component: string | null; readonly verdict: "selected" | "rejected" | "no component"; readonly reason: string }
interface Case {
  readonly id: string;
  readonly request: string;
  readonly checks: readonly (readonly [string, string])[];
  readonly candidates: readonly Candidate[];
  readonly statement: string;
  readonly reads: string;
  readonly avoids: string;
}

const cases: readonly Case[] = [
  { id: "player-performance", request: "Show only Egor Demin's individual key statistics from his latest game.",
    checks: [["Subject", "One player, Egor Demin"], ["Facts", "His key statistics"], ["Time scope", "One game, the latest"], ["Subjects compared", "None"]],
    candidates: [
      { key: "game", component: "MatchCard", verdict: "rejected", reason: "MatchCard: \"not a specific player's performance (StatsCard)\". The request does not ask for the result." },
      { key: "player", component: "StatsCard", verdict: "selected", reason: "StatsCard: \"one identified player's or club's statistics for one game or season, including a specific player's latest-game performance\"." },
    ], statement: "demin = StatsCard(d.answers.q1.player)", reads: "player.stats", avoids: "game" },
  { id: "current-team", request: "Where does Egor Demin play now? Name his current team only.",
    checks: [["Subject", "One player, Egor Demin"], ["Facts", "His current team"], ["Time scope", "Now"], ["Subjects compared", "None"]],
    candidates: [
      { key: "profile", component: null, verdict: "no component", reason: "The profile has the team as a plain field. No component expresses one name." },
      { key: "career", component: "ClubTimeline", verdict: "rejected", reason: "ClubTimeline: \"not a current-club-only question\"." },
      { key: "upcoming", component: "MatchCard", verdict: "rejected", reason: "MatchCard: \"not ... current club or career, even when match data is also supplied\"." },
    ], statement: "team = Text(d.answers.q1.profile.team, \"headline\", \"semibold\")", reads: "profile.team", avoids: "career, upcoming" },
  { id: "season-comparison", request: "Compare Egor Demin's points per game this season versus last season, including games played.",
    checks: [["Subject", "One player, Egor Demin"], ["Facts", "Points per game, games played"], ["Time scope", "Two seasons"], ["Subjects compared", "This season against last"]],
    candidates: [
      { key: "comparison", component: "MetricBars", verdict: "selected", reason: "MetricBars: \"one figure compared across players, clubs or seasons ... points per game this season vs last\"." },
      { key: "player", component: "StatsCard", verdict: "rejected", reason: "StatsCard: \"not ... comparisons across subjects or seasons (MetricBars)\"." },
    ], statement: "ppg = MetricBars(d.answers.q1.comparison)", reads: "comparison.columns", avoids: "player" },
  { id: "player-periods", request: "Show Cole Palmer's goals, assists and chances created by matchweek through this season.",
    checks: [["Subject", "One player, Cole Palmer"], ["Facts", "Goals, assists, chances created"], ["Time scope", "Each matchweek of one season"], ["Subjects compared", "None"]],
    candidates: [
      { key: "progression", component: "PlayerMetrics", verdict: "selected", reason: "PlayerMetrics: \"one player's numbers within a season, period by period: goals, assists and chances by matchweek\"." },
      { key: "totals", component: "StatsCard", verdict: "rejected", reason: "StatsCard: \"not ... period-by-period progression (PlayerMetrics)\"." },
    ], statement: "palmer = PlayerMetrics(d.answers.q1.progression)", reads: "progression.metrics", avoids: "totals" },
  { id: "ranked-list", request: "Who are the top three Premier League goalscorers? Show their ranked order.",
    checks: [["Subject", "Premier League scorers"], ["Facts", "Goals, in rank order"], ["Time scope", "This season"], ["Subjects compared", "No. The order is the answer"]],
    candidates: [
      { key: "ranking", component: "Leaderboard", verdict: "selected", reason: "Leaderboard: \"a plain ranked list of at most 10, where the order is the answer\"." },
      { key: "comparison", component: "MetricBars", verdict: "rejected", reason: "MetricBars is for \"whenever the request asks to compare them\". This request asks for order." },
    ], statement: "scorers = Leaderboard(d.answers.q1.ranking)", reads: "ranking.entries", avoids: "comparison" },
  { id: "custom-honours", request: "List the supplied honours with their years. Keep it compact.",
    checks: [["Subject", "One player's honours"], ["Facts", "Name and year of each"], ["Time scope", "Career"], ["Subjects compared", "None"]],
    candidates: [
      { key: "honours", component: null, verdict: "no component", reason: "No component contract fits a list of names and years. The briefing says: none; compose requested content from primitives." },
    ], statement: "honours = Stack(\"v\", 16, [@Each(d.answers.q1.honours, \"x\",\n  Stack(\"h\", 12, [Icon(\"trophy.fill\", 24, \"yellow\"), Stack(\"v\", 0, [\n    Text(x.name, \"body\", null, null, 2),\n    Text(x.year, \"body\", null, \"secondary\")\n  ])], \"start\")\n)])", reads: "honours", avoids: "nothing else is supplied" },
];

function Reasoning() {
  const [selected, setSelected] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = cases[selected]!;
  const choose = (index: number) => { setSelected(index); setRevealed(false); };
  return <section id="reasoning" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>02 / WRITE THE REASONING INTO THE PROMPT</span><h2>Shape finds candidates. Meaning picks one.</h2></div><span className={styles.quiet}>{cases.length} probe cases</span></div>
    <p className={styles.sectionIntro}>placements matches records against component contracts, so the briefing lists every candidate whose shape fits. The writer reads the request first, then keeps the candidate whose useWhen answers it. These are the contrast cases from the relevance probe: each one supplies a fitting record the request did not ask for.</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <label className={styles.selectLabel}>Probe <GuideSelect value={selected} onChange={event => choose(Number(event.target.value))}>{cases.map((c, i) => <option key={c.id} value={i}>{c.id}</option>)}</GuideSelect></label>
        <span className={styles.labelPill}>Prompt only · verified by probe:writer</span>
      </div>
      <div className={styles.searchScene}>
        <div className={styles.datasetNode}><span className={styles.nodeOverline}>REQUEST</span><strong>{item.request}</strong><span>Records supplied: {item.candidates.map(c => c.key).join(", ")}</span></div>
        <Connector label="Read the request first" />
        <div className={styles.twoColumns}>{item.checks.map(([label, value]) => <div key={label} className={styles.branchNode}><span className={styles.nodeOverline}>{label.toUpperCase()}</span><strong>{value}</strong></div>)}</div>
        <Connector label={revealed ? "Compared with each useWhen" : "Data-shape candidates, not yet judged"} />
        <div className={styles.twoColumns}>{item.candidates.map(candidate => <div key={candidate.key} className={styles.branchNode} data-failed={revealed && candidate.verdict === "rejected"}>
          <span className={styles.nodeOverline}>d.answers.q1.{candidate.key}</span>
          <strong>{candidate.component ?? "No component fits"}{revealed ? ` · ${candidate.verdict}` : ""}</strong>
          <p>{revealed ? candidate.reason : candidate.component ? "The record fits this component's contract." : "The record fits no contract."}</p>
        </div>)}</div>
        {revealed && <><Connector label="Selected" /><div className={styles.branchNode}><span className={styles.nodeOverline}>STATEMENT</span><pre className={styles.branchCode}><code>{item.statement}</code></pre><strong>The probe checks the reads</strong><p>Must read {item.reads}. Must not read {item.avoids}.</p></div></>}
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>{pad(selected + 1)} of {pad(cases.length)}</span><div className={styles.stageControls}>{revealed
        ? <button type="button" className={styles.primaryButton} onClick={() => choose((selected + 1) % cases.length)}>{selected === cases.length - 1 ? "Start again ↺" : "Next probe →"}</button>
        : <button type="button" className={styles.primaryButton} onClick={() => setRevealed(true)}>Judge the candidates →</button>}</div></div>
    </div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>The silent check runs before the writer answers.</strong><p>The selected components answer the original request. Every requested available fact is visible. Unrelated context is omitted. Every referenced sub-statement is defined and reachable. To change a decision, edit the useWhen in components.ts and name the neighbour it is not.</p></div></div>
    <Source file={COMPILER} line={678}>Silent check</Source><Source file={COMPONENTS} line={945}>placements</Source><Source file={SCREEN} line={107}>Briefing candidates</Source>
  </section>;
}

// 03 ---------------------------------------------------------------- validate each statement

const checkOrder = ["parseName", "parseStatement", "refuses", "expand", "nodes", "limits"] as const;

const statements: readonly { readonly title: string; readonly text: string; readonly stops: (typeof checkOrder)[number]; readonly code: string; readonly message: string; readonly fix: string; readonly note: string }[] = [
  { title: "A record built inside a call", text: "stats = MetricBars({ columns: [] })", stops: "expand", code: "template", message: "MetricBars takes a data reference first (d.<path> or an @Each item)", fix: "stats = MetricBars(d.answers.q1.comparison)", note: "The failure from the full Demin rerun. Dataset shaping timed out and the writer built records itself. Component calls take only data references." },
  { title: "A component that does not exist", text: "stats = Chart(d.answers.q1.comparison)", stops: "expand", code: "template", message: "Chart is neither a primitive nor a template", fix: "stats = MetricBars(d.answers.q1.comparison)", note: "Only writer primitives and the sports components are callable." },
  { title: "An extra argument", text: "stats = StatsCard(d.answers.q1.player, \"compact\")", stops: "expand", code: "template", message: "StatsCard takes only its data record", fix: "stats = StatsCard(d.answers.q1.player)", note: "A sports component takes one data reference and nothing else. Its layout comes from the record." },
  { title: "A path the data does not have", text: "stats = Text(d.answers.q1.player.points, \"body\")", stops: "nodes", code: "type-mismatch", message: "Missing data path d.answers.q1.player.points", fix: "stats = StatsCard(d.answers.q1.player)", note: "Every reference resolves against the saved dataset while the statement is checked." },
  { title: "A statement that never closes", text: "stats = StatsCard(d.answers.q1.player", stops: "parseStatement", code: "invalid-statement", message: "Incomplete statement", fix: "stats = StatsCard(d.answers.q1.player)", note: "The stream flushes the open text at the end. The parser rejects it." },
];

const checkLabels: Record<(typeof checkOrder)[number], string> = { parseName: "Name", parseStatement: "Parse", refuses: "Pack refuses", expand: "Expand calls", nodes: "Check nodes", limits: "Size limits" };

function Validation() {
  const [selected, setSelected] = useState(0);
  const item = statements[selected]!;
  const stop = checkOrder.indexOf(item.stops);
  return <section id="validation" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>03 / VALIDATE EACH STATEMENT</span><h2>The first failed check stops it.</h2></div><span className={styles.quiet}>{statements.length} statements</span></div>
    <p className={styles.sectionIntro}>admit runs six checks in order. Pick a statement to see where it stops and the message the compiler records. Messages are quoted from the code. The rule explorers below show the name, data and vocabulary checks.</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <label className={styles.selectLabel}>Statement <GuideSelect value={selected} onChange={event => setSelected(Number(event.target.value))}>{statements.map((s, i) => <option key={s.title} value={i}>{s.title}</option>)}</GuideSelect></label>
        <span className={styles.labelPill}>{item.code}</span>
      </div>
      <div className={styles.stepper} style={{ gridTemplateColumns: `repeat(${checkOrder.length}, minmax(0, 1fr))` }}>{checkOrder.map((check, index) => <button key={check} type="button" tabIndex={-1} data-active={index === stop} data-done={index < stop}><span>{index < stop ? "✓" : index === stop ? "✕" : "·"}</span>{checkLabels[check]}</button>)}</div>
      <div className={styles.searchScene}>
        <div className={styles.twoColumns}>
          <div className={styles.branchNode} data-failed="true"><span className={styles.nodeOverline}>REJECTED</span><pre className={styles.branchCode}><code>{item.text}</code></pre><strong>{item.code}</strong><p>{item.message}</p></div>
          <div className={styles.branchNode}><span className={styles.nodeOverline}>ADMITTED</span><pre className={styles.branchCode}><code>{item.fix}</code></pre><strong>Why</strong><p>{item.note}</p></div>
        </div>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>Rejected statements return in repair, word for word.</span><div className={styles.stageControls}><button type="button" onClick={() => setSelected(Math.max(0, selected - 1))} disabled={selected === 0}>← Previous</button><button type="button" className={styles.primaryButton} onClick={() => setSelected((selected + 1) % statements.length)}>{selected === statements.length - 1 ? "Start again ↺" : "Next statement →"}</button></div></div>
    </div>
    <Source file={COMPILER} line={428}>parseName</Source><Source file={COMPILER} line={526}>validate</Source><Source file={SCREEN} line={138}>expand</Source>
  </section>;
}

// 04 / 05 ---------------------------------------------------------- the rules

interface Rule {
  readonly title: string;
  readonly source: string;
  readonly enforced: "Prompt only" | "Prompt + gate" | "Gate";
  readonly covers: string;
  readonly without: string;
  readonly withoutResult: string;
  readonly with: string;
  readonly withResult: string;
}

const generalRules: readonly Rule[] = [
  { title: "Named parts, nothing the server owns", source: "System prompt", enforced: "Prompt + gate", covers: "Each part is one statement with a lowerCamel label. A large part splits into label_name sub-statements. The writer never writes root, d, Screen, queries, mutations, state or actions, and a part never references another part.",
    without: `root = Screen([table, scorers])\ntable = Card([scorers_list])`, withoutResult: "root is written by the server. scorers_list is not a sub-statement of table; parts cannot contain other parts.",
    with: `table = Card([table_rows])\ntable_rows = Stack("v", 12, [...])`, withResult: "Both statements are admitted. The compiler renames the part to pickN and writes root itself." },
  { title: "Data comes from d", source: "System prompt", enforced: "Prompt + gate", covers: "A data prop must reference d.<path> or an @Each item. Copy such as titles and labels is plain text with no invented figures. The gate checks data props. It cannot check copy, so a figure typed into a title gets through.",
    without: `haaland = Row("Haaland", null, null, Number(24, "decimal", "body"))`, withoutResult: "Number.value must reference data (d.<path> or an @Each item).",
    with: `scorers = Stack("v", 12, [@Each(d.answers.q1.rows, "r",\n  Row(r.name, null, null, Number(r.goals, "decimal", "body"))\n)])`, withResult: "Every figure reads the saved dataset, and the part counts as showing q1." },
  { title: "Text shows in full", source: "System prompt + pack", enforced: "Prompt only", covers: "A Text that reads a summary or note has no lines. Names and titles get lines 2, never 1. Use Stack with Text when a Row's two-line limit would cut a description. No ellipses in sourced sentences.",
    without: `outlook = Text(d.answers.q3.summary, "body", null, null, 1)`, withoutResult: "Admitted. The summary stops after one line.",
    with: `outlook = Text(d.answers.q3.summary, "body")`, withResult: "The whole summary shows." },
  { title: "Only the vocabulary the writer is given", source: "System prompt", enforced: "Prompt + gate", covers: "Only writer primitives: no root or chrome, nothing that needs an action, no inputs that edit data or hold state. Only listed token values. Positional arguments, with null to skip one. SF Symbols that exist on iOS 18.",
    without: `honours = Icon("trophy.circle.badge", 24, "gold")`, withoutResult: "\"trophy.circle.badge\" is not an SF Symbols name. gold is not an ink token.",
    with: `honours = Icon("trophy.fill", 24, "yellow")`, withResult: "Admitted. yellow is one of the accent inks." },
  { title: "Size limits", source: "System prompt", enforced: "Prompt + gate", covers: "At most 12 parts per screen, 16 statements per part, 600 nodes per part after @Each expansion, and 2,400 nodes per screen.",
    without: `stats = Stack("v", 8, [stats_r1, stats_r2, ...])\nstats_r1 = Row(...)\n... stats_r17 = Row(...)`, withoutResult: "At most 16 statements per part. Later rows are rejected and the part never finishes.",
    with: `stats = RecordTable(d.answers.q2.table)`, withResult: "One component call. The template expands to primitives inside the compiler." },
  { title: "Follow-ups leave the saved screen alone", source: "System prompt (follow-ups)", enforced: "Prompt + gate", covers: "Saved parts stay as they are. The writer rewrites only the parts named as editable, by their own pickN names. New parts use new labels. A new part that only repeats saved answers is dropped.",
    without: `pick1 = Card([...])`, withoutResult: "pick1 is not editable in this turn; name new parts with a lowercase label.",
    with: `palmerGoals = Stack("v", 12, [@Each(d.answers.q4.rows, "g", ...)])`, withResult: "A new part for the new question goes after the saved parts." },
];

const sportsRules: readonly Rule[] = [
  { title: "Match stats use StatBar", source: "Pack templates", enforced: "Prompt only", covers: "Every item of a match's statBars renders with StatBar, including shots, corners, saves, fouls and cards. No Progress and no row of figures instead.",
    without: `stats = Stack("v", 12, [@Each(d.answers.q1.match.statBars, "s",\n  Progress(s.home, "bar", null, s.label)\n)])`, withoutResult: "Admitted. One side shows as a bar and the comparison is lost.",
    with: `stats = Stack("v", 12, [@Each(d.answers.q1.match.statBars, "s", StatBar(s))])`, withResult: "Both teams' figures at the edges, with a split bar between them." },
  { title: "A team's record uses TeamPoints", source: "Pack refuses", enforced: "Gate", covers: "When an answer fits TeamPoints, a statement that reads its home or away record by hand is rejected. The code comment gives the reason: the writer's copy loses the card's total and rank.",
    without: `record = Grid("8", 4, [Text(d.answers.q2.points.home.won, "footnote"), ...])`, withoutResult: "This reads the home and away record by hand. Call TeamPoints(d.answers.q2.points) instead.",
    with: `record = TeamPoints(d.answers.q2.points)`, withResult: "The total, the rank and the home and away table in one card." },
  { title: "Each fact appears once", source: "Pack templates", enforced: "Prompt only", covers: "When questions overlap, each figure or record shows once on the screen, never again in another part.",
    without: `match = MatchCard(d.answers.q1.match)\nresults = Stack("v", 12, [@Each(d.answers.q2.matches, "m", MatchCard(m))])`, withoutResult: "Admitted. Chelsea 2, Arsenal 1 shows in the match card and again as the first recent result.",
    with: `match = MatchCard(d.answers.q1.match)\nresults = ... // starts with the game before`, withResult: "The latest game shows once." },
  { title: "Missing data is skipped", source: "Pack templates", enforced: "Prompt only", covers: "If an answer lacks a field, leave that piece out. No Note or Text saying it is missing, and no figure, name or source typed in its place. An unavailable answer still shows its note.",
    without: `assists = Note("Assist data is not available for this match.", "neutral")`, withoutResult: "Admitted. The screen spends space saying nothing.",
    with: `// no statement`, withResult: "The scorer row shows without an assist line." },
  { title: "Named items are icon-led rows", source: "Pack templates", enforced: "Prompt only", covers: "Prefer compact icon-led rows to tables and plain lists. Trophies, awards and honours get an icon, then count, name and detail, in a Stack(\"v\", 16) with no Card, dividers or column headers. RecordTable only when items share several figures.",
    without: `honours = RecordTable(d.answers.q4.trophies)`, withoutResult: "Admitted. A table with headers for what is a list of names.",
    with: `honours = Stack("v", 16, [@Each(d.answers.q4.trophies, "x",\n  Stack("h", 12, [Icon("trophy.fill", 24, "yellow"), Stack("v", 0, [\n    Stack("h", 4, [Text(x.count, "body", "semibold"), Text(x.name, "body", null, null, 2)]),\n    Text(x.detail, "body", null, "secondary", 2)\n  ])], "start")\n)])`, withResult: "One compact row per trophy." },
  { title: "Every player and club shows its mark", source: "Pack templates", enforced: "Prompt only", covers: "A record with kind player or club gets an Avatar beside its name wherever the name shows. Scorers and assists read scorerPlayer and assistPlayer. Never borrow a photo from another list by position. A missing photo drops the Avatar and keeps the text.",
    without: `scorers = Stack("v", 12, [@Each(d.answers.q1.goals, "g",\n  Row(g.scorer, null, Avatar(g.scorer, 40, d.players[0].logo))\n)])`, withoutResult: "Admitted. Every scorer gets the first player's photo.",
    with: `scorers = Stack("v", 12, [@Each(d.answers.q1.goals, "g", Row(g.scorerPlayer.name, null,\n  Avatar(g.scorerPlayer.name, 40, g.scorerPlayer.logo, null, null, g.scorerPlayer.color, g.scorerPlayer.kind)\n))])`, withResult: "Each scorer shows their own headshot on their club colour." },
  { title: "Less text, no repeats", source: "Pack templates", enforced: "Prompt only", covers: "Every text says something new. A Section title and a list title must not match, and a summary must not restate its title. Prefer a short title and the data. Keep parts in the order the user asked for them.",
    without: `scorers = Section("Top scorers", [Text("Top scorers this season", "headline"), scorers_list])`, withoutResult: "Admitted. The same heading twice.",
    with: `scorers = Section("Top scorers", [scorers_list])`, withResult: "One heading, then the data." },
  { title: "Sourced answers show a footnote", source: "Briefing", enforced: "Prompt only", covers: "When an answer has a source, the briefing tells the writer to show d.answers.<id>.source as a footnote.",
    without: `outlook = Text(d.answers.q3.summary, "body")`, withoutResult: "Admitted. A web finding with no attribution.",
    with: `outlook = Text(d.answers.q3.summary, "body")\noutlook_source = Text(d.answers.q3.source, "footnote", null, "tertiary")`, withResult: "The source line shows under the finding." },
];

function RuleExplorer({ id, index, heading, intro, rules }: { id: string; index: string; heading: string; intro: string; rules: readonly Rule[] }) {
  const [selected, setSelected] = useState(0);
  const rule = rules[selected]!;
  return <section id={id} className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>{index}</span><h2>{heading}</h2></div><span className={styles.quiet}>{rules.length} rules</span></div>
    <p className={styles.sectionIntro}>{intro}</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <label className={styles.selectLabel}>Rule <GuideSelect value={selected} onChange={event => setSelected(Number(event.target.value))}>{rules.map((item, i) => <option key={item.title} value={i}>{item.title}</option>)}</GuideSelect></label>
        <span className={styles.labelPill}>{rule.source} · {rule.enforced}</span>
      </div>
      <div className={styles.searchScene}>
        <p className={styles.sectionIntro}>{rule.covers}</p>
        <div className={styles.twoColumns}>
          <div className={styles.branchNode} data-failed="true"><span className={styles.nodeOverline}>WITHOUT THE RULE</span><pre className={styles.branchCode}><code>{rule.without}</code></pre><strong>{rule.enforced === "Prompt only" ? "What the screen shows" : "What the compiler says"}</strong><p>{rule.withoutResult}</p></div>
          <div className={styles.branchNode}><span className={styles.nodeOverline}>WITH THE RULE</span><pre className={styles.branchCode}><code>{rule.with}</code></pre><strong>Result</strong><p>{rule.withResult}</p></div>
        </div>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>{String(selected + 1).padStart(2, "0")} of {String(rules.length).padStart(2, "0")}</span><div className={styles.stageControls}><button type="button" onClick={() => setSelected(Math.max(0, selected - 1))} disabled={selected === 0}>← Previous</button><button type="button" className={styles.primaryButton} onClick={() => setSelected((selected + 1) % rules.length)}>{selected === rules.length - 1 ? "Start again ↺" : "Next rule →"}</button></div></div>
    </div>
  </section>;
}

// 06 ---------------------------------------------------------------- coverage, repair, fallback

const QUESTION = "q1: Show only Egor Demin's individual key statistics from his latest game.";
const firstPasses = [
  { id: "shown", label: "Shown", written: "demin = StatsCard(d.answers.q1.player)", open: [], uncovered: false, rejected: null, result: "StatsCard reads player.stats. q1 is shown, so no repair request is sent." },
  { id: "title", label: "Title only", written: "demin = Text(d.answers.q1.title, \"headline\")", open: [], uncovered: true, rejected: null, result: "The part is admitted, but title names an answer and does not show it. q1 is still a gap." },
  { id: "unfinished", label: "Unfinished", written: "stats = Stack(\"v\", 12, [stats_list])", open: ["stats: missing stats_list"], uncovered: true, rejected: null, result: "stats_list never arrives, so the part is never emitted and q1 has no finished part." },
  { id: "rejected", label: "Rejected", written: "stats = MetricBars({ columns: [] })", open: [], uncovered: true, rejected: "stats = MetricBars({ columns: [] })\nProblem: MetricBars takes a data reference first (d.<path> or an @Each item)", result: "The only statement was rejected. Repair quotes it with its problem." },
] as const;

function Coverage() {
  const [pass, setPass] = useState(1);
  const item = firstPasses[pass]!;
  const needsRepair = item.open.length > 0 || item.uncovered || !!item.rejected;
  const message = ["Repair. Write only the statements that finish these parts or show these questions; do not repeat admitted statements.",
    ...(item.open.length ? ["Unfinished parts:", ...item.open] : []),
    ...(item.uncovered ? ["Questions not yet shown (read their answer data):", QUESTION] : []),
    ...(item.rejected ? ["Rejected statements. Rewrite each one, changing only what its problems name:", item.rejected] : [])].join("\n");
  return <section id="repair" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>06 / CHECK COVERAGE, REPAIR ONCE</span><h2>What the writer is asked to fix.</h2></div><span className={styles.quiet}>Pick a first pass</span></div>
    <p className={styles.sectionIntro}>A part shows a question when it reads that answer&apos;s content. Reads of status, question, title, source, asOf and team do not count. An unavailable answer counts only when a part reads its note.</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <div className={styles.segmented}>{firstPasses.map((p, index) => <button key={p.id} type="button" data-active={pass === index} onClick={() => setPass(index)}>{p.label}</button>)}</div>
        <span className={styles.labelPill}>{needsRepair ? "Repair round 1" : "No repair"}</span>
      </div>
      <div className={styles.searchScene}>
        <div className={styles.branchNode} data-failed={needsRepair}><span className={styles.nodeOverline}>FIRST PASS</span><pre className={styles.branchCode}><code>{item.written}</code></pre><strong>{needsRepair ? "Gaps found" : "Every question shown"}</strong><p>{item.result}</p></div>
        {needsRepair && <><Connector label="Appended to the same messages" /><div className={styles.branchNode}><span className={styles.nodeOverline}>REPAIR REQUEST</span><pre className={styles.branchCode}><code>{message}</code></pre></div>
          <Connector label="After repair" />
          <div className={styles.twoColumns}>
            <div className={styles.branchNode}><span className={styles.nodeOverline}>IF REPAIR SHOWS q1</span><strong>The writer&apos;s part ships</strong><p>The new statements are admitted like any other. No default part is added.</p></div>
            <div className={styles.branchNode} data-failed="true"><span className={styles.nodeOverline}>IF q1 IS STILL A GAP</span><strong>question-fallback</strong><p>q1 was not shown by the writer; the server added its default part. Unfinished parts are dropped with part-incomplete.</p></div>
          </div></>}
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>The default part picks the first fitting component, with no relevance check.</span><div className={styles.stageControls}><button type="button" className={styles.primaryButton} onClick={() => setPass((pass + 1) % firstPasses.length)}>Next first pass →</button></div></div>
    </div>
    <Source file={SCREEN} line={22}>shows</Source><Source file={COMPILER} line={179}>Repair message</Source><Source file={COMPILER} line={322}>Fallback parts</Source>
  </section>;
}

// 07 ---------------------------------------------------------------- verify

const probeChecks = [
  ["Expected call", "Missing StatsCard call"],
  ["Forbidden call", "Irrelevant MatchCard call"],
  ["Required read", "Missing data player.stats"],
  ["Unrequested read", "Unrequested data game"],
  ["Compiler issue", "template: MetricBars takes a data reference first …"],
  ["Fallback", "1 fallback parts"],
] as const;

function Verify() {
  const [mode, setMode] = useState<"offline" | "live">("offline");
  return <section id="verify" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>07 / VERIFY THE WRITER</span><h2>Test the same records under different requests.</h2></div></div>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <div className={styles.segmented}>{(["offline", "live"] as const).map(m => <button key={m} type="button" data-active={mode === m} onClick={() => setMode(m)}>{m}{m === "offline" && <small>in check:all</small>}</button>)}</div>
        <span className={styles.labelPill}>{mode === "offline" ? "No model calls" : "Configured model and mode"}</span>
      </div>
      <div className={styles.searchScene}>{mode === "offline"
        ? <div className={styles.branchNode}><span className={styles.nodeOverline}>COMMAND</span><pre className={styles.branchCode}><code>npm run check:writer-relevance</code></pre><strong>What it checks</strong><p>Every component compiles from its catalog sample after player-image enrichment, with no issues and no fallback. No contract repeats a field. Each probe&apos;s expected component has a fitting record.</p></div>
        : <><div className={styles.branchNode}><span className={styles.nodeOverline}>COMMANDS</span><pre className={styles.branchCode}><code>{"npm run probe:writer -- --output=/private/tmp/writer-relevance.json\nnpm run probe:writer -- --case=player-performance --case=current-team"}</code></pre><strong>When to run it</strong><p>After you change the writer prompt, a useWhen or a contract. Each case compiles one request against prepared records with the real writer.</p></div>
          <Connector label="A case fails on any of these" />
          <div className={styles.twoColumns}>{probeChecks.map(([label, line]) => <div key={label} className={styles.branchNode}><span className={styles.nodeOverline}>{label.toUpperCase()}</span><p><code>{line}</code></p></div>)}</div></>}
      </div>
    </div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>A pass is not an accuracy estimate.</strong><p>The probes use prepared datasets. They do not test the planner, the feed adapters or dataset shaping. The full Demin rerun failed in shaping, a stage the probes skip.</p></div></div>
    <Source file={PROBE} line={111}>Offline audit</Source><Source file={PROBE} line={131}>Live probe</Source>
  </section>;
}

// ------------------------------------------------------------------ the page

export function BuildingWriterPipelineGuide({ markdown }: { markdown: string }) {
  return <AgentView><article className={styles.article}>
    <div className={styles.breadcrumb}><Link href="/how-to">How to</Link><span>/</span><span>Building the writer pipeline</span></div>
    <header className={styles.articleHeader}><div className={styles.eyebrow}><span className={styles.accentRule} /> PROCESS 02 / THE WRITER</div><div className={styles.titleRow}><h1>Building the<br />writer pipeline.</h1><ForAgentsButton /></div><p className={styles.lead}>The writer turns a saved dataset into OpenUI Lang statements. It reasons about which component answers each fact group and follows rules from the prompt, the sports pack and the briefing. The compiler then checks every statement, derives what each part shows, asks for one repair and fills what is still missing.</p><div className={styles.headerMeta}><span>Reasoning</span><span>Rules</span><span>Gate</span><span>Repair</span><span>Probe</span><i /><span>Interactive system guide</span></div></header>
    <AgentBody markdown={markdown} file="building-writer-pipeline.md">
    <Walkthrough />
    <Reasoning />
    <Validation />
    <RuleExplorer id="general" index="04 / RULES FOR EVERY SCREEN" heading="The shape of a program." intro="These rules are in the system prompt for any domain. Most of them are also gate checks, so a statement that breaks one never reaches the screen." rules={generalRules} />
    <RuleExplorer id="sports" index="05 / SPORTS RULES" heading="How a sports screen reads." intro="These rules come from the sports pack and the briefing. All but TeamPoints are prompt only, so a statement that ignores one is still admitted." rules={sportsRules} />
    <Coverage />
    <Verify />
    <section id="adding" className={styles.section}>
      <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>08 / ADD A BOUNDARY</span><h2>Put the rule where its scope is.</h2></div></div>
      <p className={styles.sectionIntro}>A prompt rule asks. A gate rule enforces. Write a rule as an instruction, with the exact call when there is one. The icon-led row rule includes the full statement to copy.</p>
      <div className={styles.recoveryGrid}>
        <div><span className={styles.recoveryLabel}>ANY DOMAIN</span><h3>System prompt</h3><p>Add it to writerMessages. Keep anything that varies per request out of it, so the cache entry stays shared.</p><Source file={COMPILER} line={672}>System prompt</Source></div>
        <div><span className={styles.recoveryLabel}>SPORTS</span><h3>Pack templates</h3><p>Add it to SPORTS_SCREEN.templates, next to the component it is about. A rule about which component fits goes in that component&apos;s useWhen.</p><Source file={SCREEN} line={152}>Sports rules</Source></div>
        <div><span className={styles.recoveryLabel}>ONE ANSWER</span><h3>Briefing</h3><p>A rule that depends on one answer&apos;s data, such as its note or source, goes in briefing.</p><Source file={SCREEN} line={99}>Briefing</Source></div>
        <div><span className={styles.recoveryLabel}>MUST NEVER BREAK</span><h3>Gate</h3><p>Add a check to validate for any domain, or to the pack&apos;s refuses for one. The writer reads its message in repair, so name the fix, as the TeamPoints message does.</p><Source file={SCREEN} line={116}>refuses</Source></div>
      </div>
    </section>
    <section className={styles.evidenceSection}>
      <div><span className={styles.sectionIndex}>WHY THIS SHAPE</span><h2>Validation proves the screen is well formed. It cannot prove it is the right screen.</h2><p>Every gate check has a test a statement can fail: a name, a path, a type, a count. Relevance has no such test inside one compile, because a wrong component with a valid record is still a valid statement. That is why the reasoning lives in the prompt and is measured by contrast probes, where the same records meet different requests.</p><p>The repository does not say why most sports rules are prompt only rather than gate checks. A likely reason is the same: rules about taste, such as less text or icon-led rows, have no clear test a statement can fail. That is an inference from the code.</p><p>The compiler contract says it never throws for writer behaviour. A writer that fails still produces a screen, built from default parts. Those parts skip the relevance rules, so a high fallback count is a relevance problem as well as a writing one.</p><Source file={COMPILER} line={137}>Compiler contract</Source><Source file={ASK} line={203}>compose</Source><Source file={COMPILER} line={662}>Fixed system prompt</Source><Source file={SCREEN} line={112}>TeamPoints refusal</Source></div>
    </section>
    <footer className={styles.articleFooter}><div><strong>Built from the local implementation</strong><span>metrics-comparison-fixes · Working tree references name the current files and lines.</span><span>Probe cases come from check-writer-relevance.ts. Compiler messages are quoted from the code.</span><span>Live probe results are recorded in WRITER_RELEVANCE.md and were not rerun for this guide.</span></div><Link href="/">Open the Preview ↗</Link></footer>
    </AgentBody>
  </article></AgentView>;
}
