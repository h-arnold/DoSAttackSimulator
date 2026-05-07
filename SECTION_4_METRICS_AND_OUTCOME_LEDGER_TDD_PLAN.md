# Section 4 Implementation Plan: Metrics And Outcome Ledger

## Scope

This plan covers section 4 of the architecture proposal: introducing an authoritative metrics subsystem and outcome ledger that records real simulation outcomes independently of particles, analyzer rows, and other render-facing artifacts.

The goal of this slice is to make handled, blocked, dropped, and missed traffic measurable in authoritative state so later visualization and UI work can project from real outcomes rather than inferred render density. This phase should build on sections 1 through 3 without prematurely folding in the visualization and view-model refactors from sections 5 and 6.

Vitest is the appropriate primary test framework for this section because the work is ledger-centric, time-window-centric, and orchestrator-centric. Playwright only becomes necessary if this slice intentionally ships new user-visible metrics before the projection-backed UI work lands.

## Objectives

- Introduce a dedicated `MetricsCollector` or equivalent authoritative ledger.
- Record allowed, blocked, dropped, and missed outcomes as authoritative events.
- Maintain lifetime totals and rolling windows suitable for later UI display.
- Ensure metrics are independent of particle caps and analyzer row budgets.
- Reset metrics through authoritative default-state restoration rather than ad hoc counter clears.
- Add enough integration coverage to prove that real simulation outcomes are recorded correctly.

## Non-Goals For This Slice

- Do not refactor particle spawning yet; that belongs to section 5.
- Do not refactor UI rendering yet; that belongs to section 6.
- Do not redesign analyzer display or add final UI metrics panels unless explicitly choosing to widen scope.
- Do not make metrics correctness depend on canvas density or log visibility.
- Do not hand-fix unrelated renderer or DOM issues during ledger implementation.

## Delivery Strategy

The implementation should move from observability characterization, to ledger schema, to collector implementation, to orchestrator integration, then to reset and cleanup hardening.

### Phase 1. Characterize Current Observable Signals

Purpose: identify what the simulator currently exposes and where that is misleading.

Tasks:

- Review the current counters, analyzer rows, and particle-derived signals that users and tests currently treat as throughput.
- Add characterization tests for current traffic outcomes where those tests can be expressed without depending on visual caps.
- Identify where current tests rely on render artifacts instead of authoritative outcomes.
- Define the minimum event vocabulary needed for the new ledger.

Exit criteria:

- The gap between current observability and desired authoritative metrics is explicit.
- The set of outcome types to record is agreed and testable.

### Phase 2. Specify Metrics Ledger Shape

Purpose: define authoritative metrics before implementing the collector.

Tasks:

- Add failing tests for the metrics structure in authoritative state and collector snapshots.
- Define totals, rolling windows, analyzer-sample counters, and any needed raw event ledger shape.
- Decide how weighted outcomes are represented so later projections can consume them without reconstructing history.
- Keep the structure plain-data-friendly so it can be stored, cloned, and reset safely.

Exit criteria:

- The ledger shape is clear, serializable, and strongly test-defined.
- Required outcome types and window semantics are explicit.

### Phase 3. Implement MetricsCollector

Purpose: create the authoritative ledger logic.

Tasks:

- Implement outcome recording for allowed, blocked, dropped, and missed traffic.
- Implement lifetime totals and rolling windows.
- Ensure collector outputs snapshots that cannot be mutated back into internal state.
- Add tests for time-window rollover, repeated event accumulation, and reset behavior.
- Keep the collector independent of UI and renderer concerns.

Exit criteria:

- Metrics can be recorded, queried, and reset deterministically.
- Collector behavior is independently testable.

### Phase 4. Integrate Metrics Recording Into Orchestrator

Purpose: attach real simulation outcomes to the authoritative ledger.

Tasks:

- Wire collector recording into the frame pipeline at the point where outcomes are decided.
- Record outcomes after policy, topology, and capacity decisions have actually resolved.
- Add integration tests proving that mitigation decisions and server overload decisions are reflected in the ledger.
- Ensure reset paths restore metrics to defaults through authoritative state replacement.

Exit criteria:

- The frame pipeline produces authoritative metrics.
- Reset clears metrics completely and deterministically.

### Phase 5. Cleanup And Compatibility Hardening

Purpose: prevent old inferred counters from remaining accidental truth.

Tasks:

- Remove or quarantine stale counter code that duplicates authoritative outcome tracking.
- Update tests that previously used particle count or analyzer visibility as throughput truth.
- Add regression tests proving particle caps and analyzer budgets do not alter authoritative metrics.
- Document any temporary compatibility counters that still exist for rendering and why they are not authoritative.

Exit criteria:

