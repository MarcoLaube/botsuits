import { describe, expect, it } from "vitest";
import { itemsAsColumns, availableSort, sameColumn, selectVisibleItems, type ViewSort } from "../src/comparison-view.js";
import type { Comparison } from "../src/comparison.js";

const comparison: Comparison = {
  title: "Fictional view test",
  attributes: [{ id: "price", label: "Price" }, { id: "use", label: "Best for" }],
  items: [
    { id: "high", name: "Alpine Pack", values: { price: "CHF 1,200", use: "Daily travel" }, sources: [] },
    { id: "missing", name: "Canvas Tote", values: { use: "Shopping" }, sources: [] },
    { id: "low", name: "Metro Pack", values: { price: "CHF 950", use: "Daily commute" }, sources: [] },
  ],
};
const asc: ViewSort = { column: { kind: "attribute", id: "price" }, direction: "ascending" };
const desc: ViewSort = { ...asc, direction: "descending" };
const ids = (data: Comparison, query = "", sort: ViewSort | null = null) => selectVisibleItems(data, query, sort).map((item) => item.id);

describe("local comparison view preferences", () => {
  it("filters and sorts full long values, including text beyond a cell preview", () => {
    const prefix = "A detailed fictional description that is much longer than two table lines. ".repeat(5);
    const data = structuredClone(comparison);
    data.items[0].values.use = prefix + "Zebra ending hidden beyond the preview";
    data.items[2].values.use = prefix + "Alpine ending hidden beyond the preview";
    const before = structuredClone(data);
    expect(ids(data, "Zebra ending")).toEqual(["high"]);
    expect(ids(data, "", { column: { kind: "attribute", id: "use" }, direction: "ascending" })).toEqual(["low", "high", "missing"]);
    expect(data).toEqual(before);
  });
  it("chooses Auto from full dimensions, including ties, and recalculates after edits", () => {
    const players = (count: number, stats: number): Comparison => ({ ...comparison,
      items: Array.from({ length: count }, (_, i) => ({ ...comparison.items[i % 3], id: String(i) })),
      attributes: Array.from({ length: stats }, (_, i) => ({ id: String(i), label: `Statistic ${i}` })),
    });
    expect(itemsAsColumns(players(2, 10), "auto")).toBe(true);
    expect(itemsAsColumns(players(10, 2), "auto")).toBe(false);
    expect(itemsAsColumns(players(2, 2), "auto")).toBe(false);
    expect(itemsAsColumns(players(1, 2), "auto")).toBe(true);
    expect(itemsAsColumns(players(2, 1), "auto")).toBe(false);
    expect(itemsAsColumns(players(1, 10), "rows")).toBe(false);
    expect(itemsAsColumns(players(10, 1), "columns")).toBe(true);
  });
  it("uses the same visible item order in either layout without filtering changing Auto", () => {
    const visible = selectVisibleItems(comparison, "daily", asc);
    expect(visible.map((item) => item.id)).toEqual(["low", "high"]);
    for (const layout of ["auto", "rows", "columns"] as const) {
      itemsAsColumns(comparison, layout);
      expect(selectVisibleItems(comparison, "daily", asc)).toEqual(visible);
    }
    expect(itemsAsColumns(comparison, "auto")).toBe(false);
    expect(selectVisibleItems(comparison, "metro", asc)).toHaveLength(1);
    expect(itemsAsColumns(comparison, "auto")).toBe(false);
  });
  it("sorts grouped currency numerically with missing values last in BOTH directions without mutating rows", () => {
    const before = structuredClone(comparison);
    expect(ids(comparison, "", asc)).toEqual(["low", "high", "missing"]);
    expect(ids(comparison, "", desc)).toEqual(["high", "low", "missing"]);
    expect(comparison).toEqual(before);
    expect(ids(comparison)).toEqual(["high", "missing", "low"]);
  });
  it("keeps original order for equal amounts, equal names, and empty values", () => {
    const equal = structuredClone(comparison);
    equal.items[2].values.price = "CHF 1200";
    equal.items.push({ ...equal.items[1], id: "missing2", values: { price: "  " } });
    expect(ids(equal, "", desc)).toEqual(["high", "low", "missing", "missing2"]);
    equal.items[0].name = "PACK";
    equal.items[2].name = "pack";
    expect(ids(equal, "", { column: { kind: "name" }, direction: "descending" })).toEqual(["high", "low", "missing", "missing2"]);
  });
  it.each([
    ["2 kg", "100 g"], ["CHF 900–1,100", "CHF 950"], ["CHF 1.200", "CHF 950"],
    ["CHF 1,20", "CHF 950"], ["USD 200", "CHF 950"],
  ])("uses predictable text ordering for incompatible or ambiguous values %s / %s", (a, b) => {
    const data = structuredClone(comparison);
    data.items[0].values.price = a; data.items[2].values.price = b;
    const text = new Intl.Collator("en", { sensitivity: "base", numeric: false });
    const expected = text.compare(a, b) <= 0 ? ["high", "low", "missing"] : ["low", "high", "missing"];
    expect(ids(data, "", asc)).toEqual(expected);
    expect(ids(data, "", desc)).toEqual([...expected.slice(0, 2).reverse(), "missing"]);
  });
  it("filters names and current displayed attributes case-insensitively, including zero matches", () => {
    expect(ids(comparison, "DAILY", asc)).toEqual(["low", "high"]);
    expect(ids(comparison, "metro")).toEqual(["low"]);
    expect(ids(comparison, "1,200")).toEqual(["high"]);
    expect(ids(comparison, "nothing")).toEqual([]);
    expect(ids(comparison, " ")).toEqual(["high", "missing", "low"]);
  });
  it("reapplies preferences after edits and reveals the other saved rows when the filter clears", () => {
    const edited = { ...comparison, items: comparison.items.filter((item) => item.id !== "low") };
    expect(ids(edited, "daily", asc)).toEqual(["high"]);
    expect(ids(edited, "", asc)).toEqual(["high", "missing"]);
    const changed = structuredClone(comparison);
    changed.items[1].values.use = "Daily shopping";
    changed.items[1].values.price = "CHF 50";
    expect(ids(changed, "daily", asc)).toEqual(["missing", "low", "high"]);
  });
  it("drops a removed sort column and never confuses an attribute named name with item names", () => {
    const changed = { ...comparison, attributes: comparison.attributes.filter((a) => a.id !== "price") };
    expect(availableSort(changed, asc)).toBeNull();
    expect(ids(changed, "", asc)).toEqual(["high", "missing", "low"]);
    expect(sameColumn({ kind: "name" }, { kind: "attribute", id: "name" })).toBe(false);
    // Filter interpretation only uses currently displayed attributes.
    expect(ids(changed, "950")).toEqual([]);
  });
});
