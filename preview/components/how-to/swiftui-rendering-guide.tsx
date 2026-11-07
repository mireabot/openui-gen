"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "@/app/how-to/how-to.module.css";
import { OpenUIPreview } from "@/components/primitives/openui-render";
import type { ExampleTheme } from "@/components/catalog/custom/openui-example";
import { AgentBody, AgentView, ForAgentsButton } from "./agent-view";
import { GuideSelect, Source } from "./guide-parts";

const IOS = "ios/OpenUIGen/GenUI/";
const COMPILER = `${IOS}Core/OpenUI/OpenUICompiler.swift`;
const RUNTIME = `${IOS}Runtime/GenUIOpenUIRuntime.swift`;
const SCENE = `${IOS}Renderer/Entry/OpenUISceneView.swift`;
const NODE = `${IOS}Renderer/Node/PrimitiveNodeView.swift`;
const LAYOUT = `${IOS}Renderer/Primitives/LayoutPrimitives.swift`;
const QUERY = `d = Query("sports_dataset", {run: "r1"}, {})`;

const ThemeContext = createContext<ExampleTheme>({});

const scorers = { answers: { q1: { title: "Top scorers", rows: [{ name: "Haaland", goals: 24 }, { name: "Salah", goals: 19 }, { name: "Palmer", goals: 15 }] } } };

function DesignSystemPreview({ program, result = scorers, skeleton = false }: { program: string; result?: Record<string, unknown>; skeleton?: boolean }) {
  const theme = useContext(ThemeContext);
  return <OpenUIPreview program={program} seed={{ tool: "sports_dataset", args: { run: "r1" }, result }} theme={theme.theme} specs={theme.specs} isStreaming={false} skeleton={skeleton} layout="inline" />;
}

function CodeNode({ label, children, brand = false }: { label: string; children: ReactNode; brand?: boolean }) {
  return <div className={styles.codeNode}><span className={styles.nodeOverline}>{label}</span><pre data-tone={brand ? "brand" : undefined}><code>{children}</code></pre></div>;
}

function Connector({ label }: { label: string }) {
  return <div className={styles.verticalConnector}><span>{label}</span><i>↓</i></div>;
}

