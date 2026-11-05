# OpenMCP reference and Botsuits synchronization (2026-11-05)

Reference checkout: `C:/Users/marco/Documents/git_repos/openmpcapp/open-mcp-apps-main`, package `@2nd1st/open-mcp-apps` 0.10.1. Inspected read-only; no install, execution or changes there. Installed Botsuits Skybridge: 2.1.0.

## Pinning is separate from data delivery

The bundled **dashboard** is the concrete reference. `seed.mjs:73` (`seedSystemApps`) reads its HTML and manifest and persists it with `store.execute({type:"save_app", name,...})`. `components/dashboard/manifest.json` declares preferences, not a host pin operation. The downloaded `components/` contains dashboard, settings and app-store; the separate store catalog is not included. This is a trace of a bundled app, not a claim to have run all hosted store templates.

`src/tools/apps.mjs:237`, `registerApp(name)`, registers `ui://open-mcp-apps/dashboard.html`. Its callback reads the latest app, calls `wrapApp`, and supplies the security metadata from `uiSecurityFor` (line 210): standard `ui.csp`/optional domain and OpenAI compatibility keys. `src/mcp-apps.mjs:26`, `registerAppTool`, mirrors nested `ui.resourceUri` and flat `ui/resourceUri`; `registerAppResource` (line 35) uses `text/html;profile=mcp-app`.

There are two opening paths:

- `src/tools/apps.mjs:411`: universal `open_app {app:"dashboard"}` points at the loader resource registered at line 395. It returns app/collection identity and a version, deliberately zero rows. `src/shell.mjs:422`, `wrapLoader`, injects the host runtime and loader; the loader fetches the selected app.
- `syncOpeners` (apps.mjs:318) optionally registers `open_dashboard` through `registerOpener` (line 330), bound directly to the dashboard resource. The preference `settings`, group `dashboard`, key `open_tool`, enables this. This source's “pinned opener” means an extra MCP tool, not ChatGPT Work's pinned iframe. Dashboard heart buttons (`components/dashboard/ui.html:849`, `heartButton`; `syncPins`, line 737) are another internal favorite list, also not the host pin operation.

`src/shell.mjs:451`, `wrapApp`, injects `__OMA_APP__`, `__OMA_COLLECTION_HINT__`, and the bundled runtime before app scripts. `src/shell-runtime.js:36` constructs the ext-apps `App`. `ontoolinput` (1930) and `ontoolresult` (1941) establish identity; `hostApp.connect` (2002) connects it. The app uses `oma.ready`/`oma.onChange` (dashboard lines 1336 onwards). Host calls in this runtime are `callServerTool` (400), `sendMessage` (1681), `openLink` (1701), `requestDisplayMode` (1718), host-context callbacks and initialization. There is no host pin call in this path. Pin placement, side-view chrome, iframe lifetime and suspension are supplied by the host, whose implementation is outside this checkout.

What this proves: the app offers an MCP Apps UI resource and initializes its host bridge; the host decides which placement controls to offer. The source alone cannot prove a universal ChatGPT eligibility rule or that every host/version offers a pin button. Runtime Botsuits testing established that its existing resource already offers **Open app in tab**, retaining the same widget UUID in the side viewer; no pin-specific application code is needed for that placement.

## A chat data edit, independently of pinning

For a deletion reflected in dashboard previews, the model can call `src/tools/data.mjs:544`, `data_delete_item`, with the stable item `id`, optional collection assertion and `expected_version`. Its handler routes to `run(a,"delete_item")`; the own-store execution reaches `src/store.mjs:1619`'s `core` delete branch. It checks the row's version and confirmation policy, removes that ID and emits `item_deleted` (line 1639) including its collection and preimage. `txExecute` (2054) wraps the command in a SQLite transaction; `execute` (2100) calls `notify` after the committed execution. SQLite current-state tables and the append-only change ledger persist the result. No widget resource is attached to this mutation.

Identity has distinct levels: app registry `name` (dashboard); collection name (the rendered data set); stable item `id` (the mutation target); global ledger `seq`/snapshot `version` (freshness). A mounted widget does not become the newest app whenever another tool returns.

The host-mode refresh transport is visible in the checkout, not a hidden hosted service:

- `src/engine.mjs:445` defines `WIDGET_CALLABLE`; the wrapper at 500 sets `openai/widgetAccessible: true` at line 512. Internal-only readers also get `ui.visibility:["app"]`; generic data tools remain available to chat.
- `shell-runtime.js:389`, `rawCall`, uses `hostApp.callServerTool` at line 400 in a host. The standalone browser branch uses its configured `/rpc` endpoint instead.
- For ordinary data apps, `pollTick` (1779) probes `get_data_version`; `checkOwnChanges` (1767) checks `data_changes`, then `walk` (483) reads `data_list` through `readCollection` and `adopt` fires `changeCbs` (244-248). Polling is adaptive, visible-page gated, and resumes on `visibilitychange` (1798).
- Dashboard additionally owns its cross-collection preview polling: `poll` (ui.html:1269) probes the seq; `loadAll` (1216) fetches collection/app metadata; `hydrate` (1198) reads each collection and `patchCard` (1188) replaces its preview body. Its final `schedule` loop calls `poll` while visible. Thus an external deletion is fetched, not magically pushed by a chat result.
- The SSE branch at runtime line 1902 is under standalone mode. It is not evidence of a ChatGPT iframe SSE subscription. `screen_poll`/`screen_act` are a separate UI-action relay, not necessary for a stored-record delete and not adopted in Botsuits.

The downloaded source traces the persisted mutation and mounted fetch/render code. It does not contain ChatGPT Work's host implementation, nor was the reference OpenMCP service executed during this investigation.

## Botsuits failure and minimal change

