"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/how-to/how-to.module.css";
import { AgentBody, AgentView, ForAgentsButton } from "./agent-view";
import { GuideSelect, Source } from "./guide-parts";

type Provider = "mixed" | "fotmob";
type Failure = "none" | "feed" | "ratings";
type SearchState = "healthy" | "preferred" | "extract" | "open" | "uncited";

const stages = [
  { name: "Plan", title: "One request becomes answerable questions.", text: "The planner identifies the subject and creates 1–5 questions. Each gets a stable ID and keeps the club, competition, time period and count the user asked for.", note: "Web questions get 2–3 keyword queries here, before any research starts.", file: "src/sports/plan.ts", line: 86 },
  { name: "Route", title: "Each question starts on its own route.", text: "The planner selects structured football, player market values or web research. All questions start concurrently. The configured provider decides who supplies the structured feed.", note: "Try changing the provider above. The player and web routes keep their jobs.", file: "src/sports/football.ts", line: 6 },
  { name: "Collect", title: "Answers meet at the question ID.", text: "The server waits for the group of questions and collects each result under answers.q1, answers.q2 and so on. Each answer carries its status and source attribution.", note: "Try a failed feed. That question becomes unavailable while the other answers remain.", file: "src/sports/research.ts", line: 102 },
  { name: "Prepare", title: "Collected answers become a screen dataset.", text: "The designer shapes eligible complete answers into component fields and values. The server validates them, attaches player photos and club marks, and removes repeated facts.", note: "Market value charts and recent-scorer records already have a prepared shape. They skip model shaping.", file: "src/sports/dataset.ts", line: 133 },
  { name: "Hand off", title: "The writer starts with saved data.", text: "The final dataset is saved as a snapshot first. The writer receives the request, required question IDs and a compact preview of its values, then composes the screen with references to that dataset.", note: "The writer does not run the research. The compiler checks coverage and adds fallback parts when needed.", file: "src/sports/ask.ts", line: 83 },
];

function PipelineWalkthrough({ provider, setProvider }: { provider: Provider; setProvider: (provider: Provider) => void }) {
  const [step, setStep] = useState(0);
  const [failure, setFailure] = useState<Failure>("none");
  const current = stages[step]!;
  const feed = provider === "mixed" ? "ESPN" : "FotMob";
  const questions = [
    { id: "q1", text: "Chelsea vs Arsenal · latest meeting", kind: "Structured football", provider: feed, detail: failure === "ratings" ? "Match kept · no ratings" : "Match + optional FotMob ratings", status: failure === "feed" ? "unavailable" : "complete" },
    { id: "q2", text: "Cole Palmer · market value history", kind: "Player market values", provider: "FotMob", detail: "Prepared market value chart", status: "complete" },
    { id: "q3", text: "Chelsea · latest injury context", kind: "Cited web research", provider: "Parallel → reader", detail: "Finding with matched citation", status: "complete" },
  ];
  return <section id="walkthrough" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>01 / THE WHOLE REQUEST</span><h2>Follow the data.</h2></div><span className={styles.quiet}>Step through the same request</span></div>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <span className={styles.demoTitle}><span className={styles.statusDot} /> Pipeline explorer <small>Illustrative run</small></span>
        <label className={styles.selectLabel}>Provider mode <GuideSelect value={provider} onChange={event => { if (event.target.value === "mixed" || event.target.value === "fotmob") setProvider(event.target.value); }}><option value="mixed">mixed · default</option><option value="fotmob">fotmob</option></GuideSelect></label>
      </div>
      <div className={styles.stepper}>{stages.map((stage, index) => <button key={stage.name} type="button" aria-pressed={step === index} data-active={step === index} data-done={index < step} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, "0")}</span>{stage.name}</button>)}</div>
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene} data-step={step}>
          <div className={styles.promptNode}><span className={styles.nodeOverline}>USER REQUEST</span><p>“Show the latest Chelsea–Arsenal match, Palmer’s market value history and Chelsea’s injury news.”</p></div>
          <div className={styles.verticalConnector}><span>Planner</span><i>↓</i></div>
          <div className={styles.questionGroup}><div className={styles.groupHeading}><span>Planned questions</span><span>{step > 0 ? "Started together" : "3 questions"}</span></div>
            {questions.map(question => <div key={question.id} className={styles.questionRow}>
              <div className={styles.questionText}><code>{question.id}</code><span>{question.text}</span></div>
              {step >= 1 && <><span className={styles.routeArrow}>→</span><div className={styles.routeNode}><small>{question.kind}</small><strong>{question.provider}</strong></div></>}
              {step >= 2 && <div className={styles.answerNode} data-unavailable={question.status === "unavailable"}><span>{question.status === "unavailable" ? "Unavailable" : "Collected"}</span><small>{question.status === "unavailable" ? "Other questions continue" : question.detail}</small></div>}
            </div>)}
          </div>
          {step >= 3 && <><div className={styles.verticalConnector}><span>Wait for all questions</span><i>↓</i></div><div className={styles.datasetNode}><span className={styles.nodeOverline}>DATASET PREPARATION</span><strong>Shape → validate → enrich</strong><span>answers + clubs + players</span></div></>}
          {step >= 4 && <><div className={styles.verticalConnector}><span>Save snapshot first</span><i>↓</i></div><div className={styles.writerNode}><span>Writer</span><code>d.answers.q1</code><small>Compose with saved values</small></div></>}
          <div className={styles.sceneCaption}>Teaching example. No live source requests are sent.</div>
        </div>
        <aside className={styles.stageAnnotation}><span className={styles.annotationNumber}>{String(step + 1).padStart(2, "0")}</span><h3>{current.title}</h3><p>{current.text}</p><div className={styles.annotationNote}>{current.note}</div><Source file={current.file} line={current.line}>Read this stage in the code</Source></aside>
      </div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try an outcome <GuideSelect value={failure} onChange={event => { const value = event.target.value; if (value === "none" || value === "feed" || value === "ratings") { setFailure(value); setStep(Math.max(step, 2)); } }}><option value="none">All sources available</option><option value="feed">Feed request fails</option><option value="ratings">Match ratings missing</option></GuideSelect></label><div className={styles.stageControls}><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button><button type="button" className={styles.primaryButton} onClick={() => setStep(step === stages.length - 1 ? 0 : step + 1)}>{step === stages.length - 1 ? "Start again ↺" : "Next stage →"}</button></div></div>
    </div>
  </section>;
}