function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return <div className={styles.segmented}>{options.map(option => <button type="button" key={option} aria-pressed={value === option} data-active={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>;
}

function Stepper({ names, step, onStep }: { names: readonly string[]; step: number; onStep: (step: number) => void }) {
  return <div className={styles.stepper} style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}>{names.map((name, index) => <button key={name} type="button" aria-pressed={step === index} data-active={step === index} data-done={index < step} onClick={() => onStep(index)}><span>{String(index + 1).padStart(2, "0")}</span>{name}</button>)}</div>;
}

function Annotation({ step, title, text, note, children }: { step: number; title: string; text: string; note: string; children: ReactNode }) {
  return <aside className={styles.stageAnnotation}><span className={styles.annotationNumber}>{String(step + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{text}</p><div className={styles.annotationNote}>{note}</div>{children}</aside>;
}

function StageControls({ step, total, onStep, next }: { step: number; total: number; onStep: (step: number) => void; next: string }) {
  return <div className={styles.stageControls}><button type="button" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button><button type="button" className={styles.primaryButton} onClick={() => onStep(step === total - 1 ? 0 : step + 1)}>{step === total - 1 ? "Start again ↺" : next}</button></div>;
}

// 01 ---------------------------------------------------------------- the bridge

type PrimitiveName = "Text" | "Stack";

const bridgeStages = [
  { name: "Define", title: "TypeScript defines the primitive.", text: "Every primitive starts as one entry in PRIMITIVES. The entry names its props, and the key order of those props becomes the argument order in the language.", note: "Moving a prop changes the language, because Swift reads arguments by position.", file: "src/lang/primitives.ts", line: 64 },
  { name: "Export", title: "A script writes the contract.", text: "npm run openui:export writes primitives.json from that list. It keeps each primitive name and its arguments. Intent, rules and skeleton notes stay behind.", note: "XcodeGen adds the file to the app bundle as a resource. No build step runs the export.", file: "scripts/export-openui.ts", line: 27 },
  { name: "Compile", title: "The device turns a call into an element.", text: "OpenUICompiler walks the catalog arguments by index. Arguments with the role node or nodes become slots. Every other argument becomes a property.", note: "Data references resolve here, so the element holds finished values.", file: COMPILER, line: 265 },
  { name: "Retain", title: "The element gets a long-lived handle.", text: "commit stores each element in an @Observable OpenUIElementHandle. The next compile reuses that object when the kind and slot names still match.", note: "Each slot has its own @Observable handle, so a list change and a prop change are separate writes.", file: RUNTIME, line: 384 },
  { name: "Draw", title: "A string switch picks the view.", text: "OpenUIElementView passes the kind and props to PrimitiveVisual, which switches on the kind string. Containers read their slot and wrap each child in PrimitiveNodeView, which starts this step again.", note: "A kind with no case draws a red outline in debug builds and nothing in release builds.", file: NODE, line: 22 },
] as const;

const bridgeCode: Record<PrimitiveName, readonly { from: [string, string]; link: string; to: [string, string] }[]> = {
  Text: [
    { from: ["TYPESCRIPT · BUILD TIME", `P({
  name: "Text", category: "text",
  props: {
    content: copy.text(),
    role: token("type"),
    weight: opt(token("weight")),
    ink: opt(token("ink")),
  },
})`], link: "Key order becomes position", to: ["ARGUMENT ORDER", `Text(content, role, weight?, ink?, ...)`] },
    { from: ["CATALOG JSON · SHIPS WITH THE APP", `{ "name": "Text", "args": [
  { "name": "content", "role": "copy", "optional": false },
  { "name": "role", "role": "token", "token": "type", "optional": false },
  { "name": "weight", "role": "token", "token": "weight", "optional": true }
] }`], link: "Swift decodes", to: ["OPENUICATALOG", `struct OpenUIPrimitiveArgument: Decodable {
  let name: String
  let role: String
  let optional: Bool?
}`] },
    { from: ["PROGRAM STATEMENT", `pick1_title = Text(d.answers.q1.title, "title2", "semibold")`], link: "OpenUICompiler evaluates", to: ["OPENUISEMANTICELEMENT", `id: "r1:ref:pick1_title"
kind: "Text"
properties: { content: "Top scorers", role: "title2", weight: "semibold" }
slots: {}`] },
    { from: ["OPENUISESSION.COMMIT", `if let handle = registry[id], handle.kind == element.kind,
   Set(handle.slots.keys) == Set(element.slots.keys) {
  if handle.update(element) { result.updated += 1 }
  next[id] = handle
} else {
  next[id] = OpenUIElementHandle(element)
}`], link: "Stored", to: ["OPENUIELEMENTHANDLE", `@Observable class
  id, kind     fixed for its lifetime
  properties   written only when different
  slots        [:]`] },
    { from: ["PRIMITIVEVISUAL", `case "Text": TextPrimitive(props: props)`], link: "TextPrimitive body", to: ["SWIFTUI", `Text(props.string("content") ?? "—")
  .primitiveFont(
    PrimitiveTypeRole(token: props.string("role")),
    weight: Font.Weight(token: props.string("weight"))
  )`] },
  ],
  Stack: [
    { from: ["TYPESCRIPT · BUILD TIME", `P({
  name: "Stack", category: "layout",
  props: {
    axis: copy.oneOf(["v", "h", "wrap"]),
    gap: token("space"),
    children: nodes({ min: 1 }),
  },
})`], link: "Key order becomes position", to: ["ARGUMENT ORDER", `Stack(axis, gap, children, align?, justify?, ...)`] },
    { from: ["CATALOG JSON · SHIPS WITH THE APP", `{ "name": "Stack", "args": [
  { "name": "axis", "role": "copy", "optional": false },
  { "name": "gap", "role": "token", "token": "space", "optional": false },
  { "name": "children", "role": "nodes", "accepts": "any", "min": 1 }
] }`], link: "The role that matters", to: ["OPENUICOMPILER", `let isSlot = spec.role == "node" || spec.role == "nodes"`] },
    { from: ["PROGRAM STATEMENT", `pick1 = Stack("v", 8, [pick1_title, pick1_meta])`], link: "OpenUICompiler evaluates", to: ["OPENUISEMANTICELEMENT", `id: "r1:ref:pick1"
kind: "Stack"
properties: { axis: "v", gap: 8 }
slots: { children: ["r1:ref:pick1_title", "r1:ref:pick1_meta"] }`] },
    { from: ["OPENUISESSION.COMMIT", `for (name, children) in element.slots
  where handle.slots[name]?.set(children.compactMap { next[$0] }) == true {
  result.slots += 1
}`], link: "Stored", to: ["OPENUISLOTHANDLE", `@Observable class
  children   [OpenUIElementHandle]

set() writes only when the list differs by object identity.`] },
    { from: ["PRIMITIVEVISUAL", `case "Stack": StackPrimitive(props: props)`], link: "StackPrimitive body", to: ["SWIFTUI", `VStack(alignment: alignment, spacing: gap) {
  ForEach(Array(ids.enumerated()), id: \\.element) { index, id in
    PrimitiveNodeView(id: id)
  }
}`] },
  ],
};

const headerStatements = `pick1 = Stack("v", 8, [pick1_title, pick1_meta])
pick1_title = Text(d.answers.q1.title, "title2", "semibold")
pick1_meta = Text("Premier League", "footnote", null, "secondary")`;

function BridgeWalkthrough() {
  const [step, setStep] = useState(0);
  const [primitive, setPrimitive] = useState<PrimitiveName>("Text");
  const stage = bridgeStages[step]!;
  const code = bridgeCode[primitive][step]!;
  return <section id="bridge" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>01 / THE WHOLE BRIDGE</span><h2>Follow one primitive.</h2></div><span className={styles.quiet}>Compare a leaf with a container</span></div>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}>
        <span className={styles.demoTitle}><span className={styles.statusDot} /> Primitive explorer <small>Compiled output from a real session</small></span>
        <label className={styles.selectLabel}>Primitive <GuideSelect value={primitive} onChange={event => { if (event.target.value === "Text" || event.target.value === "Stack") setPrimitive(event.target.value); }}><option value="Text">Text · a leaf</option><option value="Stack">Stack · a container</option></GuideSelect></label>
      </div>
      <Stepper names={bridgeStages.map(item => item.name)} step={step} onStep={setStep} />
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene}>
          <CodeNode label={code.from[0]}>{code.from[1]}</CodeNode>
          <Connector label={code.link} />
          <CodeNode label={code.to[0]} brand>{code.to[1]}</CodeNode>
          {step === 4 && <><Connector label="Drawn with the design system" /><div className={styles.previewNode}><span className={styles.nodeOverline}>RESULT · WEB PRIMITIVE RENDERER</span><div className={styles.previewBody}><DesignSystemPreview key={primitive} program={primitive === "Text" ? `root = Screen([pick1_title])\n${QUERY}\npick1_title = Text(d.answers.q1.title, "title2", "semibold")` : `root = Screen([pick1])\n${QUERY}\n${headerStatements}`} /></div></div></>}
        </div>
        <Annotation step={step} title={stage.title} text={stage.text} note={stage.note}><Source file={stage.file} line={stage.line}>Read this stage in the code</Source></Annotation>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>Step {step + 1} of {bridgeStages.length}</span><StageControls step={step} total={bridgeStages.length} onStep={setStep} next="Next stage →" /></div>
    </div>
  </section>;
}

// 02 ---------------------------------------------------------------- the contract

type ContractCase = "valid" | "component" | "token" | "unknown" | "noCase" | "reorder";

const contractCases: Record<ContractCase, { label: string; program: string; server: { failed: boolean; title: string; text: string }; device: { failed: boolean; title: string; text: string }; noteTitle: string; note: string }> = {
  valid: { label: "A valid statement", program: `pick1_title = Text("Top scorers", "title2")`,
    server: { failed: false, title: "Admitted", text: "zod checks the arguments against the primitive schema and the real dataset values." },
    device: { failed: false, title: "Drawn", text: "content and role become properties. PrimitiveTypeRole maps title2 to a font size and line height." },
    noteTitle: "Both sides agree.", note: "The server checks meaning. The device builds structure from names and positions." },
  component: { label: "A component call", program: `pick1 = MatchCard(d.answers.q1.match)`,
    server: { failed: false, title: "Admitted as written", text: "validate expands the call with the pack's templates and checks every primitive in the expansion. The program keeps the call." },
    device: { failed: false, title: "Expanded, then drawn", text: "MatchCard is not a primitive, so the compiler looks up its template. The run's templates event carries it, and the app's bundled copy is the fallback." },
    noteTitle: "A component is data, not code.", note: "A component that only reuses existing primitives ships with no app release. A name that is neither a primitive nor a template throws unknownPrimitive." },
  token: { label: "A token that does not exist", program: `pick1_title = Text("Top scorers", "huge")`,
    server: { failed: true, title: "Rejected", text: "The token schema is a closed list, so this fails with type-mismatch on Text/role." },
    device: { failed: false, title: "Falls back with no error", text: "If this text did reach a device, Swift would store huge as a string and use the body role." },
    noteTitle: "The device receives an issue event.", note: "It never sees the rejected statement. The writer gets a chance to repair it." },
  unknown: { label: "A primitive newer than the app", program: `pick2 = Scoreboard("Arsenal", 2)`,
    server: { failed: false, title: "Admitted by a newer server", text: "A newer server knows this primitive. Nothing tells it which catalog the app shipped with." },
    device: { failed: true, title: "The whole compile throws", text: "The name is missing from the bundled catalog, so compile throws unknownPrimitive." },
    noteTitle: "The screen stays at its last good state.", note: "One unknown name stops the commit for the entire program, not only that element." },
  noCase: { label: "A catalog entry with no Swift case", program: `pick2 = NewChart(d.answers.q1.rows)`,
    server: { failed: false, title: "Admitted", text: "The server checks the catalog entry and has no knowledge of the Swift switch." },
    device: { failed: true, title: "A red outline or nothing", text: "The compiler creates the element. PrimitiveVisual reaches its default case and draws UnknownPrimitive." },
    noteTitle: "This fails quietly in release builds.", note: "The rest of the screen draws normally, with a gap where this element should be." },
  reorder: { label: "An argument moved after the app shipped", program: `// New server order: Text(role, content)\npick1_title = Text("title2", "Top scorers")`,
    server: { failed: false, title: "Admitted", text: "The statement matches the new definition on the server." },
    device: { failed: true, title: "Wrong prop, no error", text: "The old catalog assigns title2 to content and Top scorers to role." },
    noteTitle: "Argument order is the API.", note: "The screen shows the wrong text in the fallback font, and nothing reports it." },
};

function Contract() {
  const [selected, setSelected] = useState<ContractCase>("valid");
  const current = contractCases[selected];
  return <section id="contract" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>02 / THE CONTRACT</span><h2>The catalog carries positions.</h2></div></div>
    <p className={styles.sectionIntro}>The catalog holds more than Swift uses. Primitive names, argument order and the slot role change behavior on the device. Token values, enums and data shapes are enforced only on the server. Component templates are not in the primitive catalog: they arrive with each run.</p>
    <div className={styles.researchDemo}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}>Who catches what</span><span className={styles.quiet}>One statement, two compilers</span></div>
      <div className={styles.searchScene}>
        <div className={styles.programBundle}><CodeNode label="OPENUI LANG">{current.program}</CodeNode></div>
        <div className={styles.forkConnector}><i /><span>Read by both sides</span><i /></div>
        <div className={styles.searchBranches}>
          <div className={styles.branchNode} data-failed={current.server.failed}><span className={styles.nodeOverline}>SERVER COMPILER</span><strong>{current.server.title}</strong><p>{current.server.text}</p></div>
          <div className={styles.branchNode} data-failed={current.device.failed}><span className={styles.nodeOverline}>SWIFT COMPILER AND VIEWS</span><strong>{current.device.title}</strong><p>{current.device.text}</p></div>
        </div>
      </div>
      <div className={styles.researchAnnotation}><span>↳</span><div><strong>{current.noteTitle}</strong><p>{current.note}</p></div></div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try a statement <GuideSelect value={selected} onChange={event => setSelected(event.target.value as ContractCase)}>{(Object.keys(contractCases) as ContractCase[]).map(key => <option key={key} value={key}>{contractCases[key].label}</option>)}</GuideSelect></label></div>
    </div>
    <div className={styles.sourceRow}><Source file="scripts/export-openui.ts" line={27}>What the export keeps</Source><Source file="scripts/check-lang.ts" line={93}>Token rejection check</Source><Source file={COMPILER} line={256}>Swift compile errors</Source><Source file={NODE} line={85}>UnknownPrimitive</Source></div>
    <details className={styles.detail}><summary>How do design tokens cross? <span>+</span></summary><p>They take three routes. Token names and validation live in src/primitives/tokens.ts and stay on the server. Spacing values travel as plain numbers in the program, so Swift reads gap directly. Type sizes are copied by hand into PrimitiveTokens.swift and render.tsx. Colors and component anatomy skip TypeScript, because the app bundles design_system.json directly.</p><Source file="src/primitives/tokens.ts" line={23}>TYPE in TypeScript</Source><Source file={`${IOS}Renderer/Tokens/PrimitiveTokens.swift`} line={28}>TYPE in Swift</Source><Source file={`${IOS}Core/Theme/DesignTheme.swift`} line={163}>Bundled theme</Source></details>
  </section>;
}

