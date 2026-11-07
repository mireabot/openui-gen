"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/how-to/how-to.module.css";
import { AgentBody, AgentView, ForAgentsButton } from "./agent-view";
import { GuideSelect, Source } from "./guide-parts";

type Provider = "mixed" | "fotmob";
type Failure = "none" | "feed" | "ratings";
type SearchState = "healthy" | "preferred" | "extract" | "open" | "uncited";
type ExampleLeague = "soccer" | "nfl" | "nba";

const examples = {
  soccer: { label: "Soccer", prompt: "Show the latest Chelsea vs Arsenal match, Palmer's market value history, and Chelsea's injury news.", first: "Chelsea vs Arsenal · latest meeting", second: "Cole Palmer · market value history", third: "Chelsea · latest injury context", secondRoute: "Player market values", secondDetail: "Prepared market value chart" },
  nfl: { label: "NFL", prompt: "Show the latest Chiefs vs Colts game, Mahomes' last three games, and the Chiefs' playoff outlook.", first: "Chiefs vs Colts · latest meeting", second: "Patrick Mahomes · last three games", third: "Chiefs · playoff outlook", secondRoute: "Player game log", secondDetail: "Regular-season game log + ESPN headshot" },
  nba: { label: "NBA", prompt: "Show the latest Lakers vs Clippers game, the Lakers' reported injuries, and who won the 2025 NBA title.", first: "Lakers vs Clippers · latest meeting", second: "Lakers · reported injuries", third: "2025 NBA champion", secondRoute: "Reported injuries", secondDetail: "Injury records + ESPN headshots" },
} satisfies Record<ExampleLeague, { label: string; prompt: string; first: string; second: string; third: string; secondRoute: string; secondDetail: string }>;

const stages = [
  { name: "Plan", title: "One request becomes answerable questions.", text: "The planner identifies the subject and creates 1 to 5 questions. Each gets a stable ID and keeps the team, competition, period, and count the user requested.", note: "Web questions get 2 or 3 keyword queries before research starts.", file: "src/sports/plan.ts", line: 107 },
  { name: "Route", title: "Each question starts on its own route.", text: "A question uses a structured feed, a soccer market value lookup, or web research. All questions start concurrently. NFL and NBA always use ESPN for structured feeds.", note: "The provider setting changes soccer feeds. Try another sport to see which routes stay the same.", file: "src/sports/feeds.ts", line: 17 },
  { name: "Collect", title: "Answers meet at the question ID.", text: "The server waits for all questions and collects each result under answers.q1, answers.q2, and so on. Each answer carries its status and source attribution.", note: "A failed feed becomes unavailable while the other answers remain. It does not trigger another source call.", file: "src/sports/research.ts", line: 196 },
  { name: "Prepare", title: "Collected answers become a screen dataset.", text: "The designer shapes complete answers into component fields and values for the sports in the plan. The server validates them, fills photos and team marks, and removes repeated facts.", note: "Prepared soccer market value charts and recent scorers skip model shaping. NFL and NBA keep ESPN player photos.", file: "src/sports/dataset.ts", line: 188 },
  { name: "Hand off", title: "The writer starts with saved data.", text: "The server saves and emits the dataset first. The writer receives the request, required question IDs, and a compact preview of values. It composes a screen with references to that dataset.", note: "The writer makes no research calls. Follow-ups research only revised or added questions.", file: "src/sports/ask.ts", line: 89 },
];

