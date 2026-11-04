import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SnapshotArgs, SnapshotSchema } from "../lang/snapshots.js";
import type { SportsResult } from "./ask.js";
import { SportsQuestionSchema, SportsSubjectSchema } from "./plan.js";

/**
 * A sports screen as the conversation left it: the program, the snapshot it reads, the plan it
 * answers, and each part with the questions it shows. A follow-up reads one revision and commits
 * the next; the document id is the first run's id.
 */

/** A part on screen: its printed statements (kept byte for byte by a follow-up) and the questions it shows. */
export const DocumentPartSchema = z.object({
  id: z.templateLiteral(["pick", z.number().int().positive()]),
  statements: z.record(z.string(), z.string()),
  questions: z.array(z.templateLiteral(["q", z.number().int().positive()])),
}).strict();
export const TurnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string() }).strict();
export const SportsDocumentSchema = z.object({
  id: SnapshotArgs.shape.run,
  revision: z.number().int().positive(),
  program: z.string(),
  snapshot: SnapshotSchema,
  subject: SportsSubjectSchema,
  questions: z.array(SportsQuestionSchema).min(1),
  parts: z.array(DocumentPartSchema),
  turns: z.array(TurnSchema),
  model: z.string(),
  updatedAt: z.string(),
}).strict();
export type SportsDocument = z.infer<typeof SportsDocumentSchema>;
export type DocumentPart = z.infer<typeof DocumentPartSchema>;
export type Turn = z.infer<typeof TurnSchema>;

/** The revision a turn commits: the result's screen and plan, with the prompt and what each part now shows appended to the turns. */
export function nextRevision(previous: SportsDocument | null, id: string, prompt: string, result: Pick<SportsResult, "program" | "snapshot" | "plan" | "parts" | "model">, now = new Date()): SportsDocument {
  const { plan } = result;
  const shown = result.parts.map(part => ({ part: part.id, shows: part.questions.map(q => plan.questions.find(question => question.id === q)?.text ?? q) }));
  return {
    id, revision: (previous?.revision ?? 0) + 1, program: result.program, snapshot: result.snapshot,
    subject: plan.subject, questions: [...plan.questions], parts: [...result.parts],
    turns: [...(previous?.turns ?? []), { role: "user", content: prompt }, { role: "assistant", content: JSON.stringify({ subject: plan.subject.name, parts: shown }) }],
    model: result.model, updatedAt: now.toISOString(),
  };
}

/** A copy the user chose to keep, one file per revision: saving the same revision again replaces it. */
export async function saveGeneration(directory: string, document: SportsDocument, now = new Date()): Promise<string> {
  await mkdir(directory, { recursive: true });
  const name = `${document.id}-r${document.revision}.json`;
  const temporary = path.join(directory, `${name}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ savedAt: now.toISOString(), ...document }, null, 2), "utf8");
  await rename(temporary, path.join(directory, name));
  return name;
}

export class DocumentConflict extends Error {
  constructor(readonly revision: number) { super("The document changed. Retry with the current revision."); }
}

/** One atomic JSON file per document, holding its latest revision. */
export class DocumentStore {
  private readonly queues = new Map<string, Promise<void>>();
  constructor(private readonly directory: string) {}
  /** Serializes work on one document; call the returned release when done. */
  async lock(id: string): Promise<() => void> {
    SnapshotArgs.parse({ run: id });
    const previous = this.queues.get(id) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>(resolve => { release = resolve; });
    this.queues.set(id, current);
    await previous;
    return () => { release(); if (this.queues.get(id) === current) this.queues.delete(id); };
  }
  async get(id: string): Promise<SportsDocument | null> {
    SnapshotArgs.parse({ run: id });
    try {
      const document = SportsDocumentSchema.parse(JSON.parse(await readFile(path.join(this.directory, `${id}.json`), "utf8")));
      if (document.id !== id) throw new Error("Document identity mismatch");
      return document;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }
  /** Saved screens, newest first, by the prompt that started them. A file that no longer parses is skipped. */
  async list(limit = 50): Promise<{ id: string; revision: number; prompt: string; model: string; updatedAt: string }[]> {
    const names = await readdir(this.directory).catch(() => [] as string[]);
    const documents = await Promise.all(names.filter(name => name.endsWith(".json")).map(name => this.get(name.slice(0, -5)).catch(() => null)));
    return documents.flatMap(document => document ? [{ id: document.id, revision: document.revision, prompt: document.turns.find(turn => turn.role === "user")?.content ?? "", model: document.model, updatedAt: document.updatedAt }] : [])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }
  /** Call under the document's lock. Rename is the only persistent commit point. */
  async put(document: SportsDocument, baseRevision: number, signal?: AbortSignal): Promise<void> {
    const valid = SportsDocumentSchema.parse(document);
    const previous = await this.get(valid.id);
    if ((previous?.revision ?? 0) !== baseRevision) throw new DocumentConflict(previous?.revision ?? 0);
    if (valid.revision !== baseRevision + 1) throw new Error("Invalid document revision transition");
    signal?.throwIfAborted();
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${valid.id}.json`);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(valid), "utf8");
    signal?.throwIfAborted();
    await rename(temporary, file);
  }
}