// 03 ---------------------------------------------------------------- layout

type Axis = "v" | "h" | "wrap";
const gaps = ["4", "8", "16"] as const;
type Gap = (typeof gaps)[number];
type Justify = "default" | "between";

function swiftForStack(axis: Axis, gap: Gap, between: boolean): string {
  if (axis === "wrap") return `FlowLayout(spacing: ${gap}) {
  ForEach(ids, id: \\.self) { PrimitiveNodeView(id: $0) }
}`;
  if (axis === "v") return `VStack(alignment: .leading, spacing: ${gap}) {
  ForEach(Array(ids.enumerated()), id: \\.element) { index, id in
    PrimitiveNodeView(id: id)
      .frame(maxWidth: .infinity, alignment: ...)
  }
}`;
  return between ? `HStack(alignment: .center, spacing: 0) {
  // Spacers sit between the children as siblings
  PrimitiveNodeView(id: first)
  Spacer(minLength: ${gap})
  PrimitiveNodeView(id: second)
}` : `HStack(alignment: .center, spacing: ${gap}) {
  PrimitiveNodeView(id: first)
  PrimitiveNodeView(id: second)
}`;
}

const layoutTabs = {
  Wrap: { program: `Stack("wrap", 8, children)`, swift: `FlowLayout(spacing: 8) { ... }`, text: "A custom Layout. Children keep their own width and flow into rows." },
  Grid: { program: `Grid("2", 12, children)`, swift: `ColumnsLayout(columns: 2, spacing: 12, rowSpacing: nil) { ... }`, text: "A custom Layout with equal-width columns. Each row is as tall as its tallest child." },
  Between: { program: `Stack("h", 8, children, null, "between")`, swift: `HStack(spacing: 0) { child; Spacer(minLength: 8); child }`, text: "Spacers are siblings of the children, so the HStack still lets text wrap." },
} as const;
type LayoutTab = keyof typeof layoutTabs;

function Layout() {
  const [axis, setAxis] = useState<Axis>("v");
  const [gap, setGap] = useState<Gap>("8");
  const [justify, setJustify] = useState<Justify>("default");
  const [tab, setTab] = useState<LayoutTab>("Wrap");
  const between = axis === "h" && justify === "between";
  const statement = `pick2 = Stack("${axis}", ${gap}, @Each(d.answers.q1.rows, "r", Badge(r.name, "neutral"))${between ? `, null, "between"` : ""})`;
  return <section id="layout" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>03 / LAYOUT COMPOSITION</span><h2>Props choose the container.</h2></div></div>
    <p className={styles.sectionIntro}>A layout is a tree of primitives that hold slots. StackPrimitive reads axis, gap and justify, then chooses a SwiftUI container. Nothing in the program describes a frame or a position.</p>
    <div className={styles.researchDemo}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}>Stack explorer</span><span className={styles.quiet}>Rendered with design system primitives</span></div>
      <div className={styles.searchScene}>
        <CodeNode label="OPENUI LANG">{statement}</CodeNode>
        <Connector label="StackPrimitive selects" />
        <div className={styles.twoColumns}>
          <CodeNode label="SWIFTUI" brand>{swiftForStack(axis, gap, between)}</CodeNode>
          <div className={styles.previewNode}><span className={styles.nodeOverline}>RESULT · WEB PRIMITIVE RENDERER</span><div className={styles.previewBody}><DesignSystemPreview key={statement} program={`root = Screen([pick2])\n${QUERY}\n${statement}`} /></div></div>
        </div>
      </div>
      <div className={styles.demoFooter}><div className={styles.layoutControls}>
        <div>axis <Segmented options={["v", "h", "wrap"] as const} value={axis} onChange={setAxis} /></div>
        <div>gap <Segmented options={gaps} value={gap} onChange={setGap} /></div>
        {axis === "h" && <div>justify <Segmented options={["default", "between"] as const} value={justify} onChange={setJustify} /></div>}
      </div></div>
    </div>
    <div className={styles.sourceRow}><Source file={LAYOUT} line={14}>Stack axis choice</Source><Source file={`${IOS}Renderer/Layout/PrimitiveLayouts.swift`} line={1}>Custom layouts</Source></div>
    <div className={styles.handoffGrid} style={{ marginTop: 34 }}>
      <div className={styles.preparationList}>
        <div><span>01</span><section><h3>OpenUISceneView</h3><p>Removes Screen and lays its children out with the screen inset. Screen has no case in the switch.</p></section></div>
        <div><span>02</span><section><h3>OpenUIElementView</h3><p>Reads properties from the handle and builds PrimitiveProps.</p></section></div>
        <div><span>03</span><section><h3>PrimitiveVisual</h3><p>Switches on the kind string and returns the matching primitive view.</p></section></div>
        <div><span>04</span><section><h3>A container view</h3><p>Reads its child slot with childReferences, so it tracks that one list.</p></section></div>
        <div><span>05</span><section><h3>PrimitiveNodeView</h3><p>Wraps each child handle and returns to step 02 for the next level of the tree.</p></section></div>
      </div>
      <div className={styles.contractPanel}>
        <div className={styles.contractTabs}>{(Object.keys(layoutTabs) as LayoutTab[]).map(key => <button type="button" key={key} aria-pressed={tab === key} data-active={tab === key} onClick={() => setTab(key)}>{key}</button>)}</div>
        <div className={styles.contractBody}>
          <div className={styles.codeTitle}>In the program</div>
          <pre><code>{layoutTabs[tab].program}</code></pre>
          <div className={styles.codeTitle} style={{ marginTop: 18 }}>In SwiftUI</div>
          <pre><code>{layoutTabs[tab].swift}</code></pre>
          <p>{layoutTabs[tab].text}</p>
        </div>
      </div>
    </div>
    <details className={styles.detail}><summary>How does a child know about its parent? <span>+</span></summary><p>Layout context travels through the SwiftUI environment. primitiveStackAxis tells Spacer which way to grow and lets a trailing column keep its own width. primitiveBleed gives full-bleed children their reach, and a Card resets it to its own padding. primitiveRailWidth sizes items in a rail.</p><Source file={`${IOS}Renderer/Entry/PrimitiveEnvironment.swift`} line={1}>Environment values</Source><Source file={SCENE} line={62}>Screen removal</Source></details>
  </section>;
}

// 04 ---------------------------------------------------------------- complex elements

const COMPONENTS = "src/sports/components.ts";
const TIMELINE = `${IOS}Renderer/Primitives/StepTimelinePrimitive.swift`;
const CHART = "d.answers.q1.chart";