function Routing({ provider, setProvider }: { provider: Provider; setProvider: (provider: Provider) => void }) {
  return <section id="routing" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>02 / THE ROUTING DECISION</span><h2>The question chooses the route.</h2></div></div>
    <p className={styles.sectionIntro}>Coverage determines the route during planning. The provider setting determines who answers structured football questions.</p>
    <div className={styles.routeSettings}><span>Structured football provider</span><div className={styles.segmented}>{(["mixed", "fotmob"] satisfies Provider[]).map(mode => <button type="button" key={mode} aria-pressed={provider === mode} data-active={provider === mode} onClick={() => setProvider(mode)}>{mode}{mode === "mixed" && <small>default</small>}</button>)}</div></div>
    <div className={styles.routingTableWrap}><table className={styles.routingTable}><thead><tr><th>What the question needs</th><th>Who answers</th><th>What happens next</th></tr></thead><tbody>
      <tr><td><strong>Structured football</strong><span>Tables, fixtures, results, match reports, leaders and recent scorers within supported competitions</span></td><td><span className={styles.providerBadge}>{provider === "mixed" ? "ESPN" : "FotMob"}</span></td><td>Normalized answer values go straight to collection. A match may also receive FotMob ratings.</td></tr>
      <tr><td><strong>Player market value history</strong><span>A dedicated player question</span></td><td><span className={styles.providerBadge}>FotMob</span></td><td>A prepared chart enters collection. Player identities and images also come from FotMob.</td></tr>
      <tr><td><strong>Context and uncovered data</strong><span>Injuries, transfers, news, unsupported competitions and statistics beyond feed coverage</span></td><td><span className={styles.providerBadge}>Parallel + reader</span></td><td>Search and page excerpts become a cited finding, then an answer record.</td></tr>
    </tbody></table></div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>Provider selection happens before the call.</strong><p>FotMob is a primary route for player market values and, in <code>fotmob</code> mode, structured feeds. Missing match ratings leave the base match intact. A failed structured feed becomes unavailable rather than switching to another provider or launching a web search.</p></div></div>
    <details className={styles.detail}><summary>A naming detail when reading the code <span>+</span></summary><p>The internal <code>{'source: "espn"'}</code> tag means the structured football route even when FotMob answers it. The snapshot’s source label is similarly coarse. Read the configured route and answer attribution to identify the actual provider. FotMob mode also retains the planner’s supported competition codes.</p><Source file="src/sports/football.ts" line={10}>Provider switch</Source><Source file="src/sports/plan.ts" line={70}>Planning rules</Source></details>
  </section>;
}

