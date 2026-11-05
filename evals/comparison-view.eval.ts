import { describe, expect, it } from "vitest";
import { availableSort, sameColumn, selectVisibleItems, type ViewSort } from "../src/comparison-view.js";
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