const month = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const stretch = (name: string, lineColor: string, tagColor: string, team: number, points: readonly (readonly [string, number, string])[]) => ({
  name, lineColor, tagColor, logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${team}.png`,
  points: points.map(([date, value, display]) => ({ x: Date.parse(date), label: month.format(new Date(date)), value, display })),
});
// The PlayerValue/full catalog fixture.
const palmerChart = {
  value: "€97.7M", caption: "Cole Palmer · Market value",
  segments: [
    stretch("Manchester City U18", "#69A8D8", "#69A8D8", 1113543, [["2018-12-31", 250_000, "€250k"], ["2019-12-31", 530_000, "€530k"]]),
    stretch("Manchester City", "#76b4e5", "#69A8D8", 8456, [["2020-06-30", 1_200_000, "€1.2M"], ["2022-01-31", 15_370_000, "€15.4M"], ["2022-09-30", 4_460_000, "€4.5M"], ["2023-06-30", 5_050_000, "€5.1M"]]),
    stretch("Chelsea", "#033cc1", "#051495", 8455, [["2023-09-01", 18_000_000, "€18M"], ["2024-03-31", 49_295_400, "€49.3M"], ["2024-12-31", 116_235_970, "€116.2M"], ["2025-10-01", 116_165_340, "€116.2M"], ["2026-07-01", 110_374_028, "€110.4M"], ["2026-11-01", 97_678_048, "€97.7M"]]),
  ],
  ticks: [{ value: 0, display: "€0" }, { value: 50_000_000, display: "€50M" }, { value: 100_000_000, display: "€100M" }],
};
const timelineCall = `StepTimeline(${CHART}.value, ${CHART}.segments, ${CHART}.ticks, ${CHART}.caption)`;

const templateBody = `StepTimeline(record.value, record.segments, record.ticks, record.caption)`;

const complexStages = [
  { name: "Record", title: "The server builds the record.", text: "playerValueChart turns FotMob's market values into one record. It starts a new stretch whenever the club changes. It takes the line colour from the club's dark-mode colour and the tag colour from its light-mode colour.", note: "No model writes these figures. The answer stores the record under chart, beside the question's title and source.", file: "src/sports/fotmob.ts", line: 147,
    from: ["FOTMOB · MARKET VALUES", `{ date: "2024-12-31", value: 116235970,
  teamName: "Chelsea", teamId: 8455,
  teamColor: { darkMode, lightMode } }`], link: "playerValueChart", to: ["D.ANSWERS.Q1.CHART", `{ value: "€97.7M",
  caption: "Cole Palmer · Market value",
  segments: [ { name, lineColor, tagColor, logo,
                points: [ { x, label, value, display } ] } ],
  ticks: [ { value, display } ] }`] },
  { name: "Call", title: "The writer calls the component by name.", text: "The briefing lists PlayerValue as a candidate for this answer, because the record fits its contract. The writer passes one data reference.", note: "PlayerValue takes only the record. Other components take params after it: StatsCard(record, false) hides the header card.", file: COMPONENTS, line: 468,
    from: ["WRITER STATEMENT", `palmerValue = PlayerValue(${CHART})`], link: "admit, then validate", to: ["CONTRACT · SPORTS-COMPONENTS", `value              text
caption            text
segments[]         name, lineColor, tagColor, logo
segments[].points  x, label, value, display
ticks[]            value, display`] },
  { name: "Check", title: "The server checks the expansion and keeps the call.", text: "The template is PlayerValue's build, printed once by npm run openui:export. validate expands the call with that template, then checks every primitive in the expansion. It admits the statement as the writer wrote it.", note: "zod checks every segment and point against the StepTimeline schema, with the real data. The expansion is used only for checking and for coverage. It is never sent.", file: "src/lang/compiler.ts", line: 519,
    from: ["TEMPLATE · SPORTS-COMPONENTS.JSON", `{ name: "PlayerValue",
  params: [{ name: "record", role: "data" }],
  body: "${templateBody}" }`], link: "expandCall binds record to the call's argument", to: ["CHECKED, NOT SENT", timelineCall] },
  { name: "Wire", title: "The device receives the call and its template.", text: "Before any data or program text, a templates event carries every component's template. The compiler then renames the part to pick1 and sends the call as written.", note: "done and the saved document carry the templates the program uses, so a saved screen replays with the templates it was drawn with.", file: "src/routes/sports.ts", line: 78,
    from: ["EVENT: TEMPLATES", `{ templates: [
  ...,
  { name: "PlayerValue", params, body },
  ...
] }`], link: "then the program text", to: ["EVENT: OPENUI", `pick1 = PlayerValue(${CHART})
root = Screen([pick1])`] },
  { name: "Expand", title: "The device runs the template in its own scope.", text: "OpenUICompiler finds no primitive named PlayerValue, so it looks up the template. It evaluates the argument in the caller's scope, binds the result to record in a fresh scope, and evaluates the body there.", note: "The body mounts where the call sits, so the id is r1:ref:pick1, the same as for the expanded program. The fresh scope holds only the template's parameters, so a caller's @Each item never collides with the template's own.", file: COMPILER, line: 225,
    from: ["OPENUICOMPILER.EXPAND", `var scope = Context()
scope.aliases["record"] = evaluate(${CHART})
return evaluate(template.body, mount: mount, context: scope)`], link: "Evaluated like any primitive", to: ["OPENUISEMANTICELEMENT", `id: "r1:ref:pick1"
kind: "StepTimeline"
properties: {
  value: "€97.7M",
  segments: [ 3 stretches, 12 points ],
  ticks: [ €0, €50M, €100M ],
  caption: "Cole Palmer · Market value" }
slots: {}`] },
  { name: "Draw", title: "One Swift view draws the whole chart.", text: "PrimitiveVisual switches on StepTimeline and returns StepTimelinePrimitive. The view turns segments into stretches, then draws the header, the stepped lines, the crests, the dot and the price axis.", note: "The element has no slots, so it is one handle. The scrub selection is @State inside that view, and a commit with new values keeps it.", file: TIMELINE, line: 11,
    from: ["PRIMITIVEVISUAL", `case "StepTimeline": StepTimelinePrimitive(props: props)`], link: "StepTimelinePrimitive body", to: ["SWIFTUI", `VStack(alignment: .leading, spacing: 12) {
  header(stretches)      // value, caption, scrub readout
  plot(stretches, ...)   // lines, crests, dot, axis
}
.sensoryFeedback(.selection, trigger: selected?.id)`] },
] as const;

type TimelineField = "value" | "caption" | "name" | "lineColor" | "tagColor" | "logo" | "x" | "label" | "point" | "display" | "ticks";
const timelineFields: Record<TimelineField, { label: string; path: string; sample: string; reader: string; swift: string; draws: string; line: number }> = {
  value: { label: "value", path: "value", sample: `"€97.7M"`, reader: "header", swift: `Text(props.string("value") ?? "")\n  .primitiveFont(.title1, weight: .semibold)`, draws: "The current value at the top left. With fewer than two points, the view draws only this text.", line: 104 },
  caption: { label: "caption", path: "caption", sample: `"Cole Palmer · Market value"`, reader: "header", swift: `if let caption = props.string("caption"), !caption.isEmpty {\n  Text(caption).primitiveFont(.footnote)\n}`, draws: "One footnote line under the value, in secondary ink. An empty caption draws nothing.", line: 104 },
  name: { label: "segments[].name", path: "segments[2].name", sample: `"Chelsea"`, reader: "stretches", swift: `Stretch(name: item["name"]?.stringValue ?? "", ...)`, draws: "The club name at the top right, only while the finger scrubs that stretch.", line: 71 },
  lineColor: { label: "segments[].lineColor", path: "segments[2].lineColor", sample: `"#033cc1"`, reader: "stretches", swift: `line: color(item["lineColor"]) ?? palette.ink("primary")`, draws: "The stretch's line, its dot and its name while scrubbing. A value that does not start with # falls back to primary ink.", line: 71 },
  tagColor: { label: "segments[].tagColor", path: "segments[2].tagColor", sample: `"#051495"`, reader: "stretches", swift: `tag: color(item["tagColor"]) ?? palette.color(token: "surface.brand")`, draws: "The tag behind the scrubbed value, with white text on it.", line: 71 },
  logo: { label: "segments[].logo", path: "segments[2].logo", sample: `".../teamlogo/8455.png"`, reader: "crest", swift: `if right - left >= Self.crest,\n   let url = PrimitiveImages.url(stretch.logo, base: base) {\n  LazyImage(url: url) { ... }.frame(width: 20, height: 20)\n}`, draws: "A 20-point crest centred on its stretch, 4 points above its highest value. A stretch narrower than 20 points gets no crest.", line: 239 },
  x: { label: "points[].x", path: "segments[2].points[2].x", sample: "1735603200000", reader: "stretches", swift: `date: Date(timeIntervalSince1970: x / 1000)`, draws: "The horizontal position. The scrub snaps to the point nearest in time to the finger.", line: 71 },
  label: { label: "points[].label", path: "segments[2].points[2].label", sample: `"Dec 2024"`, reader: "header", swift: `Text(reading.label)\n  .foregroundStyle(palette.ink("secondary"))`, draws: "The date under the club name while scrubbing. The chart has no date axis.", line: 104 },
  point: { label: "points[].value", path: "segments[2].points[2].value", sample: "116235970", reader: "plot", swift: `top: max(readings.map(\\.value).max() ?? 1, 1)\n// y(for:) maps 0...top into the plot`, draws: "The height of the line. The y axis starts at zero, and the highest value sets the top.", line: 146 },
  display: { label: "points[].display", path: "segments[2].points[2].display", sample: `"€116.2M"`, reader: "header", swift: `Text(reading.display)\n  .foregroundStyle(.white)\n  .background(stretch.tag, in: .rect(cornerRadius: 4))`, draws: "The scrubbed value, on the tag colour.", line: 104 },
  ticks: { label: "ticks[]", path: "ticks", sample: `[{ value: 0, display: "€0" }, ...]`, reader: "axis", swift: `ForEach(ticks) { tick in\n  Text(tick.display).position(x: ..., y: plot.y(for: tick.value))\n}`, draws: "Price labels at the trailing edge, level with their values. This is the only axis.", line: 259 },
};

function ComplexElements() {
  const [step, setStep] = useState(0);
  const [field, setField] = useState<TimelineField>("lineColor");
  const stage = complexStages[step]!;
  const mapped = timelineFields[field];
  return <section id="complex" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>04 / COMPLEX ELEMENTS</span><h2>A component travels by name and expands on the device.</h2></div><span className={styles.quiet}>PlayerValue, end to end</span></div>
    <p className={styles.sectionIntro}>The writer calls Sports components such as PlayerValue by name, and the program keeps the call on the wire. Each component's template, an OpenUI Lang body over its parameters, travels as data. The device expands the call before it builds elements, so it still draws only primitives. Most templates are a tree of primitives inside a Card or a Stack. PlayerValue's template is a single data primitive, StepTimeline, and its complexity lives in one Swift view.</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}><span className={styles.statusDot} /> Component mapper <small>PlayerValue/full catalog fixture</small></span><span className={styles.labelPill}>call → template → SwiftUI</span></div>
      <Stepper names={complexStages.map(item => item.name)} step={step} onStep={setStep} />
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene}>
          <CodeNode label={stage.from[0]}>{stage.from[1]}</CodeNode>
          <Connector label={stage.link} />
          <CodeNode label={stage.to[0]} brand>{stage.to[1]}</CodeNode>
          {step === complexStages.length - 1 && <><Connector label="Drawn with the design system" /><div className={styles.previewNode}><span className={styles.nodeOverline}>RESULT · WEB PRIMITIVE RENDERER</span><div className={styles.previewBody}><DesignSystemPreview program={`root = Screen([pick1])\n${QUERY}\npick1 = PlayerValue(${CHART})`} result={{ answers: { q1: { chart: palmerChart } } }} /></div></div></>}
        </div>
        <Annotation step={step} title={stage.title} text={stage.text} note={stage.note}><Source file={stage.file} line={stage.line}>Read this stage in the code</Source></Annotation>
      </div>
      <div className={styles.demoFooter}><span className={styles.quiet}>Step {step + 1} of {complexStages.length}</span><StageControls step={step} total={complexStages.length} onStep={setStep} next="Next stage →" /></div>
    </div>
    <h3 className={styles.subHeading}>Map one field from the record to the screen</h3>
    <div className={styles.researchDemo}>
      <div className={styles.demoToolbar}><label className={styles.selectLabel}>Field <GuideSelect value={field} onChange={event => setField(event.target.value as TimelineField)}>{(Object.keys(timelineFields) as TimelineField[]).map(key => <option key={key} value={key}>{timelineFields[key].label}</option>)}</GuideSelect></label><span className={styles.quiet}>Read by {mapped.reader}()</span></div>
      <div className={styles.searchScene}>
        <CodeNode label="IN THE RECORD">{`${CHART}.${mapped.path} = ${mapped.sample}`}</CodeNode>
        <Connector label={mapped.path.startsWith("ticks") || ["value", "caption"].includes(mapped.path) ? `StepTimeline.${mapped.path.split("[")[0]}` : "StepTimeline.segments, one item per stretch"} />
        <div className={styles.twoColumns}>
          <CodeNode label={`STEPTIMELINEPRIMITIVE · ${mapped.reader.toUpperCase()}()`} brand>{mapped.swift}</CodeNode>
          <div className={styles.branchNode}><span className={styles.nodeOverline}>ON SCREEN</span><strong>What it draws</strong><p>{mapped.draws}</p></div>
        </div>
      </div>
      <div className={styles.demoFooter}><Source file={TIMELINE} line={mapped.line}>Read {mapped.reader}() in Swift</Source></div>
    </div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>To add a complex element, decide where its complexity lives.</strong><p>If existing primitives can draw it, write the component as a build that returns a tree. npm run openui:export prints the build as its template, and the template reaches devices with the next run, with no app release. If it needs new drawing or gestures, such as the stepped line and the scrub, add a primitive to PRIMITIVES, export the catalog and add a Swift case. The component then becomes a thin template over that primitive.</p></div></div>
    <div className={styles.sourceRow}><Source file={COMPONENTS} line={489}>PlayerValue build</Source><Source file="src/lang/templates.ts" line={79}>Server and web expander</Source><Source file={COMPILER} line={225}>Swift template scope</Source><Source file="src/lang/primitives.ts" line={319}>StepTimeline props</Source><Source file={NODE} line={58}>StepTimeline case</Source></div>
  </section>;
}