Creation is unchanged: `src/server.ts`'s `show-comparison` has its original view, returns validated initial data and supplies the random comparison ID/revision. `get-comparison` and `edit-comparison` remain data-only. `ComparisonStore.edit` (`src/comparison-store.ts:33`) atomically updates the selected comparison and increments its revision; it remains temporary in-memory storage, unlike OpenMCP SQLite.

`src/components/comparison-table.tsx:44`, `LiveComparison`, already polls with `useCallTool("get-comparison")` at line 48; `refresh` calls `callToolAsync` at line 62 and applies only a newer revision of the same ID. Skybridge `dist/web/hooks/use-call-tool.js` routes through the adaptor, and `dist/web/bridges/adaptor.js:118` uses ext-apps `app.callServerTool`. Initial rendering does not wait for that read.

Before the change, the actual ChatGPT side viewer retained widget `a612d8a2-2f5b-49b3-a1fc-fe05ab239fe6`, comparison `f112a1e6-1b17-44d5-8adf-c9cba2514664`, revision 1, three rows, but reported `ProtocolError: Unknown tool` on refresh. Public `tools/list` returned `_meta:{}` for `get-comparison`. This locates the failure before the widget read reaches its handler, not in the mutation or React revision update.

The fix is one metadata field: `src/server.ts:42`, `_meta: {"openai/widgetAccessible":true}` on `get-comparison`. Skybridge's own `dist/server/server.d.ts:180` documents this key as allowing the rendered iframe to call a tool. This matches OpenMCP's wrapper. No new polling, event transport, view-state copy or mutation widget was added. The regression assertion in `evals/start.eval.ts` verifies accessibility and absence of a read-resource binding alongside the existing creation/mutation checks.

The local process behind the tunnel was still serving old metadata, so it was restarted on port 3000. This intentionally reset its temporary records; testing uses a new comparison. ChatGPT's BotSuits_Local connector was refreshed. The unchanged public endpoint is `https://silent-doors-cough-594.alpic.dev/mcp`. Do not assume README's historical port 3001 is the tunnel target: runtime tracing identified port 3000 for this test.

## Verification

Build, both TypeScript checks and all eight deterministic tests passed. Public `tools/list` now advertises read accessibility; creation has its original resource; mutation remains data-only. ChatGPT's refreshed widget successfully polls and displays `received revision 1` rather than `Unknown tool`.

Actual ChatGPT web side-view acceptance passed in [Create Bag Comparison](https://chatgpt.com/c/6aecf1a6-59ec-83eb-94e2-5f4f70a16cf4), using a newly created comparison in the existing diagnostic conversation. It was not a fresh conversation. The host action was named **Open app in tab**, not a literal **Pin** button. It moved the existing widget into the side viewer without changing its instance ID. Thus this directly verifies mounted side-view synchronization in ChatGPT, not a separate native Work pin implementation.

| Stage | Widget instance ID | Comparison ID | Revision | Rows |
| --- | --- | --- | --- | --- |
| Initial render, before side-view placement | `833180bc-ee66-47fe-bbee-1157bee47bb5` | `5c75f406-5cd2-4bed-bc73-b1e8f35ed450` | 1 | 3 |
| After side-view placement | same | same | 1 | 3 |
| After chat removed Weekend Duffel | same | same | 2 | 2 |
| After daily-essentials recommendation | same | same | 2 | 2 |

At `21:35:24.653Z` the server created the new comparison. At `21:38:08.144Z` the chat mutation requested `remove`, item `weekender`, expectedRevision 1; `mutation-after` at `21:38:08.148Z` showed revision 2 / two items. The same widget's first revision-2 `refresh-response` was `21:38:10.843Z`. The browser then visibly showed Everyday Daypack and Compact Carry-on, revision 2. There was no new `show-request` after the removal and no new widget opened. The recommendation appeared in chat: Everyday Daypack, 18 L, 600 g. The widget still showed the same instance, record, revision 2 and two rows; no further mutation was logged. Process `18880`, store `09057d61-ac34-4cf8-9c14-e12188f4e467` stayed constant throughout this test.

Testing uses the existing ChatGPT web host with CSP already off. Side-view placement is directly verified; a separate native ChatGPT Work client, a fresh Work conversation, CSP enforcement and suspension/restart behavior are not inferred from this session. The exact native Work test and captures below remain available for that boundary.

## Repeatable manual test for ChatGPT Work

1. Run the updated server, point the existing tunnel at its printed port, and refresh BotSuits_Local tools. In a new Work conversation select that app and ask: `Create a new comparison with the three fictional travel bags using show-comparison with loadExample:true.`
2. Verify all three rows, then use Work's host pin action. Record the **post-pin** widget UUID W, comparison UUID C, revision 1, and last successful read time. Pinning may reparent or remount in a different host; record W after placement.
3. Ask: `Remove Weekend Duffel from the comparison currently pinned.` Do not reopen it or reload. Require the same W and C, revision 2, two rows. There must be one `edit-comparison` call and no new `show-comparison` after the edit.
4. Ask: `Which remaining bag is best for daily essentials?` Require a chat recommendation with W/C/revision 2 unchanged and no mutation call.
5. On failure capture: app name and configured MCP URL; widget screenshot before/after with W/C/revision/read time; tool arguments/results; console `[comparison-widget]` entries `refresh-start`, `refresh-received`, `refresh-error`, `display`, `unmount-polling`; matching `.skybridge/comparison-trace.jsonl` events `mutation-request/before/after` and `refresh-response/error` with process/store ID. `Unknown tool` before any server read suggests stale connector metadata or host tool access; no executing refresh suggests suspension; different IDs suggest targeting; process/store changes suggest record loss. Keep bearer IDs/logs private.
