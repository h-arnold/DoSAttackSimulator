# Simulation Parameter And State Wiring Audit

Date: 2026-05-07

Scope: This report captures the issues found while tracing how attack and defense controls flow from the UI into the simulation, how those values affect packet handling and server load, and why many settings can appear to have no effect.

Method: Static code tracing, targeted test review, focused Vitest execution, and small runtime checks using the real event handlers in a jsdom harness.

## Priority Order

1. Fix rate limiting so the production UI can actually activate it.
2. Make load balancing affect effective capacity, or relabel it everywhere as visual-only.
3. Fix reset so the UI and underlying model return to the same mitigation state.
4. Fix reverse-proxy state propagation so all IP displays and related state update consistently.
5. Improve observability so users can see true handled/blocked throughput instead of capped or indirect signals.
6. Clarify or adjust visual caps and delayed packet travel so parameter changes do not look inert.
7. Update tests so they fail on the real broken UI flows instead of bypassing them.
8. Remove stale collapse-era and dead state plumbing that is no longer used.

## Executive Summary

The main attack-side controls are wired into the attacker model correctly. Device count, attack type, target IP, attack bandwidth, and server capacity all mutate live model state and are consumed by downstream logic.

The strongest actual bugs are on the defense side:

- The rate-limit toggle in the real UI does not open the gate that the firewall actually checks.
- The load-balancing toggle only changes rendering, not capacity.
- Reset recreates core model objects but leaves the UI showing stale mitigation settings.
- Reverse-proxy state only updates part of the UI and also writes dead state into the firewall object.

Separately, several design choices make settings look flat even when the model is responding:

- Visual particle spawn is capped.
- The analyzer log is aggressively budgeted and truncated.
- There is no true handled-request counter in the UI.
- Packet processing only happens once packets reach the proxy or server edge, which introduces a visible delay before changes show up.

## Verification Performed

Focused tests run:

- `npm test -- --run tests/integration/mitigation.test.js tests/ui/eventhandlers.test.js`
- Result: passed.

Why those passing tests are not enough:

- The mitigation tests manually set `firewall.dashboardOpen`, which bypasses the real UI bug.
- The load-balancing tests only assert that a flag changes, not that capacity changes.
- The reset test checks particles and logs but does not assert UI-to-model resynchronization.

Runtime spot checks performed with the real event handlers:

- Enabling rate limiting produced `rateLimitEnabled: true` while `dashboardOpen: false`.
- Enabling load balancing changed `firewall.loadBalancingEnabled` from `false` to `true` while `server.bandwidthCapacityMultiplier` stayed at `1`.
- After reset, the model returned to `loadBalancingEnabled: false` and `rateLimitEnabled: false` while the corresponding checkboxes remained checked.

## Detailed Findings

### 1. Rate Limiting Is Effectively Disabled From The Production UI

Severity: Critical

User-visible symptom:

- Toggling rate limiting, changing the threshold, or changing the scope can appear to do nothing.
- Traffic continues to be allowed even when the threshold is set very low.

Root cause:

- The real UI only sets `firewall.rateLimitEnabled`.
- The firewall enforcement path requires both `rateLimitEnabled` and `dashboardOpen`.
- Nothing in the production UI updates `dashboardOpen`.

Evidence:

- `js/ui/EventHandlers.js:201` sets `this.orchestrator.firewall.rateLimitEnabled = e.target.checked`.
- `js/models/Firewall.js:32-33` defines `isRateLimitActive()` as `this.rateLimitEnabled && this.dashboardOpen`.
- `js/models/Firewall.js:70` only applies the rate-limit counter if `isRateLimitActive()` is true.

Why this breaks state propagation:

- The checkbox updates one piece of firewall state, but the enforcement logic reads a different gating state that is never updated.
- This is a classic split-brain control path: the UI and model both change, but the specific model state the firewall actually consumes stays false.

Reproduction:

1. Start the simulator.
2. Enable rate limiting.
3. Lower the threshold.
4. Start a flood attack.
5. Observe that no real `RATE_LIMIT` behavior occurs unless `dashboardOpen` is set manually in code.

Additional notes:

- The current spec is internally inconsistent here.
- `SPEC.md:582` still says rate limiting is only active when the firewall dashboard is enabled/open.
- `SPEC.md:738` says the firewall is no longer collapsible and all controls are always visible.
- The code currently reflects the older gate, while the layout reflects the newer always-visible design.

Fix recommendation:

- Remove `dashboardOpen` from rate-limit activation entirely if the firewall is always visible.
- If a visibility gate is still desired, the UI must own and update it explicitly.
- Update tests so the real checkbox flow, not a manual property override, is what activates rate limiting.

### 2. Load Balancing Only Changes The Renderer, Not The Simulation

Severity: Critical

User-visible symptom:

- Turning on load balancing changes the pipe drawing, but bandwidth handling does not improve.
- The tooltip and documentation promise more capacity, but the actual server behavior does not change.

Root cause:

- The checkbox only flips `firewall.loadBalancingEnabled`.
- The only consumers of that flag are renderer methods that draw dual pipes.
- Real bandwidth capacity is controlled by `server.bandwidthCapacityMultiplier`, which is only changed by the separate server-capacity slider.

Evidence:

- `js/ui/EventHandlers.js:231` sets `this.orchestrator.firewall.loadBalancingEnabled = e.target.checked`.
- `js/core/CanvasRenderer.js:98`, `js/core/CanvasRenderer.js:107`, and `js/core/CanvasRenderer.js:244` use `loadBalancingEnabled` only for drawing.
- `js/models/Server.js:59` uses `this.bandwidthCapacityMultiplier` to reduce effective load from UDP and ICMP traffic.
- `js/ui/EventHandlers.js:156` is the place that actually mutates `server.bandwidthCapacityMultiplier`.
- `index.html:86` advertises load balancing as `Doubles bandwidth capacity`.
- `README.md:81` says `Load Balancing: Double the server's bandwidth capacity`.
- `SPEC.md:124` says `Load Balancing: Doubles the effective bandwidth capacity`.

Why this breaks state propagation:

- The UI updates a renderer-facing flag, but the server logic reads a different state object entirely.
- The mitigation control is therefore decoupled from the path that computes bandwidth usage.

Runtime confirmation:

- Before enabling load balancing: `loadBalancingEnabled = false`, `bandwidthCapacityMultiplier = 1`.
- After enabling load balancing: `loadBalancingEnabled = true`, `bandwidthCapacityMultiplier = 1`.

Fix recommendation:

- Either make the load-balancing toggle update `server.bandwidthCapacityMultiplier` directly, or model load balancing as a first-class server or infrastructure concept consumed by `Server.receive()`.
- If the toggle is intentionally visual-only, the UI copy, README, and SPEC must be corrected to say so.

### 3. Reset Recreates Model State But Leaves The UI In Old Mitigation States

Severity: High

User-visible symptom:

- After pressing reset, the UI can still show load balancing, reverse proxy, rate limiting, or protocol blocks as enabled while the underlying model has already reset them to defaults.
- Users can reasonably conclude that a setting no longer works because the UI claims one thing and the engine is doing another.

Root cause:

- Reset reconstructs or resets core model objects.
- The reset handler only restores a limited subset of form fields.
- Several mitigation checkboxes and related derived UI states are never resynchronized.

Evidence:

- `js/core/Orchestrator.js:24-25` resets the server and replaces the firewall with a fresh instance.
- `js/models/Server.js:109-121` resets server capacity and reverse-proxy state to defaults.
- `js/ui/EventHandlers.js:88-105` only resets device count, attack bandwidth, attack type, target IP, rate-limit scope, and server-capacity slider.
- There is no matching reset for:
  - `check-block-tcp`
  - `check-block-udp`
  - `check-block-icmp`
  - `check-rate-limit`
  - `check-load-balancing`
  - `check-reverse-proxy`