// 05 ---------------------------------------------------------------- streaming

type StreamOutcome = "normal" | "drop" | "older";
interface Commit { created: number; updated: number; slots: number; removed: number; root: boolean }
interface StreamStep {
  name: string; event: string; title: string; text: string; add?: readonly string[]; replace?: readonly string[];
  commit: Commit; pending: number; blocks: number; phase: string; rejected?: boolean; error?: string;
}
const zero: Commit = { created: 0, updated: 0, slots: 0, removed: 0, root: false };
const opening = [QUERY, `root = Screen([])`];
const partOne = [`pick1 = Stack("v", 8, [pick1_title, pick1_meta])`, `pick1_title = Text(d.answers.q1.title, "title2", "semibold")`, `pick1_meta = Text("Premier League", "footnote")`, `root = Screen([pick1])`];
const partTwo = [`pick2 = Stack("v", 8, @Each(d.answers.q1.rows, "r", Text(r.name, "body")))`, `root = Screen([pick1, pick2])`];
const finalProgram = [`root = Screen([pick1, pick2])`, QUERY, ...partOne.slice(0, 3), partTwo[0]!];
const pendingProgram = `root = Screen([p])\n${QUERY}\np = Stack("v", 8, [Text("Loading title", "title2"), Text("Loading detail", "body"), Text("Loading note", "footnote")])`;

const baseSteps: readonly StreamStep[] = [
  { name: "templates", event: `event: templates\n{ templates: [{ name, params, body }, ...] }`, title: "Component templates arrive first.", text: "The server sends every component's template before any data or program text. The session compiles with them from now on, in place of the copy bundled with the app.", commit: zero, pending: 0, blocks: 0, phase: "loading" },
  { name: "data", event: `event: data\n{ tool, args: { run: "r1" }, result, fields, asOf, source }`, title: "The dataset arrives first.", text: "The server saves the snapshot, then sends all of it. The session stores it and adopts the run as its document key. There is no program yet, so nothing compiles.", commit: zero, pending: 0, blocks: 0, phase: "loading" },
  { name: "skeleton", event: `event: skeleton\n{ gap, inset, blocks: [frame, frame] }`, title: "The skeleton predicts the shape.", text: "The server builds these frames from fallback parts for each question, just before the writer starts. They are a forecast. The writer can return a different number of parts.", commit: zero, pending: 2, blocks: 0, phase: "loading" },
  { name: "opening", event: `event: openui\n{ text: "d = Query(...)\\nroot = Screen([])\\n" }`, title: "An empty screen compiles.", text: "The session appends the text and compiles everything it has. Screen is the one element, and it has no drawing of its own.", add: opening, commit: { ...zero, created: 1, root: true }, pending: 2, blocks: 0, phase: "loading" },
  { name: "part 1", event: `event: openui\n{ text: "pick1 = ...\\npick1_title = ...\\npick1_meta = ...\\nroot = Screen([pick1])\\n" }`, title: "A finished part arrives whole.", text: "The server holds a part until every statement it references has passed validation. It then sends them together with a new root line. The parser keeps the last assignment, so the new root replaces the old one.", add: partOne, commit: { ...zero, created: 3, slots: 2 }, pending: 1, blocks: 1, phase: "loading" },
  { name: "part 2", event: `event: openui\n{ text: "pick2 = ...\\nroot = Screen([pick1, pick2])\\n" }`, title: "Only the new elements are created.", text: "The device parses all the text again. pick1 keeps its id, so its three handles survive and receive no writes. @Each adds one Stack and three Text elements.", add: partTwo, commit: { ...zero, created: 4, slots: 2 }, pending: 1, blocks: 2, phase: "loading" },
  { name: "done", event: `event: done\n{ program, run, issues, document: { id: "r1", revision: 1 } }`, title: "The final program replaces the text.", text: "done.program is the canonical order, with any fallback parts. A strict compile runs. Here every element matches, so the commit writes nothing. finish() then removes the skeleton.", replace: finalProgram, commit: zero, pending: 0, blocks: 2, phase: "ready" },
];

