# Comparison app

Latest pinning/synchronization investigation: [OpenMCP source trace and ChatGPT verification](OPENMCP-INVESTIGATION.md). The existing polling read now advertises `openai/widgetAccessible: true`. After restarting the dev server and refreshing connector tools, the same ChatGPT side-view widget advanced from three rows/revision 1 to two rows/revision 2 after a chat edit, without opening another widget; advice left revision 2 unchanged. The test used **Open app in tab** in ChatGPT web, with the existing CSP-off setting; a separate native Work Pin action remains unverified. The active tunnel in that test targeted port **3000**, so use the actual printed port instead of assuming the historical 3001 below.

A generic React comparison table built on the existing Skybridge MCP setup. ChatGPT supplies the title, attributes, items and optional source links through tools. There are no additional AI API calls, credentials or external backend fetches. New comparisons start empty, with no items or attributes. Fictional travel-bag data loads only after an explicit request.

## Develop and check

Requires Node.js 24+.

```bash
npm install
npm run dev
```

Use the port printed by Skybridge. In the current session it is **3001**: DevTools at http://localhost:3001/ and MCP at http://localhost:3001/mcp. Point the tunnel at that same port. Reload the connector after changing tool definitions.

```bash
npm run build
npx tsc --noEmit
npm run evals:types
npm run evals
```

The eval suite runs deterministic local state tests, with no model requests or API keys.

## Chat workflow

- "Show a comparison" opens an empty comparison.
- Click **Load example** in the empty view, or ask "Load example" in chat, to load the fictional travel-bag sample. The button sends an explicit request through the host conversation; the resulting tool call updates that same comparison ID.
- "Compare these three options by price, size and warranty" supplies a new title, attributes and items.
- "Add this option", "Change its weight", "Remove the duffel", or "Compare capacity and materials instead" updates the comparison.
- "Which is best for short trips?" should receive advice without changing the table.

`show-comparison` creates a new record when no `comparisonId` is supplied: empty by default, initialized from optional `comparison` data, or populated with fictional sample data only for an explicit `loadExample: true` request. Every new record has a random UUID and starts at revision 1. To open an existing comparison, pass only its `comparisonId`; opening never replaces its contents.

`get-comparison` is a read-only tool without a view. It returns the latest `{ comparisonId, revision, comparison }` and is used by mounted widgets for polling. `edit-comparison` requires `comparisonId`, `expectedRevision` and an `edit` action: `replace`, `rename`, `add`, `update`, `remove`, `attributes`, or explicit `load-example`. All edits preserve the comparison ID and increment its revision. Stale revisions fail without changing data; read again before retrying the user's intended edit. To start an independent comparison, call `show-comparison` without an ID. Never substitute another conversation's ID.

Attributes have stable `{ id, label }` values. Items have `{ id, name, values, sources }`; `values` maps attribute IDs to strings, and optional `sources` contains `{ label, url }` HTTP(S) references. Updates merge supplied values, retain omitted fields, and replace a supplied source list (`[]` clears it). Replacing attributes preserves matching IDs and removes obsolete values; new values display as missing until supplied. Duplicate IDs, unknown item IDs and unknown attribute keys are rejected. Failed edits leave the snapshot unchanged.

Tool descriptions explicitly restrict edits to requested changes. Ordinary advice requires no edit tool. These descriptions guide ChatGPT; the server receives structured arguments and cannot prove what the user intended. No app-side classifier or additional AI call is made. Source URLs are validated for protocol, but the app does not verify their factual contents.

## State and persistence

Previously, each tool call produced an independent JSON snapshot, with no comparison ID or server record. The React table read only its own `useToolInfo()` output. Returning a later `structuredContent` result could not refresh an earlier pinned widget.

Now the app's Skybridge `setup` creates one in-memory `ComparisonStore` for the app process. Its map holds separate records keyed by random UUIDs. This is not a single mutable current comparison: no default/global last ID exists, and each create gets a new ID. Reads return copies; edits validate and atomically replace only the selected record. The assistant carries the ID and revision in conversation tool results, not a mutable client snapshot used as the source of truth.

