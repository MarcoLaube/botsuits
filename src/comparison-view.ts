import type { Comparison } from "./comparison.js";

export type LayoutPreference = "auto" | "columns" | "rows";
export function itemsAsColumns(comparison: Comparison, layout: LayoutPreference) {
  return layout === "columns" || (layout === "auto" && comparison.items.length < comparison.attributes.length);
}

export type SortColumn = { kind: "name" } | { kind: "attribute"; id: string };
export type ViewSort = { column: SortColumn; direction: "ascending" | "descending" };

export function sameColumn(a: SortColumn, b: SortColumn) {
  return a.kind === b.kind && (a.kind === "name" || (b.kind === "attribute" && a.id === b.id));
}

export function availableSort(comparison: Comparison, sort: ViewSort | null) {
  return sort && (sort.column.kind === "name" || comparison.attributes.some((a) => sort.column.kind === "attribute" && a.id === sort.column.id)) ? sort : null;
}

// Values have no numeric schema. Accept only a single amount, with matching currency/unit
// and unambiguous English-style decimals/grouping. Never convert units or parse ranges.
function amount(text: string) {
  const match = text.trim().match(/^(?:([A-Z]{3}|[$€£¥])\s*)?([+−-]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:['’]\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:\.\d+)?)(?:\s*([A-Za-zµμ°²³/]+|%))?$/u);
  if (!match) return null;
  const [, currency = "", number, unit = ""] = match;
  // With no declared locale/type, 1.200 could be 1.2 or 1200.
  if (/^[+−-]?[1-9]\d*\.\d{3}$/.test(number)) return null;
  const value = Number(number.replace(/[,'’ \u00a0\u202f]/g, "").replace("−", "-"));
  return Number.isFinite(value) ? { value, signature: `${currency}|${unit}` } : null;
}

export function selectVisibleItems(comparison: Comparison, filter: string, requestedSort: ViewSort | null) {
  const sort = availableSort(comparison, requestedSort);
  const query = filter.trim().toLowerCase();
  const rows = comparison.items.map((item, index) => ({ item, index })).filter(({ item }) =>
    !query || [item.name, ...comparison.attributes.map((a) => item.values[a.id] ?? "")].some((value) => value.toLowerCase().includes(query)),
  );
  if (!sort) return rows.map(({ item }) => item);
  const column = sort.column;
  const valueOf = (item: Comparison["items"][number]) => column.kind === "name" ? item.name : item.values[column.id] ?? "";
  // Infer from ALL saved rows, so filtering does not change the column's interpretation.
  const values = comparison.items.map(valueOf).filter((value) => value.trim());
  const amounts = values.map(amount);
  const numeric = column.kind === "attribute" && amounts.length > 0 && amounts.every((a) => a && a.signature === amounts[0]?.signature);
  const textOrder = new Intl.Collator("en", { sensitivity: "base", numeric: false });
  rows.sort((a, b) => {
    const left = valueOf(a.item).trim(), right = valueOf(b.item).trim();
    if (!left || !right) return !left && !right ? a.index - b.index : !left ? 1 : -1;
    const order = numeric ? amount(left)!.value - amount(right)!.value : textOrder.compare(left, right);
    return (sort.direction === "ascending" ? order : -order) || a.index - b.index;
  });
  return rows.map(({ item }) => item);
}