- The authoritative ledger is the accepted source of throughput truth.
- Tests no longer normalize render artifacts as metrics.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one ledger behavior or one integration point.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum collector or orchestrator change needed to make the test pass.
4. Refactor while keeping the ledger serializable and explicit.
5. Re-run the same focused test.
6. Once the slice is stable, run broader affected Vitest files.
7. At the end of the slice, run `npm test`.
8. If this slice intentionally exposes new metrics in the browser before section 6 lands, run the narrowest related Playwright smoke test.

## Test Suite Plan

### New Test Files

- `tests/core/metricscollector.test.js`
- `tests/integration/metrics-ledger.test.js`

### Existing Test Files To Review Or Update

- `tests/state/defaultSimulationState.test.js`
- `tests/core/orchestrator.state.test.js`
- `tests/core/orchestrator.test.js`
- `tests/integration/mitigation.test.js`
- `tests/integration/performance.test.js`

Those existing files currently cover consequences of simulation outcomes from different angles. Section 4 should add authoritative metric assertions so those tests stop using particles or analyzer visibility as throughput proxies.

## Comprehensive Test Cases

### A. Default Metrics Shape Tests

File: `tests/state/defaultSimulationState.test.js`

- `runtime.metrics.totals` exists with zeroed allowed, blocked, dropped, and missed fields.
- `runtime.metrics.rollingWindow` exists with zeroed window data.
- `runtime.metrics.analyzerSample` exists with zeroed sample-tracking fields.
- `runtime.metrics.analyzerDroppedCount` defaults to zero.
- Default metrics state contains plain data only.

### B. MetricsCollector Unit Tests

File: `tests/core/metricscollector.test.js`

- Recording an allowed outcome increments the correct lifetime total.
- Recording a blocked outcome increments the correct lifetime total.
- Recording a dropped outcome increments the correct lifetime total.
- Recording a missed outcome increments the correct lifetime total.
- Multiple outcome recordings accumulate correctly.
- Rolling window totals reflect only the configured time range.
- Old window buckets age out as new ones arrive.
- Reset clears lifetime totals and rolling windows.
- Returned metric snapshots cannot be mutated back into collector internals.
- Invalid outcome types are rejected or handled explicitly.

### C. Orchestrator Integration Tests

Files: `tests/core/orchestrator.test.js`, `tests/integration/metrics-ledger.test.js`

- Allowed traffic events increment allowed metrics.
- Firewall-blocked traffic increments blocked metrics.
- Server-overload drops increment dropped metrics.
- Missed or discarded traffic, if modeled, increments missed metrics.
- Metric updates reflect real simulation decisions rather than particle counts.
- Reset restores metrics to default values.

### D. Regression Tests Against Render-Coupled Metrics

Files: `tests/integration/metrics-ledger.test.js`, `tests/integration/performance.test.js`

- High traffic can exceed visible particle counts while authoritative totals continue rising.
- Analyzer sample budgets do not alter authoritative totals.
- Changing visual caps does not change authoritative metrics.
- Metric assertions remain stable even when render-facing counts flatten for performance reasons.

## Suggested Implementation Order

1. Add default-state tests for metrics placeholders.
2. Add `tests/core/metricscollector.test.js`.
3. Implement `js/core/MetricsCollector.js`.
4. Add integration tests for orchestrator outcome recording.
5. Wire collector recording into `js/core/Orchestrator.js`.
6. Add reset and rolling-window regression tests.
7. Update existing mitigation and performance tests to assert authoritative metrics where appropriate.
8. Remove stale throughput assumptions based on particles or analyzer visibility.
9. Run focused Vitest targets.
10. Run `npm test`.
11. If this slice intentionally exposes new metrics in the UI, add or update the narrowest related Playwright smoke test.

## Acceptance Criteria

- An authoritative metrics collector exists and records outcome events independent of render artifacts.
- Lifetime totals and rolling windows are available in a serializable snapshot.
- Orchestrator records real simulation outcomes into the ledger.
- Reset restores metrics to default state through the authoritative reset path.
- Tests do not rely on particle counts or analyzer row counts as throughput truth when authoritative metrics are available.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.
- If this slice intentionally introduces user-visible metrics before section 6, the relevant browser-level smoke coverage is added or updated.

## Risks And Review Checks

- Risk: rolling windows become subtly wrong if event bucketing or time rollover is inconsistent.
- Risk: old inferred counters remain in tests and continue to act as accidental truth.
- Risk: collector snapshots leak mutable references back to callers.

Review checks:

- Verify the collector is authoritative and independent of particles and analyzer visibility.
- Verify reset clears all metric state, including rolling windows.
- Verify high-traffic tests continue to pass when visible particle counts flatten.
- Verify the ledger structure remains plain data suitable for store-backed reset and projection.

## Completion Gate

Section 4 is complete only when authoritative outcome metrics exist, the frame pipeline records them at the actual decision points, stale inferred-metric assumptions have been removed or isolated, and the relevant test suite is green.