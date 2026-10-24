import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SnapshotArgs, SnapshotSchema } from "./snapshots.js";

export const DocumentPartSchema = z.object({ id: z.string(), block: z.string(), binding: z.string().nullable(), variant: z.string(), statements: z.record(z.string(), z.string()),
  /** Questions this part shows (screen-compiler documents); absent on older documents. */
  questions: z.array(z.string()).optional() }).strict();
/** A planned question as saved with the document, so a follow-up can revise it by id. */
export const DocumentQuestionSchema = z.object({ id: z.string().regex(/^q\d+$/), text: z.string(), lookup: z.record(z.string(), z.unknown()) }).strict();
export const DocumentSchema = z.object({
  id: SnapshotArgs.shape.run, revision: z.number().int().positive(), program: z.string(), snapshot: SnapshotSchema,
  ticker: z.string(), resolvedRequest: z.string(), model: z.string(),
  parts: z.array(DocumentPartSchema),
  /** Present on screen-compiler documents: the subject and every question answered so far. */
  subject: z.record(z.string(), z.unknown()).optional(),
  questions: z.array(DocumentQuestionSchema).optional(),
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }).strict()),
  sourceSummary: z.string(), updatedAt: z.string(),
}).strict();
export type LangDocument = z.infer<typeof DocumentSchema>;
export type DocumentPart = z.infer<typeof DocumentPartSchema>;
export class DocumentConflict extends Error {
  constructor(readonly revision: number) { super("The document changed. Retry with the current revision."); }
}

/** One atomic JSON record contains the revision, UI, seed and all committed turns. */
export class DocumentStore {
  private readonly queues = new Map<string, Promise<void>>();
  constructor(private readonly directory: string) {}
  async lock(id: string): Promise<() => void> {
    SnapshotArgs.parse({ run: id });
    const previous = this.queues.get(id) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>(resolve => { release = resolve; });
    this.queues.set(id, current);
    await previous;
    return () => { release(); if (this.queues.get(id) === current) this.queues.delete(id); };
  }
  async get(id: string): Promise<LangDocument | null> {
    SnapshotArgs.parse({ run: id });
    try {
      const document = DocumentSchema.parse(JSON.parse(await readFile(path.join(this.directory, `${id}.json`), "utf8")));
      if (document.id !== id) throw new Error("Document identity mismatch");
      return document;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }
  /** Call under the document lease. Rename is the only persistent commit point. */
  async put(document: LangDocument, baseRevision: number, signal?: AbortSignal): Promise<void> {
    const valid = DocumentSchema.parse(document);
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