A mounted React widget uses its initial result to identify its record, then calls `get-comparison` through Skybridge's supported `useCallTool` API immediately and every two seconds after a successful response. The installed Skybridge 2.1 host context hooks do not broadcast arbitrary subsequent chat tool results to earlier widgets. Its experimental Events API is for chat workflows, not record-change delivery to a mounted React view. Polling therefore supplies current data independently of new widget creation. Responses with older revisions are ignored; only one poll is in flight, timers are cleaned up on unmount, and failed reads retain the last result with a visible warning and back off up to 30 seconds. Hosts can suspend/throttle background or pinned widgets; synchronization resumes when execution resumes. Only an explicit show-comparison call opens a view. Mutation results do not open another widget. Running widgets with the same ID retrieve the same record.

Storage is temporary, not durable: records expire 24 hours after creation or the latest successful edit (polls do not extend expiry), with a maximum of 500 records per process. A restart, dev hot reload or deployment loses records. Missing/expired IDs fail explicitly and are never silently recreated from stale widget output. Old widgets created before ID support must be recreated once. Multiple workers/replicas have separate stores; reliable multi-instance production deployment needs a shared database/store. No changes to deployment configuration were made.

IDs are bearer capabilities: anyone with an ID can read or edit that record; there is no account ownership enforcement. Independent comparisons are isolated by distinct unguessable IDs, not authenticated per-conversation access controls. There is no listing tool or automatic cross-conversation selection. Keep IDs within their intended conversation. Revision checks prevent stale edits from overwriting more recent changes. Content limits: 30 items, 12 attributes, 10 sources per item.

## Deployment

The existing `Dockerfile`, `alpic.json`, Vite configuration, app identity, view domain and start/deploy commands are preserved. Deploy through the existing Alpic workflow:

```bash
npm run deploy
```

No deployment was performed as part of this replacement.

Only `show-comparison` advertises a view (`comparison`). `edit-comparison` and `get-comparison` return data only, without a UI resource binding or `viewUUID`, so mutations no longer open a second widget. The previous edit view source remains for compatibility with already served code; it is no longer advertised as a resource. Refresh the ChatGPT connector after this metadata change.
## Blank widget through ngrok

A working MCP connection does not prove that browser assets can load. The current free ngrok tunnel returns its browser-warning page for cross-origin JavaScript requests, even though MCP POST requests succeed. During diagnosis, `/_skybridge/view/comparison`, `/assets/@react-refresh`, `/@vite/client`, and `/assets/src/views/comparison.tsx` returned the warning as `text/html` without CORS for a browser-like request. The same requests with `ngrok-skip-browser-warning: true` returned `text/javascript` and `Access-Control-Allow-Origin: *`. Browser module imports cannot add that custom header, so adding it to the MCP request alone does not fix rendering. Changing the React table or relaxing CSP does not fix this response substitution.

Use a public tunnel that serves the actual JavaScript without a browser interstitial. The existing Alpic tooling supports this, after logging in:

```bash
npx alpic tunnel --port 3001
```

Use the public URL printed by the command, suffixed with `/mcp`, in the ChatGPT connector. Alternatively, use an ngrok setup with the browser interstitial removed. Verify public asset responses from a fresh browser context; accepting the warning in one browser session is not a reliable fix for ChatGPT's sandbox. Keep the local Skybridge server running on port 3001. The Alpic tunnel requires account login. After login, it was activated and all four public asset paths above returned HTTP 200 with `text/javascript` and `Access-Control-Allow-Origin: *`, without bypass headers.