- There is no reset call to re-hide `rate-limit-controls`.
- There is no reset call to `uiManager.updateAddressing(...)` or `uiManager.updateServerIPs(...)`.

Runtime confirmation:

- Before reset: `loadBalancingEnabled = true`, checkbox `checked = true`.
- After reset: `loadBalancingEnabled = false`, checkbox `checked = true`.
- After reset: `rateLimitEnabled = false`, checkbox `checked = true`.

Impact:

- This is one of the clearest real causes of "this setting does nothing" reports.
- It also corrupts any manual classroom demo sequence that relies on reset to restore a known baseline.

Fix recommendation:

- Reset every mitigation checkbox and any visibility or label state derived from them.
- Treat reset as a full UI-to-model resynchronization, not just a model reset.
- Add tests that assert checkbox state, proxy addressing rows, and rate-limit controls after reset.

### 4. Reverse Proxy State Only Partially Propagates Through The UI, And One Of The Writes Is Dead

Severity: High

User-visible symptom:

- Toggling reverse proxy updates some addressing UI but not all of it.
- After proxy changes or reset, one IP display can still show outdated values.

Root cause:

- The reverse-proxy checkbox calls the server toggle and updates one pair of IP display fields.
- The second server IP pair is never updated by `UIManager.updateServerIPs()`.
- The handler also writes `reverseProxyEnabled` onto the firewall object, but nothing ever consumes that property.

Evidence:

- `js/ui/EventHandlers.js:239` calls `server.setReverseProxyEnabled(enabled)`.
- `js/ui/EventHandlers.js:241` writes `this.orchestrator.firewall.reverseProxyEnabled = enabled`.
- The search surface shows that firewall reverse-proxy behavior is not read anywhere downstream; reverse-proxy routing is driven by `server.reverseProxyEnabled` throughout `js/core/Orchestrator.js`.
- `js/ui/EventHandlers.js:244` calls `uiManager.updateServerIPs(...)`.
- `js/ui/UIManager.js:71-79` only updates `displayPublicIP` and `displayOriginIP`.
- `js/ui/UIManager.js:7-11` also stores `serverOriginIP` and `serverPublicIP`, but `updateServerIPs()` never writes to those elements.
- `index.html:224` and `index.html:228` are the top IP display pair.
- `index.html:244-246` are the server card IP elements that can go stale.

Impact:

- The simulator can show inconsistent addressing depending on which part of the UI the user is watching.
- That undermines the teaching value of the reverse-proxy mitigation, which depends heavily on students understanding the public-IP versus origin-IP distinction.

Fix recommendation:

- Make one source of truth for all proxy-facing UI fields.
- Remove the dead firewall property write unless the firewall will actually own proxy-specific behavior.
- Add a test that toggles reverse proxy and verifies all IP fields update together.

### 5. The UI Does Not Expose A Reliable "Handled Requests" Metric, And The Main Observable Signals Are Capped

Severity: Medium

User-visible symptom:

- Users can increase attack size and still see little change in the visible number of packets or analyzer rows.
- They may interpret that as "the parameters are not doing anything," even when server load is changing.

Root cause:

- The simulator does not expose a cumulative handled-request counter.
- The visible network stats are derived from active weighted particles, bandwidth percentage, and half-open connections.
- The analyzer is sampled and truncated heavily.

Evidence:

- `index.html:198`, `index.html:202`, and `index.html:206` show that the network stats panel exposes only active packets, bandwidth, and half-open connections.
- `js/ui/UIManager.js:342-344` updates those fields from `state.aggregates.activeWeighted` and `state.server.bandwidthUsage`.
- `js/core/Orchestrator.js:34-36` replenishes analyzer budget at `UI_ANALYZER_LOG_MAX_PER_SECOND`.
- `js/core/Orchestrator.js:325` drops log events whenever the budget is exhausted.
- `js/constants.js:104-105` cap analyzer rendering to 20 rows and analyzer log creation to 10 events per second.
- `js/ui/UIManager.js:185` only renders the first `UI_LOG_DISPLAY_LIMIT_ANALYZER` logs.