const searchNotes: Record<SearchState, { title: string; text: string }> = {
  healthy: { title: "Two searches. One question.", text: "Both Search calls receive the same 2–3 keyword queries. Preferred results lead, exact duplicate URLs are removed, and readable pages form the evidence for the reader." },
  preferred: { title: "The open search can carry on.", text: "The preferred-domain Search error is caught. Open results still enter collection, and pages on preferred domains can still be found by the open search." },
  extract: { title: "Richer excerpts are an upgrade.", text: "If Extract fails or times out, the Search excerpts remain available. The reader can still produce a cited answer from that material." },
  open: { title: "This question becomes unavailable.", text: "An open Search failure rejects this research call, even if the preferred search succeeded. The per-question error handler records the gap and keeps other questions running." },
  uncited: { title: "A citation must match a retrieved source.", text: "A reader finding with no matching source URL becomes unavailable. This checks source identity, not the truth of every individual claim." },
};

function WebResearch() {
  const [depth, setDepth] = useState(0);
  const [outcome, setOutcome] = useState<SearchState>("healthy");
  const note = searchNotes[outcome];
  const stopped = outcome === "open";
  return <section id="web-research" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>03 / INSIDE ONE WEB QUESTION</span><h2>Search broadly. Read selectively.</h2></div><span className={styles.labelPill}>Parallel Search + Extract</span></div>
    <p className={styles.sectionIntro}>Questions run in parallel. Inside each web question, two searches run in parallel again. The application uses a bounded plan, with no loop that keeps inventing new searches until it has enough data.</p>
    <div className={styles.researchDemo}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}><code>q3</code> Chelsea injury context</span><span className={styles.quiet}>One web question</span></div>
      <div className={styles.searchScene}>
        <div className={styles.queryBundle}><span className={styles.nodeOverline}>KEYWORD QUERIES PLANNED TOGETHER</span><div><code>Chelsea injury update</code><code>Chelsea team news return</code></div><span>Same objective + same query bundle in both requests</span></div>
        <div className={styles.forkConnector}><i /><span>2 concurrent Search calls</span><i /></div>
        <div className={styles.searchBranches}>
          <div className={styles.searchBranch} data-failed={outcome === "preferred"}><div><span className={styles.nodeOverline}>PREFERRED DOMAINS</span><span className={styles.monoNumber}>≤ 5 <small>pages</small></span></div><strong>{outcome === "preferred" ? "Search failed · caught" : "Trusted football sources"}</strong><p>ESPN, BBC, official leagues, established football data sites</p></div>
          <div className={styles.searchBranch} data-failed={stopped}><div><span className={styles.nodeOverline}>OPEN WEB</span><span className={styles.monoNumber}>≤ 8 <small>pages</small></span></div><strong>{stopped ? "Search failed" : "Broader coverage"}</strong><p>Useful pages beyond the preferred domains</p></div>
        </div>
        <div className={styles.mergeConnector}><i /><span>{stopped ? "Question stops here" : "Preferred first · deduplicate exact URLs"}</span><i /></div>
        {stopped ? <div className={styles.unavailableNode}><code>answers.q3.status</code><strong>unavailable</strong></div> : <>
          <div className={styles.mergedNode}><span>Readable search excerpts</span><small>Keep useful pages from both groups</small></div>
          {depth >= 1 && <><div className={styles.verticalConnector}><span>Up to 3 preferred + 3 other pages</span><i>↓</i></div><div className={styles.extractNode} data-failed={outcome === "extract"}><span className={styles.nodeOverline}>ONE EXTRACT BATCH</span><strong>{outcome === "extract" ? "Keep the original search excerpts" : "Read richer page excerpts"}</strong><small>{outcome === "extract" ? "Extraction failure does not end research" : "Enrich selected pages; retain the other excerpts"}</small></div></>}
          {depth >= 2 && <><div className={styles.verticalConnector}><span>Excerpts + retrieved source URLs</span><i>↓</i></div><div className={styles.readerNode}><span className={styles.nodeOverline}>WEB READER · SONNET BY DEFAULT</span><strong>{outcome === "uncited" ? "No matching citation → unavailable" : "One structured finding → answers.q3"}</strong><small>Summary, table or facts · date · source attribution</small></div></>}
        </>}
      </div>
      <div className={styles.researchAnnotation}><span>↳</span><div><strong>{note.title}</strong><p>{note.text}</p></div></div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try an outcome <GuideSelect value={outcome} onChange={event => { const value = event.target.value; if (value === "healthy" || value === "preferred" || value === "extract" || value === "open" || value === "uncited") { setOutcome(value); if (value === "extract") setDepth(Math.max(depth, 1)); if (value === "uncited") setDepth(2); } }}><option value="healthy">All research succeeds</option><option value="preferred">Preferred search fails</option><option value="extract">Extract fails</option><option value="open">Open search fails</option><option value="uncited">No matching citation</option></GuideSelect></label><button type="button" className={styles.primaryButton} disabled={stopped} onClick={() => setDepth((depth + 1) % 3)}>{depth === 0 ? "Add page reading →" : depth === 1 ? "Add the reader →" : "Show searches only ↺"}</button></div>
    </div>
    <div className={styles.sourceRow}><Source file="src/research/parallel-research.ts" line={64}>Search orchestration</Source><Source file="src/sports/research.ts" line={47}>Citation gate</Source></div>
    <details className={styles.detail}><summary>What “multiple searches” means here <span>+</span></summary><p>A normal sports web question makes two Search HTTP requests, each containing all of its 2–3 planned queries. Two web questions therefore normally make four Search requests, plus up to one Extract request per question. URL deduplication happens inside each question. The reader’s structured-output retry can regenerate a finding, but it does not rerun the searches.</p></details>
  </section>;
}

