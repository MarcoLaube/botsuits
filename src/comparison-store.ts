import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { comparisonSchema, editComparison, type Comparison, type editSchema } from "./comparison.js";
import { traceComparison } from "./dev-trace.js";

export type StoredComparison = { comparisonId: string; revision: number; comparison: Comparison };

// One store per running app process, with a separate record for every comparison.
// IDs are bearer capabilities, not authenticated ownership checks.
export class ComparisonStore {
  readonly storeId = randomUUID();
  private records = new Map<string, { value: StoredComparison; expiresAt: number }>();
  constructor(private readonly now = Date.now, private readonly ttlMs = 24 * 60 * 60 * 1000, private readonly capacity = 500) {}

  create(comparison: Comparison): StoredComparison {
    for (const [id, record] of this.records) if (record.expiresAt <= this.now()) this.records.delete(id);
    if (this.records.size >= this.capacity) throw new Error("Comparison storage is full. Try again after records expire.");
    const value = { comparisonId: randomUUID(), revision: 1, comparison: comparisonSchema.parse(comparison) };
    this.records.set(value.comparisonId, { value, expiresAt: this.now() + this.ttlMs });
    traceComparison("create", { storeId: this.storeId, comparisonId: value.comparisonId, revision: value.revision, itemCount: value.comparison.items.length });
    return structuredClone(value);
  }

  get(comparisonId: string): StoredComparison {
    const record = this.records.get(comparisonId);
    if (!record || record.expiresAt <= this.now()) {
      this.records.delete(comparisonId);
      throw new Error("Comparison not found or expired. It may have been lost when the server restarted. Create a new comparison explicitly.");
    }
    return structuredClone(record.value);
  }

  edit(comparisonId: string, expectedRevision: number, edit: z.infer<typeof editSchema>): StoredComparison {
    const current = this.get(comparisonId);
    traceComparison("mutation-before", { storeId: this.storeId, comparisonId, action: edit.action, expectedRevision, serverRevision: current.revision, itemCount: current.comparison.items.length });
    if (current.revision !== expectedRevision) throw new Error(`Revision conflict: current revision is ${current.revision}. Read this comparison again before retrying the requested edit.`);
    const value = { comparisonId, revision: current.revision + 1, comparison: editComparison(current.comparison, edit) };
    this.records.set(comparisonId, { value, expiresAt: this.now() + this.ttlMs });
    traceComparison("mutation-after", { storeId: this.storeId, comparisonId, action: edit.action, serverRevision: value.revision, itemCount: value.comparison.items.length });
    return structuredClone(value);
  }
}