function PipelineWalkthrough({ provider, setProvider }: { provider: Provider; setProvider: (provider: Provider) => void }) {
  const [step, setStep] = useState(0);
  const [failure, setFailure] = useState<Failure>("none");
  const [league, setLeague] = useState<ExampleLeague>("soccer");
  const example = examples[league];
  const soccer = league === "soccer";
  const current = stages[step]!;
  const feed = soccer && provider === "fotmob" ? "FotMob" : "ESPN";
  const questions = [
    { id: "q1", text: example.first, kind: "Structured match", provider: feed, detail: soccer ? failure === "ratings" ? "Match kept · no ratings" : "Match + optional FotMob ratings" : "Scores by period + box scores", status: failure === "feed" ? "unavailable" : "complete" },
    { id: "q2", text: example.second, kind: example.secondRoute, provider: soccer ? "FotMob" : "ESPN", detail: example.secondDetail, status: "complete" },
    { id: "q3", text: example.third, kind: "Cited web research", provider: "Parallel + reader", detail: "Finding with matched citation", status: "complete" },
  ];
  return <section id="walkthrough" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>01 / THE WHOLE REQUEST</span><h2>Follow the data.</h2></div><span className={styles.quiet}>Step through the same request</span></div>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <span className={styles.demoTitle}><span className={styles.statusDot} /> Pipeline explorer <small>Illustrative run</small></span>
        <label className={styles.selectLabel}>Example <GuideSelect value={league} onChange={event => { const value = event.target.value; if (value === "soccer" || value === "nfl" || value === "nba") { setLeague(value); setFailure("none"); } }}>{Object.entries(examples).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</GuideSelect></label>
        <label className={styles.selectLabel}>Soccer provider <GuideSelect value={provider} onChange={event => { if (event.target.value === "mixed" || event.target.value === "fotmob") setProvider(event.target.value); }}><option value="mixed">mixed · default</option><option value="fotmob">fotmob</option></GuideSelect></label>
      </div>
      <div className={styles.stepper}>{stages.map((stage, index) => <button key={stage.name} type="button" aria-pressed={step === index} data-active={step === index} data-done={index < step} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, "0")}</span>{stage.name}</button>)}</div>
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene} data-step={step}>
          <div className={styles.promptNode}><span className={styles.nodeOverline}>USER REQUEST</span><p>{example.prompt}</p></div>
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
          <div className={styles.sceneCaption}>Illustrative run. {soccer ? "The provider setting changes soccer's structured feed." : "NFL and NBA stay on ESPN in either provider mode."}</div>
        </div>
        <aside className={styles.stageAnnotation}><span className={styles.annotationNumber}>{String(step + 1).padStart(2, "0")}</span><h3>{current.title}</h3><p>{current.text}</p><div className={styles.annotationNote}>{current.note}</div><Source file={current.file} line={current.line}>Read this stage in the code</Source></aside>
      </div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try an outcome <GuideSelect value={failure} onChange={event => { const value = event.target.value; if (value === "none" || value === "feed" || value === "ratings") { setFailure(value); setStep(Math.max(step, 2)); } }}><option value="none">All sources available</option><option value="feed">Feed request fails</option>{soccer && <option value="ratings">Match ratings missing</option>}</GuideSelect></label><div className={styles.stageControls}><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button><button type="button" className={styles.primaryButton} onClick={() => setStep(step === stages.length - 1 ? 0 : step + 1)}>{step === stages.length - 1 ? "Start again ↺" : "Next stage →"}</button></div></div>
    </div>
  </section>;
}