function WriterHandoff() {
  const [tab, setTab] = useState<"snapshot" | "writer">("snapshot");
  return <section id="writer" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>04 / THE DATA CONTRACT</span><h2>Research ends. Composition begins.</h2></div></div>
    <p className={styles.sectionIntro}>All routes meet in one saved dataset. The writer uses that dataset to build a screen. It does not choose sources or gather facts during composition.</p>
    <div className={styles.handoffGrid}>
      <div className={styles.preparationList}>
        <div><span>01</span><section><h3>Shape collected answers</h3><p>Opus selects, orders and derives values from eligible answers. Prepared market value charts and recent-scorer records pass through.</p></section></div>
        <div><span>02</span><section><h3>Validate and enrich</h3><p>Keep valid raw answers when a design is rejected. Resolve player identities, fill photos and club marks, settle component values and remove repeated facts.</p></section></div>
        <div><span>03</span><section><h3>Save, then write</h3><p>Store the fields and values under the run ID. Emit the dataset before composition starts. The compiler gives the screen its dataset query.</p></section></div>
      </div>
      <div className={styles.contractPanel}>
        <div className={styles.contractTabs}><button type="button" aria-pressed={tab === "snapshot"} data-active={tab === "snapshot"} onClick={() => setTab("snapshot")}>Saved dataset</button><button type="button" aria-pressed={tab === "writer"} data-active={tab === "writer"} onClick={() => setTab("writer")}>Writer receives</button></div>
        <div className={styles.contractBody}>{tab === "snapshot" ? <><div className={styles.codeTitle}>sports_dataset · shape example</div><pre><code>{`{\n  values: {\n    answers: { q1, q2, q3 },\n    clubs: [...],\n    players: [...]\n  },\n  fields: [...],\n  asOf: "...",\n  source: "mixed"\n}`}</code></pre><p>Full values stay in the snapshot. Club and player lists are present when available.</p></> : <><div className={styles.codeTitle}>Composition brief</div><ul><li>The user’s request</li><li>Required question IDs and statuses</li><li>A compact preview of the answer values</li><li>Component contracts and source footnote rules</li></ul><div className={styles.codeLine}><code>d.answers.q1</code><span>Read saved values</span></div><p>The compiler supplies <code>{'Query("sports_dataset", …)'}</code>. The writer references data paths. Web attribution reaches it as source text, not the full article URL list.</p></>}</div>
      </div>
    </div>
    <div className={styles.sourceRow}><Source file="src/sports/dataset.ts" line={133}>Dataset preparation</Source><Source file="src/sports/ask.ts" line={174}>Enrichment and collection</Source><Source file="src/sports/screen.ts" line={93}>Writer brief</Source></div>
    <details className={styles.detail}><summary>What checks the final screen? <span>+</span></summary><p>The compiler admits valid streamed statements, checks which questions their data references cover, and can request one repair round. It adds deterministic fallback parts for uncovered questions. An unavailable question must show its note. This is a presentation fallback after research, not another source lookup.</p><Source file="src/lang/compiler.ts" line={145}>Compiler coverage and fallback</Source></details>
  </section>;
}