const streamNotes: Record<StreamOutcome, { label: string; note: string }> = {
  normal: { label: "The stream completes", note: "One frame remains after part 2. The writer may have more parts than the plan had questions, so pendingBlocks keeps the last frame until done." },
  drop: { label: "The connection ends early", note: "The bytes end without a done event, so the service throws incompleteStream. The session has content, so it calls finish() and rethrows. AskModel shows the error." },
  older: { label: "The app catalog is older", note: "Compile evaluates everything reachable from root and throws on a name that is neither a primitive nor a template. While streaming, the session logs that error and keeps the last good commit." },
};

function stepsFor(outcome: StreamOutcome): readonly StreamStep[] {
  if (outcome === "drop") return [...baseSteps.slice(0, 5), { name: "stream ends", event: `// The bytes end. No done event arrived.`, title: "The session keeps what it has.", text: "Phase becomes ready and the skeleton clears. The last commit counts stay as they were, because no new compile ran.", commit: { ...zero, created: 3, slots: 2 }, pending: 0, blocks: 1, phase: "ready", error: "incompleteStream" }];
  if (outcome === "older") return [...baseSteps.slice(0, 5),
    { name: "bad part", event: `event: openui\n{ text: "pick2 = Scoreboard(\\"x\\")\\nroot = Screen([pick1, pick2])\\n" }`, title: "The compile fails and nothing commits.", text: "The text joins the program, but the catalog has no Scoreboard. The screen and the skeleton stay where they were after part 1.", add: [`pick2 = Scoreboard("x")`, partTwo[1]!], rejected: true, commit: { ...zero, created: 3, slots: 2 }, pending: 1, blocks: 1, phase: "loading", error: "unknownPrimitive (logged)" },
    { name: "done", event: `event: done\n{ program, run, issues, document }`, title: "A valid done recovers the screen.", text: "This example assumes the final program holds a valid pick2. The strict compile succeeds and creates the four missing elements. If it failed, the session would keep the last good screen and report the error.", replace: finalProgram, commit: { ...zero, created: 4, slots: 2 }, pending: 0, blocks: 2, phase: "ready" }];
  return baseSteps;
}

function programAt(steps: readonly StreamStep[], index: number) {
  let lines: { text: string; isNew: boolean; rejected: boolean }[] = [];
  steps.slice(0, index + 1).forEach((step, stepIndex) => {
    const isCurrent = stepIndex === index;
    if (step.replace) lines = step.replace.map(text => ({ text, isNew: isCurrent, rejected: false }));
    else if (step.add) lines = [...lines, ...step.add.map(text => ({ text, isNew: isCurrent, rejected: isCurrent && !!step.rejected }))];
  });
  return lines;
}

function ScreenAt({ blocks, pending }: { blocks: number; pending: number }) {
  const program = blocks === 1 ? `root = Screen([pick1])\n${QUERY}\n${partOne.slice(0, 3).join("\n")}` : finalProgram.join("\n");
  return <div className={styles.previewBody}>
    {blocks > 0 && <DesignSystemPreview key={blocks} program={program} />}
    {Array.from({ length: pending }, (_, index) => <div key={index} className={blocks > 0 || index > 0 ? styles.pendingBlock : undefined}><DesignSystemPreview program={pendingProgram} skeleton /></div>)}
    {blocks === 0 && pending === 0 && <p className={styles.emptyPreview}>No blocks yet.</p>}
  </div>;
}

function Streaming() {
  const [outcome, setOutcome] = useState<StreamOutcome>("normal");
  const [step, setStep] = useState(0);
  const steps = stepsFor(outcome);
  const index = Math.min(step, steps.length - 1);
  const current = steps[index]!;
  const lines = programAt(steps, index);
  const lastRoot = lines.map(line => line.text.startsWith("root =")).lastIndexOf(true);
  return <section id="streaming" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>05 / STREAMING</span><h2>The wire carries program text.</h2></div><span className={styles.labelPill}>SSE</span></div>
    <p className={styles.sectionIntro}>The server never sends a tree. It sends text in chunks of complete statements, and the device parses and evaluates all of its text after each chunk. The device then compares the result with what is on screen.</p>
    <div className={styles.walkthrough}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}><span className={styles.statusDot} /> Stream player <small>Illustrative run</small></span><span className={styles.quiet}>Commit counts from the real OpenUISession</span></div>
      <Stepper names={steps.map(item => item.name)} step={index} onStep={setStep} />
      <div className={styles.walkthroughBody}>
        <div className={styles.flowScene}>
          <CodeNode label="ON THE WIRE" brand>{current.event}</CodeNode>
          <Connector label={current.replace ? "done replaces the text" : "Append, then compile all of it"} />
          <CodeNode label="SESSION.PROGRAM">{lines.length === 0 ? "Empty" : lines.map((line, lineIndex) => <span key={lineIndex} className={styles.programLine} data-new={line.isNew && !line.rejected} data-rejected={line.rejected} data-stale={line.text.startsWith("root =") && lineIndex !== lastRoot}>{line.text}</span>)}</CodeNode>
          <Connector label="commit writes the differences" />
          <div className={styles.questionGroup}>
            <div className={styles.groupHeading}><span>lastCommit</span><span>phase .{current.phase}{current.error ? ` · ${current.error}` : ""}</span></div>
            <div className={styles.commitGrid}>{(["created", "updated", "slots", "removed"] as const).map(key => <div key={key}><span className={styles.monoNumber}>{current.commit[key]}</span>{key}</div>)}</div>
          </div>
          <Connector label="SwiftUI redraws from the handles" />
          <div className={styles.previewNode}><span className={styles.nodeOverline}>SCREEN · {current.pending} SKELETON {current.pending === 1 ? "FRAME" : "FRAMES"}</span><ScreenAt blocks={current.blocks} pending={current.pending} /></div>
        </div>
        <Annotation step={index} title={current.title} text={current.text} note={streamNotes[outcome].note}><Source file={index > 3 ? "src/lang/compiler.ts" : RUNTIME} line={index > 3 ? 362 : 195}>{index > 3 ? "Hold until complete" : "Append and compile"}</Source></Annotation>
      </div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try an outcome <GuideSelect value={outcome} onChange={event => { setOutcome(event.target.value as StreamOutcome); setStep(0); }}>{(Object.keys(streamNotes) as StreamOutcome[]).map(key => <option key={key} value={key}>{streamNotes[key].label}</option>)}</GuideSelect></label><StageControls step={index} total={steps.length} onStep={setStep} next="Next event →" /></div>
    </div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>A part is the unit of streaming.</strong><p>A writer statement alone never reaches the device. A part and all its children land in one event and one synchronous commit, so a card never appears half built. The cost is silence, because a long part shows nothing until its last statement passes.</p></div></div>
    <div className={styles.sourceRow}><Source file={`${IOS}Core/Model/PrimitiveSkeleton.swift`} line={24}>Pending frames</Source><Source file={SCENE} line={45}>Blocks and frames</Source></div>
    <details className={styles.detail}><summary>What happens to a rejected statement? <span>+</span></summary><p>The server drops it and sends an issue event. Its text never reaches the device, and issues do not change what the app draws. The writer gets one repair round, with a message that lists its rejected statements and the problems. Questions still uncovered after that get a fallback part, which appears only in done.program.</p><Source file="src/lang/compiler.ts" line={178}>Repair round</Source><Source file="src/lang/compiler.ts" line={534}>Statement validation</Source></details>
  </section>;
}

// 06 ---------------------------------------------------------------- identity

type IdentityCase = "value" | "same" | "root" | "kind" | "rows";