function Routing({ provider, setProvider }: { provider: Provider; setProvider: (provider: Provider) => void }) {
  return <section id="routing" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>02 / THE ROUTING DECISION</span><h2>The league chooses the API layer.</h2></div></div>
    <p className={styles.sectionIntro}>The planner identifies the league for each question. Soccer can use ESPN and FotMob. Other supported leagues use ESPN.</p>
    <div className={styles.routeSettings}><span>Soccer feed provider</span><div className={styles.segmented}>{(["mixed", "fotmob"] satisfies Provider[]).map(mode => <button type="button" key={mode} aria-pressed={provider === mode} data-active={provider === mode} onClick={() => setProvider(mode)}>{mode}{mode === "mixed" && <small>default</small>}</button>)}</div></div>
    <div className={styles.routingDiagram}>
      <div className={styles.routeRequest}><span className={styles.nodeOverline}>INPUT</span><strong>User request</strong><span>Plan the questions this screen needs to answer</span></div>
      <div className={styles.routeStem}><span>For each question</span></div>
      <div className={styles.routeDecision}><div><span className={styles.nodeOverline}>DECISION</span><strong>Which league?</strong></div></div>
      <div className={styles.leagueBranches}>
        <div className={styles.leagueBranch}>
          <div className={styles.leagueLabel}><span>Soccer</span><small>Premier League, LaLiga, and supported competitions</small></div>
          <div className={styles.apiLayer}>
            <span className={styles.nodeOverline}>SOCCER API LAYER</span>
            <div className={styles.soccerApis}>
              <div className={styles.apiNode} data-enabled={provider === "mixed"}><span className={styles.apiName}><i />ESPN</span><p>Tables, fixtures, results, and match data</p><small>{provider === "mixed" ? "Structured feed provider" : "Replaced by FotMob in this mode"}</small></div>
              <div className={styles.apiNode} data-enabled="true"><span className={styles.apiName}><i />FotMob</span><p>{provider === "mixed" ? "Player values, photos, and optional match ratings" : "Structured feeds, player values, photos, and ratings"}</p><small>{provider === "mixed" ? "Player data + enrichment" : "Feeds + player data"}</small></div>
            </div>
          </div>
        </div>
        <div className={styles.leagueBranch}>
          <div className={styles.leagueLabel}><span>Other supported leagues</span><small>NFL · NBA</small></div>
          <div className={styles.apiLayer}>
            <span className={styles.nodeOverline}>SHARED ESPN API LAYER</span>
            <div className={styles.apiNode} data-enabled="true"><span className={styles.apiName}><i />ESPN</span><p>Games, standings, box scores, rosters, injuries, and player statistics</p><small>Generic adapter · ESPN headshots</small></div>
            <p className={styles.apiLayerNote}>ESPN in both provider modes</p>
          </div>
        </div>
      </div>
      <div className={styles.routeMerge}><span>Normalize feed results</span></div>
      <div className={styles.routeAnswer}><span className={styles.nodeOverline}>SHARED OUTPUT</span><strong>Answers by question ID</strong><code>answers.q1 · answers.q2 · answers.q3</code></div>
      <div className={styles.webRoute}><div><span className={styles.nodeOverline}>ANY LEAGUE · OUTSIDE FEED COVERAGE</span><p>The planner routes news, context, and uncovered facts to web research.</p></div><span className={styles.webRouteArrow}>→</span><div><strong>Parallel + reader</strong><small>Cited answer in the same output</small></div></div>
    </div>
    <details className={styles.detail}><summary>Feed coverage by question <span>+</span></summary><div className={styles.routingTableWrap}><table className={styles.routingTable}><thead><tr><th>What the question needs</th><th>Who answers</th><th>What happens next</th></tr></thead><tbody>
      <tr><td><strong>Structured soccer</strong><span>Tables, fixtures, results, match reports, leaders, and recent scorers within supported competitions</span></td><td><span className={styles.providerBadge}>{provider === "mixed" ? "ESPN" : "FotMob"}</span></td><td>Normalized values enter collection. A match can receive optional FotMob ratings.</td></tr>
      <tr><td><strong>NFL and NBA</strong><span>Games, standings, leaders, team statistics, rosters, reported injuries, player statistics, and game logs</span></td><td><span className={styles.providerBadge}>ESPN</span></td><td>One generic adapter reads both leagues. Headshots come from ESPN. FotMob is not used.</td></tr>
      <tr><td><strong>Soccer player market values</strong><span>A dedicated player question in either provider mode</span></td><td><span className={styles.providerBadge}>FotMob</span></td><td>A prepared chart enters collection. Soccer identity and photo lookups also use FotMob.</td></tr>
      <tr><td><strong>Context and uncovered data</strong><span>Soccer injuries, transfers, news, playoff champions, unsupported competitions, and facts beyond feed coverage</span></td><td><span className={styles.providerBadge}>Parallel + reader</span></td><td>Search and page excerpts become a cited finding, then an answer record.</td></tr>
    </tbody></table></div></details>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>Provider selection happens before the call.</strong><p>A failed structured feed becomes unavailable. It does not switch providers or start a web search. Missing optional soccer ratings leave the base match intact.</p></div></div>
    <details className={styles.detail}><summary>What the source tag means <span>+</span></summary><p>The internal <code>{'source: "espn"'}</code> tag identifies a structured question. FotMob can answer it for soccer in <code>fotmob</code> mode. The snapshot source label is also coarse. Read each answer&apos;s source attribution to identify the provider.</p><Source file="src/sports/feeds.ts" line={17}>Provider selection</Source><Source file="src/sports/plan.ts" line={90}>Planning rules</Source></details>
    <details className={styles.detail} open><summary>What the league registry controls <span>+</span></summary><p><code>LEAGUE_CONFIG</code> supplies paths, supported feeds, season rules, default clocks, preferred statistics, research domains, and photo sources. The planner derives its league instructions from this configuration. Soccer keeps its existing presenter. NFL and NBA share <code>espn-generic.ts</code>.</p><div className={styles.routingTableWrap}><table className={styles.routingTable}><thead><tr><th>League</th><th>ESPN season year</th><th>Default game clock</th></tr></thead><tbody><tr><td>Soccer</td><td>Start year. 2025 is 2025/26.</td><td>Europe/London</td></tr><tr><td>NBA</td><td>End year. 2026 is 2025-26.</td><td>America/New_York</td></tr><tr><td>NFL</td><td>Season year. 2025 is 2025.</td><td>America/New_York</td></tr></tbody></table></div><p>The request&apos;s time zone sets the planner&apos;s date and game-card clock. Without it, the planner uses UTC and cards use the league default. Web research still uses the UTC date.</p><p>A domestic soccer table can name the league winner. NFL and NBA champions come from playoffs, so champion questions use web research. Knockout soccer cup winners also use the web.</p><Source file="src/sports/leagues.ts" line={55}>League configuration</Source><Source file="src/sports/plan.ts" line={156}>Planner date</Source></details>
  </section>;
}