In Skybridge DevTools, run `show-comparison` with JSON input `{}` for an empty comparison, or `{ "loadExample": true }` for the three-row sample. MCP advertises distinct `ui.resourceUri` bindings for `comparison` and `edit-comparison`; resource reads return `text/html;profile=mcp-app`; tool results contain the expected `structuredContent.comparison`. With tunnel forwarded headers, resource HTML and CSP use the public HTTPS/WSS origin, not localhost. The checked ChatGPT view was blank, while the local view rendered correctly. End-to-end ChatGPT rendering through the Alpic tunnel still needs verification after updating the connector URL and making a fresh tool call.

## Mounted-widget verification

Verified in Skybridge DevTools at port 3001: opened one sample comparison at revision 1 with three rows, then left its widget mounted. A separate HTTP MCP `edit-comparison` call removed `weekender` using the same comparison ID and expected revision 1. Without reloading, reopening, or running the view again, the same iframe showed two rows and revision 2; its original tool-output panel remained unchanged. An independently created comparison retained its own revision 1 and contents. This verifies synchronization in the local host interface; ChatGPT's actual pin/suspension behavior was not exercised in this test. The prior production build, both type checks and seven tests passed; this retry changed documentation only.

## Temporary development trace

No new synchronization mechanism was added for this diagnosis. Development builds show a small indicator with the widget instance UUID, comparison ID, displayed revision and last received refresh/error time. Browser console entries prefixed `[comparison-widget]` record `host-output`, `mount-polling`, `display`, `refresh-start`, `refresh-received`, `refresh-error`, `unmount-polling`, and initial-loading timeouts. Each refresh includes the requested and returned IDs, server revision/item count and any error. A development-only `debugWidgetId` on get-comparison correlates the browser instance with server reads.

Server `[comparison-trace]` entries record process/store IDs, creation/open requests, mutation-received ID, revision/item count before and after mutation, and refresh responses/errors. In development the same server entries are saved to ignored `.skybridge/comparison-trace.jsonl` (bounded to roughly 2 MiB, then reset). Production does not log these diagnostics or display the indicator. Comparison IDs grant access to their records; keep development logs private. Remove these temporary diagnostics after tracing.

Reproduce with a freshly refreshed ChatGPT connector: create one comparison, note its indicator, pin it, then request removal of one item. Compare the pinned indicator's ID with `mutation-request`, then `mutation-before`/`mutation-after`, then `refresh-response` for that widget UUID, then browser `refresh-received`/`display`. A different mutation ID means chat targeted a different record. A correct mutation with no later refresh-start/refresh-response means the pinned widget is not executing its poll or cannot reach the tool. Server refresh-response without browser receipt indicates a host/transport problem; browser receipt of a newer revision without display narrows it to rendering. Process/store changes or not-found errors point to temporary storage loss or routing to a different worker. Do not infer a ChatGPT fix from local DevTools polling alone.

The widget waits on “Loading comparison…” until a schema-valid ID, positive revision and comparison arrive; metadata alone does not render a table. Explicit tool errors are displayed, invalid results are rejected, and no valid result within 30 seconds produces an error. A valid intentionally empty comparison still displays its normal empty state. Widget mount only reads get-comparison: it never creates or overwrites server data. An earlier empty display during thinking could also be a real show-comparison creation with no initial data; show-request/host-output traces distinguish that case from the host's partial loading payload.

Diagnostic code checks: production build, both TypeScript checks, eight tests and diff whitespace checks passed. Live HTTP MCP diagnostic (not ChatGPT) kept ID `6eece3b8-0505-4d74-b63b-98b408dd62b6` through remove: revision 1 / 3 items -> revision 2 / 2 items. Mutation response metadata was absent; a read returned revision 2. The exact refreshed-connector create/pin/remove ChatGPT reproduction has not yet completed, so these facts do not establish the pinned-host failure's final cause.

## Initial-render retry (2026-11-05)

