"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "@/app/how-to/how-to.module.css";
import { AgentBody, AgentView, ForAgentsButton } from "./agent-view";
import { GuideSelect } from "./guide-parts";

const COMPILER = "src/lang/compiler.ts";
const SCREEN = "src/sports/screen.ts";

function Source({ file, line, children }: { file: string; line: number; children: ReactNode }) {
  return <span className={styles.workingSource}>{children}<code>{file}:{line}</code></span>;
}

function Connector({ label }: { label: string }) {
  return <div className={styles.verticalConnector}><span>{label}</span><i>↓</i></div>;
}

// 01 ---------------------------------------------------------------- where the rules live

const layers = [
  { name: "System prompt", node: "Rules for every screen", detail: "Naming, data from d, coverage, wrapping, tokens, limits", title: "The system prompt holds the general rules.", text: "writerMessages writes the rules that apply to every screen in any domain. The primitive signatures and the allowed token values are generated from the library and appended to it.", note: "The prompt is the same for every screen and follow-up, so it stays one cache entry. Anything that varies goes in the user turn.", file: COMPILER, line: 663 },
  { name: "Pack templates", node: "Sports rules", detail: "Which component fits, marks, icons, less text", title: "The sports pack adds its own rules.", text: "SPORTS_SCREEN.templates is appended to the system prompt. It says which sports component fits which data, how players and clubs show, and how much text to write. The sports component signatures follow it.", note: "These rules are prompt only. The writer can ignore one and the statement is still admitted.", file: SCREEN, line: 151 },
  { name: "Briefing", node: "Per-answer instructions", detail: "Must be shown · status · note · footnote · components that fit", title: "The briefing speaks about this request.", text: "The user turn lists every answer under d.answers.<id>. It says whether the answer must be shown, its status, the note to show, whether it needs a source footnote, and which components fit its data.", note: "On a follow-up it also says which saved parts the writer may rewrite.", file: SCREEN, line: 99 },
  { name: "Gate", node: "Compiler checks", detail: "Names · data props · vocabulary · limits · TeamPoints", title: "The gate checks every statement as it streams.", text: "validate and parseName check each statement before it reaches the screen. A statement that breaks a gate rule is rejected, and its problem is recorded under the writer's own statement name.", note: "A prompt rule asks. A gate rule enforces. Several rules sit in both places.", file: COMPILER, line: 526 },
  { name: "Repair", node: "One repair round", detail: "Unfinished parts · uncovered questions · rejected statements", title: "The writer gets one chance to fix it.", text: "After the first pass, the compiler sends one repair request. It lists unfinished parts, questions no part shows yet, and each rejected statement with its problems and the argument order of the components it names.", note: "Repair asks for only the missing statements. Admitted statements stay as they are.", file: COMPILER, line: 174 },
  { name: "Fallback", node: "Default parts", detail: "Built by the server, no model call", title: "The server fills what is still missing.", text: "Every required question that no part shows after repair gets a default part built from the answer's own shape. An unavailable answer gets a warning note.", note: "A prompt-only rule has no such path. If the writer ignores it, the screen shows the result.", file: SCREEN, line: 48 },
];

function Layers() {
  const [step, setStep] = useState(0);
  const current = layers[step]!;
  return <section id="layers" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>01 / WHERE THE RULES LIVE</span><h2>Four sources, one writer.</h2></div><span className={styles.quiet}>Add one layer at a time</span></div>
    <div className={styles.walkthrough}>
      <div className={styles.stepper} style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}>{layers.map((layer, index) => <button key={layer.name} type="button" data-active={step === index} data-done={index < step} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, "0")}</span>{layer.name}</button>)}</div>
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene}>
          {layers.slice(0, Math.min(step, 2) + 1).map((layer, index) => <div key={layer.name}>{index > 0 && <Connector label="Appended" />}<div className={styles.datasetNode}><span className={styles.nodeOverline}>{index < 2 ? "SYSTEM TURN" : "USER TURN"}</span><strong>{layer.node}</strong><span>{layer.detail}</span></div></div>)}
          {step >= 2 && <><Connector label="Sent together" /><div className={styles.writerNode}><span>Writer</span><code>label = Component(...)</code><small>One statement per line</small></div></>}
          {step >= 3 && <><Connector label="Each statement" /><div className={styles.datasetNode}><span className={styles.nodeOverline}>COMPILER</span><strong>{layers[3]!.node}</strong><span>{layers[3]!.detail}</span></div></>}
          {step >= 4 && <><Connector label="Rejected or missing" /><div className={styles.datasetNode}><span className={styles.nodeOverline}>SECOND REQUEST</span><strong>{layers[4]!.node}</strong><span>{layers[4]!.detail}</span></div></>}
          {step >= 5 && <><Connector label="Still not shown" /><div className={styles.datasetNode}><span className={styles.nodeOverline}>SERVER</span><strong>{layers[5]!.node}</strong><span>{layers[5]!.detail}</span></div></>}
        </div>
        <aside className={styles.stageAnnotation}><span className={styles.annotationNumber}>{String(step + 1).padStart(2, "0")}</span><h3>{current.title}</h3><p>{current.text}</p><div className={styles.annotationNote}>{current.note}</div><Source file={current.file} line={current.line}>Read this in the code</Source></aside>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>Prompt rules ask. Gate rules enforce.</span><div className={styles.stageControls}><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button><button type="button" className={styles.primaryButton} onClick={() => setStep(step === layers.length - 1 ? 0 : step + 1)}>{step === layers.length - 1 ? "Start again ↺" : "Add the next layer →"}</button></div></div>
    </div>
  </section>;
}

