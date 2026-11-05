import { Skybridge } from "skybridge/server";
import { z } from "zod";
import { comparisonSchema, createEmptyComparison, editSchema, sample } from "./comparison.js";
import { ComparisonStore, type StoredComparison } from "./comparison-store.js";
import { traceComparison } from "./dev-trace.js";

const comparisonId = z.uuid().describe("Stable ID returned when this comparison was created. Reuse it for reads and edits; never use another conversation's ID.");
const view = {
  component: "comparison" as const,
  domain: "https://skybridge.tech",
  description: "Live comparison table. Mounted widgets poll their comparison ID for chat edits.",
};
function success(value: StoredComparison) {
  return { structuredContent: value, content: [{ type: "text" as const, text: "Comparison ready." }] };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Comparison operation failed.";
  return { isError: true, structuredContent: { comparisonId: null, revision: 0, comparison: null, error: message }, content: [{ type: "text" as const, text: message }] };
}
export const app = new Skybridge({
  name: "alpic-openai-app",
  version: "0.0.1",
  setup: () => new ComparisonStore(),
  handler: (server, store) => server
    .registerTool({
      name: "show-comparison",
      description: "Open an existing comparison by comparisonId, or create a NEW comparison when no ID is supplied. For an existing comparison always reuse its ID; do not recreate it from an old snapshot. New comparisons start empty unless initial comparison data is supplied. loadExample=true is ONLY for an explicit request for demo data. To load an example into an existing comparison use edit-comparison action load-example. Do not edit for ordinary advice questions.",
      inputSchema: { comparisonId: comparisonId.optional(), comparison: comparisonSchema.optional(), loadExample: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      view,
      openai: { entrypoints: [{ type: "global" }] },
    }, async ({ comparisonId, comparison, loadExample }) => {
      traceComparison("show-request", { storeId: store.storeId, comparisonId: comparisonId ?? null, createsRecord: !comparisonId, loadExample: loadExample === true });
      try {
        if (comparisonId && (comparison !== undefined || loadExample === true)) throw new Error("Opening an existing ID cannot replace its contents. Use edit-comparison for changes.");
        if (comparison !== undefined && loadExample === true) throw new Error("Supply initial data or request an example, not both.");
        return success(comparisonId ? store.get(comparisonId) : store.create(comparison ?? (loadExample === true ? structuredClone(sample) : createEmptyComparison())));
      } catch (error) { traceComparison("show-error", { storeId: store.storeId, comparisonId, error: String(error) }); return failure(error); }
    })
    .registerTool({
      name: "get-comparison",
      _meta: { "openai/widgetAccessible": true },
      description: "Read the latest stored comparison and revision by ID without creating a widget or changing anything. Used by mounted widgets for polling and by chat before an edit when the revision may be stale.",
      inputSchema: { comparisonId, debugWidgetId: z.string().max(100).optional().describe("Development-only widget instance tag for diagnosing refreshes.") },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async ({ comparisonId, debugWidgetId }) => {
      try {
        const value = store.get(comparisonId);
        traceComparison("refresh-response", { storeId: store.storeId, widgetId: debugWidgetId, comparisonId, revision: value.revision, itemCount: value.comparison.items.length });
        return success(value);
      } catch (error) {
        traceComparison("refresh-error", { storeId: store.storeId, widgetId: debugWidgetId, comparisonId, error: String(error) });
        return failure(error);
      }
    })
    .registerTool({
      name: "edit-comparison",
      description: "ONLY for an explicit user-requested edit; never for ordinary advice, explanations or 'which is best?'. Update the SAME comparisonId returned earlier in this conversation. Returns data only: the already open widget polls for updates, so do not call show-comparison after editing unless the user explicitly asks to open another view. Supply expectedRevision from the latest result; on revision conflict read get-comparison and reconsider the requested change. Never create a replacement ID to work around an error. replace changes contents while preserving the comparison ID. load-example replaces contents with fictional demo data ONLY on explicit request. Other actions: rename, add (unique item ID), update (merge supplied values, replace supplied sources; [] clears sources), remove (exact item ID), attributes (replace definitions, preserve values for retained IDs). Do not invent sources.",
      inputSchema: { comparisonId, expectedRevision: z.number().int().positive(), edit: editSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, async ({ comparisonId, expectedRevision, edit }) => {
      traceComparison("mutation-request", { storeId: store.storeId, comparisonId, expectedRevision, action: edit.action, itemId: "itemId" in edit ? edit.itemId : undefined });
      try { return success(store.edit(comparisonId, expectedRevision, edit)); }
      catch (error) { traceComparison("mutation-error", { storeId: store.storeId, comparisonId, action: edit.action, error: String(error) }); return failure(error); }
    }),
});
export type AppType = typeof app;