Verified actual ChatGPT rendering in a fresh conversation using **BotSuits_Local** (app ID `asdk_app_6aea8b8ed9648191bf0977183c30778f`), configured at `https://silent-doors-cough-594.alpic.dev/mcp`. A new `show-comparison` call with `{ "loadExample": true }` created comparison `f112a1e6-1b17-44d5-8adf-c9cba2514664`, revision 1, with three items (server trace at `2026-11-05T21:14:43.438Z`). The actual ChatGPT iframe displayed Everyday Daypack, Weekend Duffel and Compact Carry-on. Conversation: https://chatgpt.com/c/6aecf1a6-59ec-83eb-94e2-5f4f70a16cf4.

The configured endpoint advertised the creation resource `ui://views/ext-apps/comparison.html`; reads and mutations had no view bindings. Resource HTML used the public HTTPS origin, and the entry module, React refresh, Vite client and comparison component all returned JavaScript successfully. No application-code fix was justified: initial rendering did not fail in this reproduction. The first observed failure was the subsequent widget refresh, which displayed `ProtocolError: Unknown tool`; the populated table remained visible with its initial revision 1 data. CSP was already disabled in this ChatGPT test (the UI showed `CSP off`); this verifies that host configuration only, not CSP-enforced rendering. Pinned synchronization remains unaddressed.

Production build succeeded outside the filesystem sandbox; the sandbox attempt compiled assets but reported access errors during deployment-output generation. Both TypeScript checks and all eight deterministic tests passed. No application code, dependency or deployment configuration changed in this retry. The repository's committed baseline is the onboarding template, so it cannot establish the last working uncommitted comparison version.

## Presentation pass verification (2026-11-05)

Only comparison presentation and styles changed: header/count, wrapped product names, right-aligned columns of numeric amounts, intact number-unit pairs, source-link emphasis, consistent missing markers, and a keyboard-focusable horizontal table region. Item names stay sticky above 360px of widget content width; smaller panels scroll the whole table so names do not obscure other columns. Host light/dark themes remain supported; explicit cell text colors avoid the UI theme's dark-mode table-cell override. Loading, empty, error and synchronization paths are retained.

Local Skybridge DevTools: visually checked light/dark, desktop/mobile widths, horizontal overflow, sticky names at the wider width, source-link keyboard focus and scroll-into-view. Fixture: three fictional bags, a long Northstar product name, CHF prices, five attributes, a missing warranty, and an example.com source link.

Actual ChatGPT web side viewer: opened the same fixture, all three rows rendered, then used Open app in tab. Widget `0d739bbe-d6f9-4291-8c18-390b4fefc236` retained comparison `c86a8753-b550-4035-a916-aebc102b4e31` while a chat request removed Compact Carry-on: revision 1 / three rows became revision 2 / two rows. Server mutation completed at `2026-11-05T22:15:12.063Z`; the same mounted widget visibly displayed revision 2. No new show-comparison request or second widget followed the removal. This tested the web side viewer with the existing CSP-off setting, not a separate native Work client. Build, both TypeScript checks, eight existing tests and whitespace checks passed. No tool/server/registration/synchronization changes, new dependencies, commits or pushes.

## Visual redesign review (2026-11-05)

The second visual pass replaces the heavy header chrome with a compact title and muted count; shares sizing, radii, hover/focus states across existing controls and View source links; quiets table dividers and retains numeric alignment. Native disclosures retain explanatory and development content without displaying it above the table. Loading, empty and error messages now share the widget's typography, spacing and light/dark palette. No server, tool, ID or synchronization changes were made.

Before/after captures of the same fictional three-item comparison at revision 1 are in ignored `.skybridge/design-review/`: `before-panel.png`, `after-panel.png` (actual host panel ~620px), `before-wide.png`, `after-wide.png` (wider host ~1002px), and a self-contained `before-after.html` review. The second pass moved development details inside About to remove the remaining footer clutter. ChatGPT's iframe briefly timed out after the new icon module was bundled; its console showed a host inline-script CSP error, and the existing Try again control restored rendering. No CSP or registration change was made.