// 02 / 03 ---------------------------------------------------------- the rules

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
  { title: "Every required question is shown", source: "System prompt + briefing", enforced: "Prompt + gate", covers: "A question counts as shown when a part reads its answer content. An unavailable answer counts only when a part reads its note. Reading only title or status does not count.",
    without: `match = MatchCard(d.answers.q1.match)\nvalue = Bars(d.answers.q2.series)\n// q3 is unavailable and skipped`, withoutResult: "Repair asks for q3. If it is still missing, the server adds its default warning note.",
    with: `injuries = Note(d.answers.q3.note, "warn", d.answers.q3.title)`, withResult: "The gap stays visible, written by the writer instead of the fallback." },
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

// ------------------------------------------------------------------ the page

export function CreatingBoundariesGuide({ markdown }: { markdown: string }) {
  return <AgentView><article className={styles.article}>
    <div className={styles.breadcrumb}><Link href="/how-to">How to</Link><span>/</span><span>Creating boundaries</span></div>
    <header className={styles.articleHeader}><div className={styles.eyebrow}><span className={styles.accentRule} /> PROCESS 03 / THE WRITER&apos;S RULES</div><div className={styles.titleRow}><h1>Creating<br />boundaries.</h1><ForAgentsButton /></div><p className={styles.lead}>The writer turns a saved dataset into OpenUI Lang statements. Its rules come from the prompt, the sports pack and the briefing. The compiler enforces some of them and rejects the statements that break them.</p><div className={styles.headerMeta}><span>System prompt</span><span>Sports pack</span><span>Briefing</span><span>Gate</span><i /><span>Interactive system guide</span></div></header>
    <AgentBody markdown={markdown} file="creating-boundaries.md">
    <Layers />
    <RuleExplorer id="general" index="02 / RULES FOR EVERY SCREEN" heading="The shape of a program." intro="These rules are in the system prompt for any domain. Most of them are also gate checks, so a statement that breaks one never reaches the screen." rules={generalRules} />
    <RuleExplorer id="sports" index="03 / SPORTS RULES" heading="How a sports screen reads." intro="These rules come from the sports pack and the briefing. All but TeamPoints are prompt only, so a statement that ignores one is still admitted." rules={sportsRules} />
    <section id="adding" className={styles.section}>
      <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>04 / ADDING A BOUNDARY</span><h2>Put the rule where its scope is.</h2></div></div>
      <p className={styles.sectionIntro}>Write a rule as an instruction, with the exact call when there is one. The icon-led row rule includes the full statement to copy.</p>
      <div className={styles.recoveryGrid}>
        <div><span className={styles.recoveryLabel}>ANY DOMAIN</span><h3>System prompt</h3><p>Add it to writerMessages. Keep anything that varies per request out of it, so the cache entry stays shared.</p><Source file={COMPILER} line={670}>System prompt</Source></div>
        <div><span className={styles.recoveryLabel}>SPORTS</span><h3>Pack templates</h3><p>Add it to SPORTS_SCREEN.templates, next to the component it is about.</p><Source file={SCREEN} line={151}>Sports rules</Source></div>
        <div><span className={styles.recoveryLabel}>ONE ANSWER</span><h3>Briefing</h3><p>A rule that depends on one answer&apos;s data, such as its note or source, goes in briefing.</p><Source file={SCREEN} line={99}>Briefing</Source></div>
        <div><span className={styles.recoveryLabel}>MUST NEVER BREAK</span><h3>Gate</h3><p>Add a check to validate for any domain, or to the pack&apos;s refuses for one. The writer reads its message in repair, so name the fix, as the TeamPoints message does.</p><Source file={SCREEN} line={115}>refuses</Source></div>
      </div>
    </section>
    <section className={styles.evidenceSection}>
      <div><span className={styles.sectionIndex}>WHY THIS SHAPE</span><h2>The writer can fail. The screen still ships.</h2><p>The compiler never throws for writer behaviour. It rejects statements, drops unfinished parts and fills gaps with default parts. The prompt comment says the system prompt is fixed so it stays one cache entry. The refuses comment says a hand-built record table loses the card&apos;s total and rank.</p><p>The repository does not say why most sports rules are prompt only rather than gate checks. A likely reason is that rules about taste, such as less text or icon-led rows, have no clear test a statement can fail. That is an inference from the code.</p><Source file={COMPILER} line={137}>Compiler contract</Source><Source file={COMPILER} line={662}>Fixed system prompt</Source><Source file={SCREEN} line={111}>TeamPoints refusal</Source></div>
    </section>
    <footer className={styles.articleFooter}><div><strong>Built from the local implementation</strong><span>limits-drop · Working tree references name the current files and lines.</span><span>Examples are illustrative statements. Compiler messages are quoted from the code.</span><span>Evidence is the working tree and git history. Recorded generation runs were not reviewed.</span></div><Link href="/">Open the Preview ↗</Link></footer>
    </AgentBody>
  </article></AgentView>;
}