export function DataAggregationGuide({ markdown }: { markdown: string }) {
  const [provider, setProvider] = useState<Provider>("mixed");
  return <AgentView><article className={styles.article}>
    <div className={styles.breadcrumb}><Link href="/how-to">How to</Link><span>/</span><span>Data aggregation</span></div>
    <header className={styles.articleHeader}><div className={styles.eyebrow}><span className={styles.accentRule} /> PROCESS 01 / FROM REQUEST TO DATASET</div><div className={styles.titleRow}><h1>How the data<br />gets to the writer.</h1><ForAgentsButton /></div><p className={styles.lead}>A request becomes questions. Each question takes a route. The answers become a saved dataset for the writer.</p><div className={styles.headerMeta}><span>ESPN</span><span>FotMob</span><span>Parallel</span><i /><span>Interactive system guide</span></div></header>
    <AgentBody markdown={markdown} file="data-aggregation.md">
    <PipelineWalkthrough provider={provider} setProvider={setProvider} />
    <Routing provider={provider} setProvider={setProvider} />
    <WebResearch />
    <WriterHandoff />
    <section id="recovery" className={styles.section}>
      <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>05 / FAILURE AND RECOVERY</span><h2>A gap stays visible.</h2></div></div>
      <p className={styles.sectionIntro}>Recovery depends on the stage. These are different behaviors, rather than one universal source fallback.</p>
      <div className={styles.recoveryGrid}>
        <div><span className={styles.recoveryLabel}>RESEARCH</span><h3>One question fails</h3><p>Keep the other answers. Mark the failed question unavailable with a note. An empty but valid feed can still be a complete answer.</p></div>
        <div><span className={styles.recoveryLabel}>ENRICHMENT</span><h3>Ratings are missing</h3><p>Keep the match. Optional FotMob ratings can be omitted without losing the base answer.</p></div>
        <div><span className={styles.recoveryLabel}>DATASET</span><h3>A design is rejected</h3><p>Keep the raw answer with inferred fields where it validates. A shape mistake can cost polish without losing the data.</p></div>
        <div><span className={styles.recoveryLabel}>COMPOSITION</span><h3>A question is uncovered</h3><p>Let the writer repair it, then use a deterministic fallback part if needed. The saved data remains available.</p></div>
      </div>
    </section>
    <section className={styles.evidenceSection}>
      <div><span className={styles.sectionIndex}>WHY THIS SHAPE</span><h2>Facts and presentation have separate jobs.</h2><p>The dataset code states the intent directly: a schema mistake should cost polish, not the screen. The research code records a similar rule: a failed or uncited answer should report a gap instead of inventing data.</p><p>Per-question routing appears to let one screen combine structured statistics with web context while containing most failures to the affected question. This is an inference from the implementation. The repository does not explain why <code>mixed</code> is the default or why the exact search limits were chosen.</p><Source file="src/sports/dataset.ts" line={11}>Documented dataset intent</Source><Source file="src/sports/research.ts" line={16}>Documented research intent</Source></div>
    </section>
    <footer className={styles.articleFooter}><div><strong>Built from the implementation</strong><span>Based on main · adf8f9e. Source links point to this revision.</span><span>Evidence: code, repository docs, checks and git history. External discussions and telemetry were not consulted.</span></div><Link href="/">Open the Preview ↗</Link></footer>
    </AgentBody>
  </article></AgentView>;
}