Final ChatGPT web regression: widget `3652ad65-30cf-49c7-8a04-f89f0f4c766a` retained comparison `da54ac66-8877-4d04-a92a-07cdc83498f0`. Chat removed Compact Carry-on at `22:34:28.600Z`; the same widget's read at `22:34:30.251Z` returned revision 2 / two rows, which the open side viewer displayed. The chat edit opened no second widget. Local DevTools subsequently ran independent state-preview calls, separate from that chat test. Dark narrow layout, empty state and missing-record error contrast were inspected locally. The separate native Work client and CSP-enforced rendering were not tested; ChatGPT web retained its existing CSP-off setting. Build, both type checks, eight tests and whitespace checks passed. No commit or push.

## Local sorting and filtering verification (2026-11-05)

Item and attribute header buttons toggle ascending/descending with arrows and aria-sort. Filter items matches names and displayed attribute values without changing saved data; Clear removes the filter, and Reset view also restores source order. Preferences survive same-comparison updates, reset on a different comparison, and drop a removed sort column. Numeric inference requires compatible, unambiguous amounts across the whole column; mixed units, ranges and ambiguous formats use English case-insensitive text order. Missing values stay last in both directions; ties retain source order.

ChatGPT web side-viewer test: comparison `b41e70dd-6cbd-40ad-9692-3896e387f342`, widget `a73cae51-64a5-4e38-80a9-baa6a2344c4d`. Three fictional rows used CHF 1,200, a missing price, and CHF 950. Both price directions (including keyboard activation), attribute filter `daily`, zero-match message, and Reset view passed. With ascending price and `daily` active, chat removed Metro Pack at `22:55:57.268Z`; the same widget fetched revision 2 at `22:55:58.890Z` and displayed 1 of 2 items. Clear revealed Alpine Pack and Canvas Tote, retaining the sort. No second widget opened. Controls were inspected at wide and approximately 630px panel widths. This verifies the ChatGPT web side viewer with its existing CSP-off setting, not the separate native Work client.

Production build, application and eval TypeScript checks, all 18 deterministic tests, and whitespace checks passed. Tests cover immutable rows, stable ties, missing values, numeric/text fallback, filtering, refreshed data, and disappearing sort columns. MCP tools, schemas, registration and synchronization remain unchanged. No dependencies added; no commit or push.

## Layout switch verification (2026-11-06)

Layout is local React state: Auto, Items as columns, or Items as rows. Auto transposes only when the full item count is less than the attribute count, independently of filtering; updates recalculate Auto. Manual choices survive updates to the same comparison; a different comparison starts in Auto. Both orientations consume the same sorted/filtered items. Transposed tables use attribute row headers and item column headers, with a separate Sort items selector. Reset view continues to clear sort/filter while retaining layout. Tools, data, identity, revision handling and polling are unchanged.

ChatGPT web side viewer (approximately 460px wide, existing CSP-off setting): comparison `b8dd326c-cb7a-4753-807c-079b88256151`, widget `680aea75-f500-4c43-b35c-8fac3b2f50cb`. Two fictional players and ten statistics opened in Auto as player columns. Keyboard layout changes between rows/columns retained Goals ascending, the Glacier team filter, and Ben-before-Alex order. Long names/statistic labels wrapped, with horizontal scrolling confined to the table. With manual Items as columns selected, a chat removal of Ben advanced the same mounted widget from revision 1 to 2, retaining layout, sort and filter and showing the remaining player; no second widget opened.

Subsequent local HTTP MCP fixture edits were displayed by that same ChatGPT widget: revision 3 (ten players/two statistics) used item rows even with the filter hiding nine players; revision 4 (two/two) also used item rows. These dimension edits were driven locally, not by chat. Pure local tests also cover the three dimension rules, item/attribute count changes and manual overrides. Build, both TypeScript checks, all 20 tests and diff whitespace checks passed. Separate native ChatGPT Work was not tested. No dependencies, commits or pushes.