const searchNotes: Record<SearchState, { title: string; text: string }> = {
  healthy: { title: "Two searches. One question.", text: "Both Search calls receive the same 2 or 3 keyword queries. Preferred results lead, exact duplicate URLs are removed, and readable pages form the evidence for the reader." },
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
    <p className={styles.sectionIntro}>Each web question starts two searches together. Preferred domains follow the subject&apos;s league. NBA uses ESPN, NBA, and Basketball Reference. NFL uses ESPN, NFL, and Pro Football Reference. This example shows soccer.</p>
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
    <div className={styles.sourceRow}><Source file="src/research/parallel-research.ts" line={64}>Search orchestration</Source><Source file="src/sports/research.ts" line={46}>Citation gate</Source><Source file="src/sports/research.ts" line={144}>League research sources</Source></div>
    <details className={styles.detail}><summary>What multiple searches means here <span>+</span></summary><p>A normal sports web question makes two Search HTTP requests, each containing all of its 2 or 3 planned queries. Two web questions therefore normally make four Search requests, plus up to one Extract request per question. URL deduplication happens inside each question. The reader&apos;s structured-output retry can regenerate a finding, but it does not rerun the searches.</p></details>
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
        <div><span>02</span><section><h3>Validate and enrich</h3><p>Repair small schema slips. Keep valid raw answers for rejected designs. Preserve ESPN headshots for NFL and NBA. Resolve soccer players with FotMob, fill team marks, and remove repeated facts.</p></section></div>
        <div><span>03</span><section><h3>Save, then write</h3><p>Store the fields and values under the run ID. Emit the dataset before composition starts. The compiler gives the screen its dataset query.</p></section></div>
      </div>
      <div className={styles.contractPanel}>
        <div className={styles.contractTabs}><button type="button" aria-pressed={tab === "snapshot"} data-active={tab === "snapshot"} onClick={() => setTab("snapshot")}>Saved dataset</button><button type="button" aria-pressed={tab === "writer"} data-active={tab === "writer"} onClick={() => setTab("writer")}>Writer receives</button></div>
        <div className={styles.contractBody}>{tab === "snapshot" ? <><div className={styles.codeTitle}>sports_dataset · shape example</div><pre><code>{`{\n  values: {\n    answers: { q1, q2, q3 },\n    clubs: [...],\n    players: [...]\n  },\n  fields: [...],\n  asOf: "...",\n  source: "mixed"\n}`}</code></pre><p>The snapshot holds prepared values. Team and player lists appear when available. Raw fallbacks have list limits.</p></> : <><div className={styles.codeTitle}>Composition brief</div><ul><li>The user&apos;s request</li><li>Required question IDs and statuses</li><li>A compact preview of the answer values</li><li>Component contracts and source footnote rules</li></ul><div className={styles.codeLine}><code>d.answers.q1</code><span>Read saved values</span></div><p>The compiler supplies <code>{'Query("sports_dataset", …)'}</code>. The writer references data paths. Web attribution reaches it as source text, not the full article URL list.</p></>}</div>
      </div>
    </div>
    <div className={styles.sourceRow}><Source file="src/sports/dataset.ts" line={188}>Dataset preparation</Source><Source file="src/sports/ask.ts" line={165}>Enrichment and collection</Source><Source file="src/sports/screen.ts" line={101}>Writer brief</Source></div>
    <details className={styles.detail}><summary>How NFL and NBA records fit components <span>+</span></summary><p>The generic adapter reads box-score and game-log cells by position. NFL columns can repeat labels such as <code>YDS</code> for different statistics. <code>RecordTable</code> keeps at most 7 statistic columns. Match records keep scores by period. Season results fit <code>FixturesHeatmap</code>, and athlete careers fit <code>ClubTimeline</code>.</p><p>The designer receives contracts for the sports in the plan. These feed records remain eligible for model shaping. Only prepared soccer market value charts and recent scorers bypass that step.</p><Source file="src/sports/espn-generic.ts" line={78}>Table columns</Source><Source file="src/sports/dataset.ts" line={191}>Design eligibility</Source></details>
    <details className={styles.detail}><summary>What a follow-up researches <span>+</span></summary><p>Kept questions retain their saved answers and screen parts. Only revised or added questions run through research and dataset preparation. Saved team lists keep their order so existing indexed references still identify the same team.</p><Source file="src/sports/ask.ts" line={105}>Follow-up reuse</Source></details>
    <details className={styles.detail}><summary>What checks the final screen? <span>+</span></summary><p>The compiler admits valid streamed statements, checks which questions their data references cover, and can request one repair round. It adds deterministic fallback parts for uncovered questions. An unavailable question must show its note. This is a presentation fallback after research, not another source lookup.</p><Source file="src/lang/compiler.ts" line={144}>Compiler coverage and fallback</Source></details>
  </section>;
}