const identityCases: Record<IdentityCase, { label: string; before: string; after: string; handle: string; isNew: boolean; state: string; commit: string; text: string }> = {
  value: { label: "A value changes", before: `pick1 = Text("Hello", "body")`, after: `pick1 = Text("Bye", "body")`, handle: "Same handle", isNew: false, state: "@State kept", commit: "updated 1", text: "The id and kind match, so commit reuses the handle and writes the new properties." },
  same: { label: "Nothing changes", before: `pick1 = Text("Hello", "body")`, after: `pick1 = Text("Hello", "body")`, handle: "Same handle", isNew: false, state: "@State kept", commit: "no writes", text: "Compile still ran, but the compared properties match. No observable property is written." },
  root: { label: "The root gains a part", before: `root = Screen([pick1])`, after: `root = Screen([pick1, pick2])`, handle: "Same handle for pick1", isNew: false, state: "@State kept", commit: "created only for pick2", text: "A statement mounts under its own name the first time it appears. pick1 stays at ref:pick1 wherever it sits in the root." },
  kind: { label: "The kind changes", before: `pick1 = Text("Hello", "body")`, after: `pick1 = Badge("Hello", "neutral")`, handle: "New handle", isNew: true, state: "@State reset", commit: "created 1, slots 1", text: "The id matches, but the kind does not. Commit creates a new handle. SwiftUI sees a new child and starts its @State again." },
  rows: { label: "Rows change order", before: `item:0 Haaland\nitem:1 Salah`, after: `item:0 Salah\nitem:1 Haaland`, handle: "Same handles", isNew: false, state: "@State stays at the position", commit: "updated 2", text: "@Each builds ids from the row index and not from the data. Values move, handles stay, and local state stays at its old row." },
};

function Identity() {
  const [selected, setSelected] = useState<IdentityCase>("value");
  const current = identityCases[selected];
  return <section id="identity" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>06 / NODE IDENTITY</span><h2>A view lives as long as its handle.</h2></div></div>
    <p className={styles.sectionIntro}>Each chunk produces a whole new scene, and SwiftUI must not rebuild the screen for it. An element id comes from its document key and its mount path. Commit reuses a handle when the id, the kind and the slot names all match.</p>
    <div className={styles.researchDemo}>
      <div className={styles.demoToolbar}><span className={styles.demoTitle}>Reconciler</span><span className={styles.quiet}>Counts from the real OpenUISession</span></div>
      <div className={styles.searchScene}>
        <div className={styles.searchBranches}>
          <CodeNode label="BEFORE">{current.before}</CodeNode>
          <CodeNode label="AFTER">{current.after}</CodeNode>
        </div>
        <div className={styles.mergeConnector}><i /><span>OpenUISession.commit</span><i /></div>
        {current.isNew
          ? <div className={styles.unavailableNode}><strong>{current.handle}</strong><code>{current.state} · {current.commit}</code></div>
          : <div className={styles.mergedNode}><span>{current.handle}</span><small>{current.state} · {current.commit}</small></div>}
      </div>
      <div className={styles.researchAnnotation}><span>↳</span><div><strong>{current.label}</strong><p>{current.text}</p></div></div>
      <div className={styles.demoFooter}><label className={styles.selectLabel}>Try a change <GuideSelect value={selected} onChange={event => setSelected(event.target.value as IdentityCase)}>{(Object.keys(identityCases) as IdentityCase[]).map(key => <option key={key} value={key}>{identityCases[key].label}</option>)}</GuideSelect></label></div>
    </div>
    <div className={styles.sourceRow}><Source file={COMPILER} line={146}>Mount path</Source><Source file={COMPILER} line={217}>Row ids</Source><Source file={RUNTIME} line={384}>Reuse rule</Source><Source file={SCENE} line={88}>Child equality</Source></div>
  </section>;
}

// 07 ---------------------------------------------------------------- binding

const pathSteps = [
  { label: "d", path: "d", value: `Query("sports_dataset", {run: "r1"}, {})\n// matches the dataset with the same tool and args` },
  { label: ".answers", path: "d.answers", value: `{ q1: { ... } }` },
  { label: ".q1", path: "d.answers.q1", value: `{ title: "Top scorers", rows: [...] }` },
  { label: ".rows", path: "d.answers.q1.rows", value: `[\n  { name: "Haaland", goals: 24 },\n  { name: "Salah", goals: 19 },\n  { name: "Palmer", goals: 15 }\n]` },
] as const;

type DataCase = "complete" | "field" | "list" | "query";
const dataCases: Record<DataCase, { label: string; title: string; text: string; note: string; elements: readonly { id: string; value: string }[] }> = {
  complete: { label: "All data present", title: "Values settle before a view exists.", text: "@Each copies the evaluation context and adds the alias r for each row. r.name is a lookup in that copy.", note: "TextPrimitive receives Haaland as a plain string.", elements: [{ id: "r1:ref:pick2", value: `Stack · axis "v", gap 8` }, { id: "r1:ref:pick2/children/item:0", value: `Text · content "Haaland"` }, { id: "r1:ref:pick2/children/item:1", value: `Text · content "Salah"` }, { id: "r1:ref:pick2/children/item:2", value: `Text · content "Palmer"` }] },
  field: { label: "A row has no name", title: "A missing step becomes null.", text: "access returns null with no error. PrimitiveProps treats null as nil, and TextPrimitive draws a dash.", note: "An empty string is different, because it draws no line.", elements: [{ id: "r1:ref:pick2", value: `Stack · axis "v", gap 8` }, { id: "r1:ref:pick2/children/item:0", value: `Text · content null, draws —` }, { id: "r1:ref:pick2/children/item:1", value: `Text · content "Salah"` }, { id: "r1:ref:pick2/children/item:2", value: `Text · content "Palmer"` }] },
  list: { label: "The list is missing", title: "@Each produces no nodes.", text: "A value that is not a list gives an empty loop. The Stack still exists with an empty slot.", note: "No error is raised.", elements: [{ id: "r1:ref:pick2", value: `Stack · axis "v", gap 8, children []` }] },
  query: { label: "No dataset matches", title: "Compile throws missingQuery.", text: "This is the one data failure that throws. While streaming, the session logs it and retries on the next chunk.", note: "At done it ends the run, and any content already on screen stays.", elements: [] },
};

function valueAt(selected: DataCase, reached: number, fallback: string): string {
  if (selected === "query") return `throw OpenUIError.missingQuery("sports_dataset")`;
  if (selected === "list") return reached === 3 ? "null" : reached === 2 ? `{ title: "Top scorers" }` : fallback;
  if (selected === "field" && reached === 3) return `[\n  { goals: 24 },\n  { name: "Salah", goals: 19 },\n  { name: "Palmer", goals: 15 }\n]`;
  return fallback;
}

function PathResolver() {
  const [reached, setReached] = useState(3);
  const [selected, setSelected] = useState<DataCase>("complete");
  const current = dataCases[selected];
  const step = pathSteps[reached]!;
  return <div className={styles.walkthrough}>
    <div className={styles.demoToolbar}><span className={styles.demoTitle}><span className={styles.statusDot} /> Path resolver <small>{`@Each(d.answers.q1.rows, "r", Text(r.name, "body"))`}</small></span></div>
    <Stepper names={pathSteps.map(item => item.label)} step={reached} onStep={setReached} />
    <div className={styles.walkthroughBody}>
      <div className={styles.flowScene}>
        <CodeNode label={`EVALUATOR VALUE AT ${step.path.toUpperCase()}`}>{valueAt(selected, reached, step.value)}</CodeNode>
        <Connector label="@Each runs once per row" />
        <div className={styles.questionGroup}>
          <div className={styles.groupHeading}><span>Elements in the scene</span><span>{current.elements.length}</span></div>
          {current.elements.length === 0 ? <div className={styles.elementRow}><small>No scene. The last good commit stays on screen.</small></div> : current.elements.map(element => <div key={element.id} className={styles.elementRow}><code>{element.id}</code><small>{element.value}</small></div>)}
        </div>
      </div>
      <Annotation step={reached} title={current.title} text={current.text} note={current.note}><Source file={COMPILER} line={selected === "list" ? 203 : selected === "query" ? 189 : 150}>Read this in the compiler</Source></Annotation>
    </div>
    <div className={styles.demoFooter}><label className={styles.selectLabel}>Try the data <GuideSelect value={selected} onChange={event => setSelected(event.target.value as DataCase)}>{(Object.keys(dataCases) as DataCase[]).map(key => <option key={key} value={key}>{dataCases[key].label}</option>)}</GuideSelect></label></div>
  </div>;
}

const scoreProgram = `root = Screen([pick1])\n${QUERY}\npick1 = Stack("v", 8, @Each(d.answers.q1.rows, "r", KeyValue(r.name, r.goals)))`;

