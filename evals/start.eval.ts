import { describe, expect, it } from "vitest";
import { comparisonSchema, createEmptyComparison, editComparison, itemSchema, sample } from "../src/comparison.js";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

describe("comparison snapshots (no model calls)", () => {
  it("adds, updates and removes an item without changing previous snapshots", () => {
    const added = editComparison(sample, { action: "add", item: { id: "new", name: "New bag", values: {}, sources: [] } });
    const updated = editComparison(added, { action: "update", itemId: "new", values: { weight: "1 kg" }, sources: [{ label: "Reference", url: "https://example.com" }] });
    expect(updated.items.at(-1)?.values.weight).toBe("1 kg");
    expect(updated.items.at(-1)?.sources).toHaveLength(1);
    expect(added.items.at(-1)?.values).toEqual({});
    expect(editComparison(updated, { action: "remove", itemId: "new" })).toEqual(sample);
    expect(sample.items).toHaveLength(3);
  });
  it("changes attributes while retaining matching values and dropping removed ones", () => {
    const result = editComparison(sample, { action: "attributes", attributes: [{ id: "weight", label: "Mass" }, { id: "price", label: "Price" }] });
    expect(result.items[0].values).toEqual({ weight: "600 g" });
    expect(result.attributes[1].id).toBe("price");
  });
  it("renames and replaces a comparison", () => {
    expect(editComparison(sample, { action: "rename", title: "Bags" }).title).toBe("Bags");
    const replacement = { ...sample, title: "Empty", items: [] };
    expect(editComparison(sample, { action: "replace", comparison: replacement })).toEqual(replacement);
  });
  it("rejects duplicate, unknown and unsafe data", () => {
    expect(() => editComparison(sample, { action: "add", item: sample.items[0] })).toThrow();
    expect(() => editComparison(sample, { action: "remove", itemId: "missing" })).toThrow();
    expect(() => editComparison(sample, { action: "update", itemId: "daypack", values: { unknown: "x" } })).toThrow();
    expect(comparisonSchema.safeParse({ ...sample, attributes: [sample.attributes[0], sample.attributes[0]] }).success).toBe(false);
    expect(itemSchema.safeParse({ ...sample.items[0], sources: [{ label: "Bad", url: "javascript:alert(1)" }] }).success).toBe(false);
  });
});

it("registers comparison tools on a real MCP server", async () => {
  const { app } = await import("../src/server.js");
  const server = await app.createServerInstance();
  expect(server).toBeDefined();
  await server.close();
});

