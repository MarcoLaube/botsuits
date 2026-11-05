import "@/index.css";
import { useDisplayMode, useSendFollowUpMessage, useUser } from "skybridge/web";
import { useEffect, useState } from "react";
import { ArrowUpRight, Maximize2, Minimize2 } from "lucide-react";
import { useCallTool, useToolInfo } from "../helpers.js";
import type { StoredComparison } from "../comparison-store.js";
import { readComparisonResult } from "../comparison-result.js";
import { availableSort, sameColumn, selectVisibleItems, type SortColumn, type ViewSort } from "../comparison-view.js";

function traceWidget(event: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.info("[comparison-widget]", JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

// Display-only classification; supplied values are never reformatted.
function isAmount(value: string) {
  return /^(?:(?:[A-Z]{3}|[$€£¥])\s*)?[−+-]?\d[\d\s.,'’]*(?:\s*(?:%|[A-Za-zµμ°²³/]+))?$/u.test(value.trim());
}

function DevIndicator({ widgetId, comparisonId, revision, detail }: { widgetId: string; comparisonId?: string; revision?: number; detail: string }) {
  if (!import.meta.env.DEV) return null;
  return <details className="dev-details"><summary>Development details</summary><small>
    DEV widget {widgetId} | comparison {comparisonId ?? "pending"} | revision {revision ?? "pending"} | {detail}
  </small></details>;
}

export default function ComparisonView() {
  const { theme } = useUser();
  const { output, input, isPending } = useToolInfo<"show-comparison">();
  const [widgetId] = useState(() => crypto.randomUUID());
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const result = readComparisonResult(output);
  useEffect(() => {
    traceWidget("host-output", { widgetId, isPending, status: result.status, inputComparisonId: input?.comparisonId, comparisonId: output?.comparisonId, revision: output?.revision, itemCount: output?.comparison?.items?.length });
  }, [widgetId, input, output, isPending, result.status]);
  useEffect(() => {
    if (result.status !== "loading") { setLoadingTimedOut(false); return; }
    const timer = setTimeout(() => {
      traceWidget("initial-load-timeout", { widgetId });
      setLoadingTimedOut(true);
    }, 30000);
    return () => clearTimeout(timer);
  }, [widgetId, result.status]);
  if (result.status !== "ready") return <section className={`comparison comparison-state ${theme === "dark" ? "dark" : ""}`} aria-label="Comparison">
    <div className="state-message">
    {result.status === "error" ? <p role="alert">Could not load comparison: {result.error}</p>
      : loadingTimedOut ? <p role="alert">Loading comparison failed: no valid data arrived within 30 seconds. Ask in chat to reopen it.</p>
      : <p role="status">Loading comparison…</p>}
    </div><DevIndicator widgetId={widgetId} comparisonId={input?.comparisonId} detail={result.status} />
  </section>;
  return <LiveComparison key={result.value.comparisonId} widgetId={widgetId} initial={result.value} />;
}

function LiveComparison({ initial, widgetId }: { initial: StoredComparison; widgetId: string }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ViewSort | null>(null);
  const [latest, setLatest] = useState(initial);
  useEffect(() => { setSort((previous) => availableSort(latest.comparison, previous)); }, [latest.comparison.attributes]);
  const [syncError, setSyncError] = useState(false);
  const [refreshInfo, setRefreshInfo] = useState("waiting for first refresh");
  const { callToolAsync } = useCallTool("get-comparison");
  useEffect(() => {
    setLatest((previous) => initial.revision > previous.revision ? initial : previous);
  }, [initial]);
  useEffect(() => {
    traceWidget("display", { widgetId, comparisonId: latest.comparisonId, revision: latest.revision, itemCount: latest.comparison.items.length });
  }, [widgetId, latest]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function refresh() {
      traceWidget("refresh-start", { widgetId, comparisonId: initial.comparisonId });
      try {
        const result = await callToolAsync({ comparisonId: initial.comparisonId, ...(import.meta.env.DEV ? { debugWidgetId: widgetId } : {}) });
        const parsed = readComparisonResult(result.structuredContent);
        traceWidget("refresh-received", { widgetId, requestedComparisonId: initial.comparisonId, comparisonId: result.structuredContent?.comparisonId, revision: result.structuredContent?.revision, itemCount: result.structuredContent?.comparison?.items?.length, status: parsed.status, error: parsed.status === "error" ? parsed.error : undefined, stopped });
        if (parsed.status !== "ready") throw new Error(parsed.status === "error" ? parsed.error : "Refresh returned no valid comparison");
        const value = parsed.value;
        if (value.comparisonId !== initial.comparisonId) throw new Error(`Refresh returned a different comparison ID: ${value.comparisonId}`);
        if (stopped) return;
        setLatest((previous) => value.revision > previous.revision ? value as StoredComparison : previous);
        setSyncError(false);
        setRefreshInfo(`received revision ${value.revision} at ${new Date().toISOString()}`);
        delay = 2000;
      } catch (error) {
        traceWidget("refresh-error", { widgetId, comparisonId: initial.comparisonId, error: String(error), stopped });
        if (!stopped) { setSyncError(true); setRefreshInfo(`error at ${new Date().toISOString()}: ${String(error)}`); }
        delay = Math.min(delay * 2, 30000);
      } finally {
        if (!stopped) timer = setTimeout(() => { void refresh(); }, delay);
      }
    }
    void refresh();
    traceWidget("mount-polling", { widgetId, comparisonId: initial.comparisonId });
    return () => { stopped = true; clearTimeout(timer); traceWidget("unmount-polling", { widgetId, comparisonId: initial.comparisonId }); };
  }, [initial.comparisonId, callToolAsync, widgetId]);
  const { theme } = useUser();
  const [mode, setMode] = useDisplayMode();
  const sendMessage = useSendFollowUpMessage();
  const [exampleError, setExampleError] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  async function loadExample() {
    setExampleError(false);
    setLoadingExample(true);
    try {
      await sendMessage(`Load example into comparison ${latest.comparisonId}: call edit-comparison with this same comparisonId, expectedRevision=${latest.revision}, and edit={"action":"load-example"}. If the revision changed, read get-comparison first. This is an explicit request for demo data.`);
    } catch {
      setExampleError(true);
    } finally {
      setLoadingExample(false);
    }
  }
  const comparison = latest.comparison;
  const activeSort = availableSort(comparison, sort);
  const visibleItems = selectVisibleItems(comparison, filter, activeSort);
  const filtering = filter.trim().length > 0;
  function resetView() { setFilter(""); setSort(null); }
  function sortHeader(column: SortColumn, label: string) {
    const active = activeSort && sameColumn(activeSort.column, column);
    const direction = active ? activeSort.direction : undefined;
    return <button type="button" className={`sort-header ${active ? "sort-active" : ""}`} onClick={() => setSort({ column, direction: direction === "ascending" ? "descending" : "ascending" })}
      aria-label={`${label}: sort ${direction === "ascending" ? "descending" : "ascending"}`}>
      <span>{label}</span><span className="sort-direction" aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
    </button>;
  }
  const numericColumns = new Set(comparison.attributes.filter((attribute) => {
    const values = comparison.items.map((item) => item.values[attribute.id]).filter((value) => value?.trim());
    return values.length > 0 && values.every(isAmount);
  }).map((attribute) => attribute.id));
  return (
    <section className={`comparison ${theme === "dark" ? "dark" : ""} ${mode === "fullscreen" ? "expanded" : ""}`} aria-label={comparison.title}>
      <header>
        <div className="comparison-heading"><h1>{comparison.title}</h1><p className="comparison-count"><span role="status">{filtering ? `${visibleItems.length} of ${comparison.items.length} items` : `${comparison.items.length} ${comparison.items.length === 1 ? "item" : "items"}`}</span><span aria-hidden="true">·</span>{comparison.attributes.length} attributes</p></div>
        <button className="comparison-control" onClick={() => { void setMode(mode === "fullscreen" ? "inline" : "fullscreen").catch(() => {}); }}>{mode === "fullscreen" ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}{mode === "fullscreen" ? "Collapse" : "Expand"}</button>
      </header>
      {comparison.items.length > 0 && <div className="view-controls">
        <div className="filter-control"><input type="search" aria-label="Filter items" placeholder="Filter items" value={filter} onChange={(event) => setFilter(event.target.value)} />
          {filter && <button type="button" className="comparison-control" onClick={() => setFilter("")}>Clear</button>}
        </div>
        <button type="button" className="comparison-control" disabled={!filter && !activeSort} onClick={resetView}>Reset view</button>
      </div>}
      {comparison.items.length === 0 ? <div className="empty">
        <p className="state-title">No items yet</p><p>Describe what you want to compare in chat.</p>
        {comparison.attributes.length === 0 && <button className="comparison-control" disabled={loadingExample} onClick={() => { void loadExample(); }}>{loadingExample ? "Requesting example..." : "Load example"}</button>}
        {exampleError && <p role="alert">Could not send the request. Ask in chat to load an example.</p>}
      </div> : (
        <div className="table-wrap" role="region" aria-label="Comparison table, scroll horizontally for more attributes" tabIndex={0}>
          <table style={{ minWidth: `${190 + comparison.attributes.length * 116 + 132}px` }}>
            <caption>Compare items by attribute. A dash means no value was supplied.</caption>
            <colgroup><col style={{ width: 190 }} />{comparison.attributes.map((a) => <col key={a.id} />)}<col style={{ width: 132 }} /></colgroup>
            <thead><tr><th scope="col" className="item-name" aria-sort={activeSort?.column.kind === "name" ? activeSort.direction : undefined}>{sortHeader({ kind: "name" }, "Item")}</th>{comparison.attributes.map((a) => <th scope="col" className={numericColumns.has(a.id) ? "numeric" : undefined} key={a.id} aria-sort={activeSort?.column.kind === "attribute" && activeSort.column.id === a.id ? activeSort.direction : undefined}>{sortHeader({ kind: "attribute", id: a.id }, a.label)}</th>)}<th scope="col">Sources</th></tr></thead>
            <tbody>{visibleItems.map((item) => <tr key={item.id}>
              <th scope="row" className="item-name">{item.name}</th>
              {comparison.attributes.map((a) => <td key={a.id} className={numericColumns.has(a.id) ? "numeric" : undefined}>{item.values[a.id]?.trim() ? <span className={isAmount(item.values[a.id]) ? "amount" : undefined}>{item.values[a.id]}</span> : <span className="missing" aria-label="Not provided">—</span>}</td>)}
              <td className="sources">{item.sources.length ? <ul>{item.sources.map((source, i) => <li key={i}><a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer" title={source.label} aria-label={`View source: ${source.label} for ${item.name}`}>View source<ArrowUpRight size={13} aria-hidden="true" /></a></li>)}</ul> : <span className="missing" aria-label="No sources provided">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {comparison.items.length > 0 && visibleItems.length === 0 && <div className="filter-empty" role="status"><p className="state-title">No items match your filter</p><button type="button" className="comparison-control" onClick={() => setFilter("")}>Clear filter</button></div>}
      <footer><p role="status" className={syncError ? "sync-status sync-error" : "sync-status"}>{syncError ? "Updates unavailable. Showing the last received version; retrying automatically. The comparison may have expired or the server restarted." : `Live comparison · revision ${latest.revision}`}</p><details className="comparison-about"><summary>About this comparison</summary><p>Ask in chat to add, update or remove an item, rename the comparison, or change its attributes. Advice questions leave the table unchanged.</p><p>Changes sync while this widget is running. Storage is temporary and lost on server restart. Sample values are fictional; source links are supplied references, not verified by this app.</p><DevIndicator widgetId={widgetId} comparisonId={latest.comparisonId} revision={latest.revision} detail={refreshInfo} /></details></footer>
    </section>
  );
}