function FollowUp() {
  const [updated, setUpdated] = useState(false);
  const goals = updated ? 25 : 24;
  const result = { answers: { q1: { rows: [{ name: "Haaland", goals }, { name: "Salah", goals: 19 }] } } };
  return <div className={styles.researchDemo}>
    <div className={styles.demoToolbar}><span className={styles.demoTitle}>Follow-up update</span><span className={styles.quiet}>Counts from the real OpenUISession</span></div>
    <div className={styles.searchScene}>
      <div className={styles.searchBranches}>
        <CodeNode label={updated ? "DATASET · RUN R2" : "DATASET · RUN R1"}>{`rows: [\n  { name: "Haaland", goals: ${goals} },\n  { name: "Salah", goals: 19 }\n]`}</CodeNode>
        <div className={styles.previewNode}><span className={styles.nodeOverline}>RESULT · WEB PRIMITIVE RENDERER</span><div className={styles.previewBody}><DesignSystemPreview key={goals} program={scoreProgram} result={result} /></div></div>
      </div>
      <Connector label={updated ? "commit: updated 1" : "Waiting for a follow-up"} />
      <div className={styles.questionGroup}>
        <div className={styles.groupHeading}><span>Handles</span><span>Document r1 · revision {updated ? 2 : 1}</span></div>
        <div className={styles.elementRow}><code>r1:ref:pick1</code><small>Stack · no write</small></div>
        <div className={styles.elementRow} data-written={updated}><code>r1:ref:pick1/children/item:0</code><small>KeyValue · value {goals}{updated ? " · written" : ""}</small></div>
        <div className={styles.elementRow}><code>r1:ref:pick1/children/item:1</code><small>KeyValue · value 19 · no write</small></div>
      </div>
    </div>
    <div className={styles.researchAnnotation}><span>↳</span><div><strong>New data takes the same path as the first compile.</strong><p>A follow-up holds the new dataset and program until done confirms the next revision. It then compiles once. The document key stays r1, so element ids match and commit writes only the value that changed. @Observable tells SwiftUI which handle moved.</p></div></div>
    <div className={styles.demoFooter}><span className={styles.quiet}>{updated ? "Haaland scored in the new dataset." : "Send a follow-up with one new value."}</span><button type="button" className={styles.primaryButton} onClick={() => setUpdated(!updated)}>{updated ? "Show the first revision ↺" : "Apply the follow-up →"}</button></div>
  </div>;
}

function Binding() {
  return <section id="binding" className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>07 / DATA BINDING</span><h2>Swift views receive values, not paths.</h2></div></div>
    <p className={styles.sectionIntro}>A reference like d.answers.q1.rows never reaches a SwiftUI view. The compiler resolves it against the dataset and stores the result in the element. Views read that result from their handle, and @Observable tells SwiftUI when it changes. A component call resolves its record the same way, then hands the value to the template's fresh scope.</p>
    <PathResolver />
    <h3 className={styles.subHeading}>New data reaches a view through commit</h3>
    <FollowUp />
    <div className={styles.sourceRow}><Source file={RUNTIME} line={221}>Follow-up</Source><Source file={RUNTIME} line={23}>Conditional writes</Source><Source file={`${IOS}Renderer/Node/PrimitiveProps.swift`} line={45}>Null as nil</Source></div>
    <h3 className={styles.subHeading}>Two kinds of state</h3>
    <div className={styles.recoveryGrid}>
      <div><span className={styles.recoveryLabel}>HANDLE.PROPERTIES</span><h3>Evaluated props</h3><p>Every data reference and literal. Only commit writes them, and the views that read them update.</p></div>
      <div><span className={styles.recoveryLabel}>@STATE</span><h3>Local UI state</h3><p>Toggle, Stepper, Chip, SegmentedControl and an open Section. Only that view can read it. Once set, it ignores later prop updates for that handle.</p></div>
    </div>
    <div className={styles.callout}><span className={styles.calloutMark}>↳</span><div><strong>No SwiftUI binding connects two primitives.</strong><p>The language has no variables, so a Toggle cannot drive a Show. To change what another view shows, the program or the dataset has to change.</p></div></div>
    <details className={styles.detail}><summary>How does @Observable limit the work? <span>+</span></summary><p>registry and lastCommit are marked @ObservationIgnored. Update assigns only when a value differs, and slot set assigns only when the list differs by object identity. OpenUIElementView tracks properties, a container tracks its own slot, and the scene tracks root membership. These rules limit which writes happen.</p><Source file={SCENE} line={3}>Observation intent</Source></details>
  </section>;
}

export function SwiftUIRenderingGuide({ markdown, ...theme }: ExampleTheme & { markdown: string }) {
  return <ThemeContext.Provider value={theme}><AgentView><article className={styles.article}>
    <div className={styles.breadcrumb}><Link href="/how-to">How to</Link><span>/</span><span>From DSL to SwiftUI</span></div>
    <header className={styles.articleHeader}><div className={styles.eyebrow}><span className={styles.accentRule} /> PROCESS 03 / FROM THE DSL TO SWIFTUI</div><div className={styles.titleRow}><h1>From DSL<br />to SwiftUI.</h1><ForAgentsButton /></div><p className={styles.lead}>The server sends OpenUI Lang, the DSL the writer produces, as program text, with the component templates the program calls. The device compiles that text into elements with finished values. SwiftUI draws those elements from handles that the next compile reuses.</p><div className={styles.headerMeta}><span>OpenUI Lang</span><span>Components</span><span>Swift compiler</span><span>SwiftUI</span><i /><span>Interactive system guide</span></div></header>
    <AgentBody markdown={markdown} file="swiftui-rendering.md">
    <BridgeWalkthrough />
    <Contract />
    <Layout />
    <ComplexElements />
    <Streaming />
    <Identity />
    <Binding />
    <section id="gaps" className={styles.section}>
      <div className={styles.sectionHeading}><div><span className={styles.sectionIndex}>08 / KNOWN GAPS</span><h2>What the bridge does not check.</h2></div></div>
      <p className={styles.sectionIntro}>Check these limits before you add a primitive or change an argument.</p>
      <div className={styles.recoveryGrid}>
        <div><span className={styles.recoveryLabel}>VERSIONS</span><h3>Nothing compares the digest</h3><p>Swift decodes the catalog digest and never reads it. The server does not send one. Templates travel with each run, but a primitive newer than the app still fails the compile.</p></div>
        <div><span className={styles.recoveryLabel}>TESTS</span><h3>Parity stops at the tree</h3><p>OpenUIFixtureTests compares compiled trees, for each expanded sample and for the same sample called by name. It tests no view code. It runs with make test and not in CI. A typo in a prop name read by a view passes every check.</p></div>
        <div><span className={styles.recoveryLabel}>COVERAGE</span><h3>Fixtures cover part of the catalog</h3><p>check:sports-catalog looks for a Swift case for each kind in the sports fixtures. A new primitive outside those fixtures gets no renderer check on either side.</p></div>
        <div><span className={styles.recoveryLabel}>ACTIONS</span><h3>Actions wire in when a screen needs them</h3><p>Button, IconButton and row actions call a dispatcher in the environment. It does nothing until a host sets primitiveContext, so these taps are inert today.</p></div>
      </div>
      <div className={styles.sourceRow}><Source file={`${IOS}Renderer/Entry/PrimitiveEnvironment.swift`} line={13}>Action dispatcher</Source><Source file="ios/OpenUIGenTests/GenUI/OpenUIFixtureTests.swift" line={33}>Fixture test</Source><Source file="scripts/check-sports-catalog.ts" line={22}>Renderer check</Source></div>
    </section>
    <section className={styles.evidenceSection}>
      <div><span className={styles.sectionIndex}>WHY THIS SHAPE</span><h2>Compile everything. Write what changed.</h2><p>The compiler comment describes the intent: it evaluates a complete immutable scene, then the runtime publishes only semantic changes. Each chunk therefore parses and evaluates the whole program on the main actor.</p><p>Components keep the same split. A template is data made of primitives, and it travels with the run. The device expands each call itself, so it still needs only the primitive catalog, and a new component that reuses existing primitives ships with no app release.</p><Source file={COMPILER} line={26}>Documented compiler intent</Source></div>
    </section>
    <footer className={styles.articleFooter}><div><strong>Built from the implementation</strong><span>Source links point to main.</span><span>Evidence: code reading, plus the demo programs run through the real OpenUICompiler and OpenUISession in a scratch macOS harness. Results on this page use the web primitive renderer, and SwiftUI views were not run. The stream order is derived from server code, not captured from a live run. The template stages come from OpenUIFixtureTests and check:templates, which compile every catalog sample both expanded and called by name.</span><span>The component mapper uses the PlayerValue/full catalog fixture. Its Swift excerpts are shortened from StepTimelinePrimitive.swift.</span></div><Link href="/">Open the Preview ↗</Link></footer>
    </AgentBody>
  </article></AgentView></ThemeContext.Provider>;
}
