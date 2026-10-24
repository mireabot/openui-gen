import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DataFieldSchema } from "../research/dataset-schema.js";
import type { StocksDataset } from "../stocks/data.js";

export const SnapshotArgs = z.object({ run: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict();
export const SnapshotSchema = z.object({
  tool: z.literal("stocks_dataset"), args: SnapshotArgs, result: z.record(z.string(), z.json()),
  fields: z.array(DataFieldSchema), asOf: z.string(), source: z.enum(["massive", "fmp", "mixed"]),
});
export type DatasetSnapshot = z.infer<typeof SnapshotSchema>;

export class SnapshotStore {
  private readonly memory = new Map<string, DatasetSnapshot>();
  constructor(private readonly directory: string, private readonly capacity = 32) {}

  async put(run: string, dataset: StocksDataset): Promise<DatasetSnapshot> {
    const snapshot = SnapshotSchema.parse({ tool: "stocks_dataset", args: { run }, result: dataset.values, fields: dataset.fields, asOf: dataset.asOf, source: dataset.source });
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${run}.json`);
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), "utf8");
    await rename(temporary, file);
    this.remember(run, snapshot);
    return snapshot;
  }

  async get(input: unknown): Promise<DatasetSnapshot | null> {
    const { run } = SnapshotArgs.parse(input);
    const cached = this.memory.get(run);
    if (cached) { this.remember(run, cached); return cached; }
    try {
      const snapshot = SnapshotSchema.parse(JSON.parse(await readFile(path.join(this.directory, `${run}.json`), "utf8")));
      if (snapshot.args.run !== run) throw new Error("Snapshot identity mismatch");
      this.remember(run, snapshot);
      return snapshot;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private remember(run: string, snapshot: DatasetSnapshot): void {
    this.memory.delete(run);
    this.memory.set(run, snapshot);
    while (this.memory.size > this.capacity) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
  }
}