export function DataAggregationGuide({ markdown }: { markdown: string }) {
  const [provider, setProvider] = useState<Provider>("mixed");
  return <AgentView><article className={styles.article}>
    <div className={styles.breadcrumb}><Link href="/how-to">How to</Link><span>/</span><span>Data aggregation</span></div>
    <header className={styles.articleHeader}><div className={styles.eyebrow}><span className={styles.accentRule} /> PROCESS 01 / FROM REQUEST TO DATASET</div><div className={styles.titleRow}><h1>How the data<br />gets to the writer.</h1><ForAgentsButton /></div><p className={styles.lead}>Soccer, NFL, and NBA use one question-based pipeline. League settings choose the feeds. The answers become one saved dataset before the writer composes a screen.</p><div className={styles.headerMeta}><span>Soccer</span><span>NFL</span><span>NBA</span><i /><span>Interactive system guide</span></div></header>
    <AgentBody markdown={markdown} file="data-aggregation.md">
    <PipelineWalkthrough provider={provider} setProvider={setProvider} />
    <Routing provider={provider} setProvider={setProvider} />
    <WebResearch />
    <WriterHandoff />
    <section id="recovery" className={styles.section}>
      <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>05 / FAILURE AND RECOVERY</span><h2>A gap stays visible.</h2></div></div>
      <p className={styles.sectionIntro}>Each stage has its own recovery rule. Dataset and composition recovery make no new source calls.</p>
      <div className={styles.recoveryGrid}>
        <div><span className={styles.recoveryLabel}>RESEARCH</span><h3>One question fails</h3><p>Keep the other answers. Mark the failed question unavailable with a note. An empty but valid feed can still be a complete answer.</p></div>
        <div><span className={styles.recoveryLabel}>ENRICHMENT</span><h3>Ratings are missing</h3><p>Keep the match. Optional FotMob ratings can be omitted without losing the base answer.</p></div>
        <div><span className={styles.recoveryLabel}>DATASET</span><h3>A design has a mistake</h3><p>Repair small slips in place. A failed design keeps that question&apos;s validated raw answer. If no returned design is usable, regenerate once. Invalid raw data makes the question unavailable.</p></div>
        <div><span className={styles.recoveryLabel}>COMPOSITION</span><h3>A question is uncovered</h3><p>Let the writer repair it, then use a deterministic fallback part if needed. The saved data remains available.</p></div>
      </div>
    </section>
    <section className={styles.evidenceSection}>
      <div><span className={styles.sectionIndex}>WHY THIS SHAPE</span><h2>League rules change. The pipeline stays shared.</h2><p>The registry comment puts league differences in configuration. The planner comment says routing text comes from that registry so a new league does not require another prompt. A new sport still needs response fixtures and behavior checks.</p><p>The dataset code states that a schema mistake should cost polish, not the screen. The research code says failed or uncited answers should report a gap instead of inventing data. Per-question routing lets one screen combine feed statistics and web context, and most failures stay with their own question.</p><p>The repository does not explain why <code>mixed</code> is the default or why the search limits have their exact values.</p><Source file="src/sports/leagues.ts" line={1}>Registry intent</Source><Source file="src/sports/plan.ts" line={71}>Generated routing rules</Source><Source file="src/sports/dataset.ts" line={13}>Dataset recovery intent</Source><Source file="src/sports/research.ts" line={16}>Research recovery intent</Source></div>
    </section>
    <footer className={styles.articleFooter}><div><strong>Built from the local implementation</strong><span>unified-sports-aggregation · Source links point to main.</span><span>Checks cover 8 soccer and 24 NFL/NBA feed cases with recorded responses and scripted model replies. They make no live provider calls.</span><span>Evidence includes repository docs and git history. External discussions and telemetry were not consulted.</span></div><Link href="/">Open the Preview ↗</Link></footer>
    </AgentBody>
  </article></AgentView>;
}