Impact:

- The UI does not give a stable signal for "requests handled" or "requests blocked per second."
- Under load, the analyzer becomes a sampled view, not a full traffic ledger.
- This can easily make strong parameter changes look much smaller than they really are.

Fix recommendation:

- Add explicit counters for allowed, blocked, dropped, and missed traffic over a recent rolling window.
- Label the analyzer as sampled if the cap remains.
- Consider surfacing weighted throughput directly, not just bandwidth percentage and active particles.

### 6. Visual Particle Counts Flatten By Design Once Traffic Exceeds The Render Caps

Severity: Medium

User-visible symptom:

- Increasing device count or attack bandwidth beyond a certain point stops increasing visible particle count.
- The canvas can look almost unchanged across very different attack sizes.

Root cause:

- Attacker traffic uses weighted particles to preserve simulation scale while capping render cost.
- Visual packets per second are capped, and total active particles are capped.
- Beyond those caps, additional intensity is represented by higher `trafficWeight`, not more visible particles.

Evidence:

- `js/models/Attacker.js:63-64` computes desired packets per second from `deviceCount * baseRate * bandwidthMultiplier`.
- `js/models/Attacker.js:82-83` begins the spawn process from that desired rate.
- `js/models/Attacker.js:84` caps visual spawn at `VISUAL_SPAWN_CAP_PER_SECOND`.
- `js/constants.js:127-128` cap active particles at 1500 and visual spawn at 300 per second.
- `js/core/Orchestrator.js:64` stops adding particles once `MAX_ACTIVE_PARTICLES` is reached.

Why this matters:

- This is not a dead-wiring bug.
- It is a major reason the simulator can look visually flat when controls continue to work mathematically.
- If users are judging by canvas density alone, many high-end settings will seem ineffective.

Fix recommendation:

- Either surface weight more prominently in the UI, or expose a visible cue that particle count is capped and each particle now represents more traffic.
- Consider showing weighted throughput near the attacker badge or traffic analyzer as a first-class stat.

### 7. Parameter Changes Often Take Several Seconds To Show Because Enforcement Only Happens At Arrival Points

Severity: Medium

User-visible symptom:

- A user changes a mitigation and does not see a bandwidth or analyzer effect immediately.
- The simulator appears unresponsive for a few seconds after the change.

Root cause:

- Packets are generated on the left side of the canvas and only inspected when they reach either the proxy checkpoint or the far server edge.
- Legitimate and malicious packets travel at finite speeds.

Evidence:

- `js/core/Orchestrator.js:177` defines the proxy checkpoint path.
- `js/core/Orchestrator.js:187` defines the server-edge path.
- `js/constants.js:120-121` set legitimate packet speed to 150 px/sec and malicious packet speed to 200 px/sec.

Impact:

- Changing a defense after packets are already in flight does not retroactively inspect them.
- This delay is especially easy to misread as a nonfunctional control.

Assessment:

- This is mostly a model/UX timing issue, not a wiring bug.
- It still belongs in the report because it directly explains the user's perception that settings are not having any impact.

Fix recommendation:

- If the current delay is pedagogically useful, document it in the UI.
- Otherwise, consider applying certain mitigation changes to in-flight packets or showing a small notice that changes take effect as packets reach the edge.

### 8. Tests And Documentation Normalize Or Hide The Broken Paths

Severity: Medium

User-visible symptom:

- CI can stay green while the real product flow remains broken.

Root cause:

- Tests bypass the actual broken UI path.
- Some tests only assert state flags or visuals instead of behavioral consequences.
- The spec contains conflicting statements about the firewall dashboard.