it("updates the same ID across MCP calls while keeping independent comparisons isolated", async () => {
  const { app } = await import("../src/server.js");
  const connect = async () => {
    const server = await app.createServerInstance();
    const client = new Client({ name: "isolation-test", version: "1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, server };
  };
  const a = await connect();
  const b = await connect();
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    const data = result.structuredContent as { comparisonId: string; revision: number; comparison: unknown };
    return { ...data, comparison: comparisonSchema.parse(data.comparison) };
  };
  try {
    const tools = await a.client.listTools();
    const viewMeta = tools.tools.find((tool) => tool.name === "show-comparison")?._meta;
    const editMeta = tools.tools.find((tool) => tool.name === "edit-comparison")?._meta;
    expect(viewMeta?.["ui/resourceUri"]).toBeDefined();
    const readMeta = tools.tools.find((tool) => tool.name === "get-comparison")?._meta;
    expect(readMeta?.["openai/widgetAccessible"]).toBe(true);
    expect(readMeta?.["ui/resourceUri"]).toBeUndefined();
    expect(readMeta?.ui).toBeUndefined();
    expect(editMeta?.["ui/resourceUri"]).toBeUndefined();
    expect(editMeta?.ui).toBeUndefined();
    expect(editMeta?.["openai/outputTemplate"]).toBeUndefined();
    const empty = await call(a.client, "show-comparison", {});
    expect(empty.comparison).toEqual(createEmptyComparison());
    const example = await call(a.client, "edit-comparison", { comparisonId: empty.comparisonId, expectedRevision: 1, edit: { action: "load-example" } });
    expect(example.comparisonId).toBe(empty.comparisonId);
    expect(example.comparison).toEqual(sample);
    const separate = await call(b.client, "show-comparison", { loadExample: true });
    expect(separate.comparisonId).not.toBe(example.comparisonId);
    const changed = await call(a.client, "edit-comparison", { comparisonId: example.comparisonId, expectedRevision: example.revision, edit: { action: "remove", itemId: "daypack" } });
    const dataOnly = await a.client.callTool({ name: "edit-comparison", arguments: { comparisonId: separate.comparisonId, expectedRevision: 1, edit: { action: "rename", title: sample.title } } });
    expect(dataOnly._meta?.viewUUID).toBeUndefined();
    expect(changed.comparisonId).toBe(example.comparisonId);
    expect(changed.comparison.items).toHaveLength(2);
    // A second client represents the mounted widget's later read, not a new view.
    expect(await call(b.client, "get-comparison", { comparisonId: example.comparisonId })).toEqual(changed);
    expect((await call(a.client, "get-comparison", { comparisonId: separate.comparisonId })).comparison).toEqual(sample);
    expect(await call(b.client, "show-comparison", { comparisonId: changed.comparisonId })).toEqual(changed);
    const conflict = await a.client.callTool({ name: "edit-comparison", arguments: { comparisonId: example.comparisonId, expectedRevision: 1, edit: { action: "rename", title: "Stale" } } });
    expect(conflict.isError).toBe(true);
    expect(await call(b.client, "get-comparison", { comparisonId: changed.comparisonId })).toEqual(changed);
    const replacement = await call(a.client, "edit-comparison", { comparisonId: changed.comparisonId, expectedRevision: changed.revision, edit: { action: "replace", comparison: createEmptyComparison() } });
    expect(replacement.comparisonId).toBe(changed.comparisonId);
    expect(replacement.revision).toBe(changed.revision + 1);
    const newEmpty = await call(a.client, "show-comparison", {});
    expect(newEmpty.comparisonId).not.toBe(empty.comparisonId);
    expect(newEmpty.comparison).toEqual(createEmptyComparison());
  } finally {
    await Promise.all([a.client.close(), b.client.close()]);
    await Promise.all([a.server.close(), b.server.close()]);
  }
});

it("waits for valid initial data instead of treating metadata or partial data as an empty comparison", async () => {
  const { readComparisonResult } = await import("../src/comparison-result.js");
  expect(readComparisonResult(undefined).status).toBe("loading");
  expect(readComparisonResult(null).status).toBe("loading");
  expect(readComparisonResult({}).status).toBe("loading");
  expect(readComparisonResult({ viewUUID: "metadata-before-output" }).status).toBe("loading");
  expect(readComparisonResult({ error: "Missing comparison" })).toEqual({ status: "error", error: "Missing comparison" });
  expect(readComparisonResult({ comparison: { items: [] } }).status).toBe("loading");
  expect(readComparisonResult({ comparisonId: "bad", revision: 1, comparison: { items: [] } }).status).toBe("error");
  expect(readComparisonResult({ comparisonId: "8ab786bf-34ce-4cb5-8028-dfbf19c88f68", revision: 1, comparison: createEmptyComparison() }).status).toBe("ready");
});

it("expires records, bounds storage and never recreates missing IDs", async () => {
  const { ComparisonStore } = await import("../src/comparison-store.js");
  let now = 0;
  const store = new ComparisonStore(() => now, 100, 1);
  const first = store.create(sample);
  first.comparison.items.pop();
  expect(store.get(first.comparisonId).comparison.items).toHaveLength(3);
  expect(() => store.create(sample)).toThrow("full");
  now = 100;
  expect(() => store.get(first.comparisonId)).toThrow("expired");
  const next = store.create(createEmptyComparison());
  expect(next.comparisonId).not.toBe(first.comparisonId);
  expect(() => store.edit(first.comparisonId, 1, { action: "rename", title: "Lost" })).toThrow("expired");
  expect(new ComparisonStore().get.bind(new ComparisonStore(), next.comparisonId)).toThrow();
});
