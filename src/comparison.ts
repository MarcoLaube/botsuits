import { z } from "zod";

const text = z.string().trim().min(1).max(200);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const attribute = z.object({ id, label: text });
const source = z.object({ label: text, url: z.url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol), "Only HTTP(S) sources are allowed") });
export const itemSchema = z.object({
  id, name: text,
  values: z.record(id, z.string().max(2000)),
  sources: z.array(source).max(10).default([]),
});
export const comparisonSchema = z.object({
  title: text,
  attributes: z.array(attribute).max(12),
  items: z.array(itemSchema).max(30),
}).superRefine((value, ctx) => {
  for (const [key, rows] of [["attributes", value.attributes], ["items", value.items]] as const) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) ctx.addIssue({ code: "custom", path: [key], message: "IDs must be unique" });
  }
  const keys = new Set(value.attributes.map((a) => a.id));
  if (value.items.some((item) => Object.keys(item.values).some((key) => !keys.has(key)))) ctx.addIssue({ code: "custom", message: "Item values must reference defined attribute IDs" });
});
export type Comparison = z.infer<typeof comparisonSchema>;
export const storedComparisonSchema = z.object({
  comparisonId: z.uuid(),
  revision: z.number().int().positive(),
  comparison: comparisonSchema,
});
export function createEmptyComparison(): Comparison {
  return { title: "New comparison", attributes: [], items: [] };
}
export const sample: Comparison = {
  title: "Sample: fictional travel bags",
  attributes: [{ id: "capacity", label: "Capacity" }, { id: "weight", label: "Weight" }, { id: "best_for", label: "Best for" }],
  items: [
    { id: "daypack", name: "Everyday Daypack", values: { capacity: "18 L", weight: "600 g", best_for: "Daily essentials" }, sources: [] },
    { id: "weekender", name: "Weekend Duffel", values: { capacity: "35 L", weight: "900 g", best_for: "Short trips" }, sources: [] },
    { id: "carryon", name: "Compact Carry-on", values: { capacity: "40 L", weight: "2.4 kg", best_for: "Organized packing" }, sources: [] },
  ],
};
export const editSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load-example") }),
  z.object({ action: z.literal("replace"), comparison: comparisonSchema }),
  z.object({ action: z.literal("rename"), title: text }),
  z.object({ action: z.literal("add"), item: itemSchema }),
  z.object({ action: z.literal("update"), itemId: id, name: text.optional(), values: z.record(id, z.string().max(2000)).optional(), sources: z.array(source).max(10).optional() }),
  z.object({ action: z.literal("remove"), itemId: id }),
  z.object({ action: z.literal("attributes"), attributes: z.array(attribute).max(12) }),
]);
export function editComparison(current: Comparison, edit: z.infer<typeof editSchema>): Comparison {
  const next = structuredClone(comparisonSchema.parse(current));
  switch (edit.action) {
    case "load-example": return structuredClone(sample);
    case "replace": return comparisonSchema.parse(edit.comparison);
    case "rename": next.title = edit.title; break;
    case "add":
      if (next.items.some((item) => item.id === edit.item.id)) throw new Error("Item ID already exists; use update instead.");
      next.items.push(edit.item); break;
    case "update":
    case "remove": {
      const index = next.items.findIndex((item) => item.id === edit.itemId);
      if (index === -1) throw new Error("Unknown item ID. Use an ID from the latest snapshot.");
      if (edit.action === "remove") next.items.splice(index, 1);
      else {
        const item = next.items[index];
        if (edit.name !== undefined) item.name = edit.name;
        if (edit.values !== undefined) item.values = { ...item.values, ...edit.values };
        if (edit.sources !== undefined) item.sources = edit.sources;
      }
      break;
    }
    case "attributes":
      next.attributes = edit.attributes;
      for (const item of next.items) item.values = Object.fromEntries(Object.entries(item.values).filter(([key]) => edit.attributes.some((a) => a.id === key)));
  }
  return comparisonSchema.parse(next);
}