Evidence:

- `tests/integration/mitigation.test.js:15` manually sets `orchestrator.firewall.dashboardOpen = true`.
- `tests/integration/mitigation.test.js:37` manually sets `dashboardOpen = false`.
- `tests/integration/mitigation.test.js:59` and `tests/integration/mitigation.test.js:66` only assert that `loadBalancingEnabled` becomes true.
- `tests/ui/eventhandlers.test.js:110` checks reset behavior, but not checkbox-to-model resynchronization.
- `tests/ui/eventhandlers.test.js:192` checks that rate-limit controls become visible, but not that rate limiting is actually active.
- `SPEC.md:582` still describes a dashboard-open gate for rate limiting.
- `SPEC.md:738` says the firewall is always visible and no longer collapsible.

Impact:

- The current test suite protects the wrong abstraction boundary in a few key places.
- The docs make it harder to tell whether observed behavior is a bug or the intended design.

Fix recommendation:

- Add UI-driven integration tests that use the real checkbox handlers and then assert server/firewall behavior.
- Update the spec to remove contradictions and describe the actual ownership of each mitigation.
- Add a reset-state test that verifies the DOM matches the recreated model objects.

### 9. There Is Stale And Dead Plumbing Left Over From Older UI Shapes

Severity: Low

User-visible symptom:

- Usually none directly, but this code makes the real defects harder to reason about and easier to reintroduce.

Examples:

- `js/ui/EventHandlers.js:27-29` still captures `btnToggleFirewall`, `firewallDashboard`, and `firewallToggleIcon`, but there is no active collapse behavior using them.
- `js/ui/EventHandlers.js:33` and `js/ui/EventHandlers.js:39` bind `checkReverseProxy` twice.
- `js/ui/EventHandlers.js:241` writes `firewall.reverseProxyEnabled`, but no downstream logic uses it.

Impact:

- These artifacts make it look like the firewall owns more state than it really does.
- They increase the chance of future partial or split-brain fixes.

Fix recommendation:

- Remove unused element bindings and dead state writes.
- Consolidate mitigation ownership so each toggle has one clear model owner and one clear behavioral consumer.

## Confirmed Working Paths

These were checked and do not appear to be the source of the current problem report:

- `js/models/Attacker.js:63-64` correctly computes attack volume from device count, base rate, and bandwidth multiplier.
- `js/models/Attacker.js:82-97` uses that rate to spawn weighted traffic.
- `js/ui/EventHandlers.js:113-141` correctly pushes device count, attack type, target IP, and attack bandwidth into the attacker model.
- `js/ui/EventHandlers.js:156` correctly pushes the server-capacity slider into `server.bandwidthCapacityMultiplier`.
- `js/models/Server.js:47-59` consumes packet type and capacity as expected for the current simulation model.

Important caveat:

- Legitimate `HTTP_GET` traffic does not materially increase load by design in the current model.
- `js/models/Server.js:47-54` accepts HTTP traffic as long as the server is not already crashed or saturated.
- `SPEC.md:556` explicitly says `HTTP_GET packets do not meaningfully increase load`.
- This is not a wiring bug, but it does mean that some baseline traffic knobs will not move bandwidth or CPU in the way a user might intuitively expect.

## Recommended Fix Sequence

1. Remove or correctly wire the stale `dashboardOpen` gate and add a UI-driven rate-limit test.
2. Rework load balancing so the mitigation changes actual server capacity and add behavioral tests.
3. Make reset fully resynchronize the DOM with the recreated model state.
4. Unify reverse-proxy UI updates and remove dead firewall proxy state.
5. Add explicit allowed/blocked/dropped throughput counters to the UI.
6. Decide whether visual caps and packet-travel delay need UX explanation or model changes.
7. Clean out stale collapse-era bindings and update documentation/spec text to match the final behavior.
