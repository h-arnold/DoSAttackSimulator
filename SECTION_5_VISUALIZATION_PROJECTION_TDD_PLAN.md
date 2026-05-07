# Section 5 Implementation Plan: Visualization As A Projection Of Simulation Outcomes

## Scope

This plan covers section 5 of the architecture proposal: making particles and analyzer rows derived projections of authoritative simulation outcomes rather than approximate behavioral truth.

The goal of this slice is to retain the current canvas-based visual model while establishing an explicit projection boundary between authoritative metrics and what the renderer or analyzer is allowed to show. This phase should build on sections 1 through 4 and should preserve current visual fidelity and performance targets unless an intentional correction is required.

Vitest is the appropriate primary test framework for this section because the work is deterministic projection logic and frame-pipeline integration. Playwright is not the default here because transient particle counts and analyzer sampling are better verified through deterministic projection tests than browser timing.

## Objectives

- Introduce a projection layer that converts authoritative outcomes into particle spawn batches.
- Introduce a projection layer that converts authoritative event history into analyzer rows under a sampling budget.
- Keep particle caps and analyzer budgets as performance limits only.
- Ensure projected visuals can be tested deterministically from authoritative inputs.
- Preserve renderer performance expectations and active-particle caps.
- Prevent particles or analyzer rows from being mistaken for the authoritative traffic ledger.

## Non-Goals For This Slice

- Do not redesign the canvas renderer or particle aesthetics.
- Do not move authoritative metrics back into renderer-facing state.
- Do not refactor the UI render contract; that belongs to section 6.
- Do not add user-visible visual polish work unrelated to the projection boundary.
- Do not rely on Playwright timing assertions for particle density as the primary proof of correctness.

## Delivery Strategy

The implementation should move from characterization of current visual behavior, to pure projection modules, to frame-pipeline wiring, then to cleanup and regression hardening.

### Phase 1. Characterize Current Visual Behavior

Purpose: lock down the current visual expectations that must survive the refactor.

Tasks:

- Review where particles and analyzer rows are currently created.
- Identify which inputs currently drive render density and analyzer visibility.
- Add or update characterization tests for active-particle caps, analyzer row budgets, and expected renderer inputs.
- Record which current tests accidentally treat visible rows or particles as throughput truth.

Exit criteria:

- The current visual contract is explicit enough to refactor the projection boundary safely.
- Performance-sensitive caps are pinned by tests.

### Phase 2. Specify Traffic Spawn Projection

Purpose: define how authoritative outcomes become visual particle batches.

Tasks:

- Add failing tests for a traffic-spawn projection module.
- Define inputs such as authoritative weighted outcomes, current active-particle count, and visual caps.
- Define outputs such as spawn batches or particle descriptors suitable for the renderer.
- Ensure the module is deterministic for identical inputs.

Exit criteria:

- Traffic spawn projection behavior is test-defined before implementation.
- Visual caps are explicit inputs rather than hidden side effects.

### Phase 3. Specify Analyzer Projection

Purpose: define how authoritative event history becomes visible analyzer rows.

Tasks:

- Add failing tests for analyzer sampling and row projection.
- Define the sampling budget and the shape of projected analyzer rows.
- Define how sampled-out events are counted and exposed.
- Ensure identical input event histories produce identical visible rows.

Exit criteria:

- Analyzer projection behavior is explicit and deterministic.
- Sample loss is measurable rather than silent.

### Phase 4. Implement Projection Modules

Purpose: create deterministic projection helpers.

Tasks:

- Implement `TrafficSpawnProjection` or equivalent helper.
- Implement `AnalyzerProjection` or equivalent helper.
- Add tests for cap application, deterministic output, and immutable return values.
- Ensure neither helper mutates authoritative metrics or state.

Exit criteria:

- Projection helpers are independently testable and deterministic.
- Visual budgets are enforced only inside projection helpers.

### Phase 5. Wire Projections Into The Frame Pipeline

Purpose: make the renderer and analyzer consume projections instead of raw behavior.

Tasks:

- Update the frame pipeline to read authoritative outcomes first, then project particles and analyzer rows.
- Add integration tests covering metrics -> projection -> renderer and analyzer inputs.
- Verify existing renderer and performance tests remain green.
- Confirm projected particle counts can flatten while authoritative totals keep rising.

Exit criteria:

- The frame pipeline treats visuals as projections.
- Integration tests prove caps do not feed back into authoritative behavior.

### Phase 6. Cleanup And Hardening

Purpose: remove stale projection-less logic and lock in the boundary.

Tasks:

- Remove duplicated particle-spawn logic that bypasses the projection helpers.
- Remove analyzer-row generation paths that read raw behavior directly.
- Update tests that previously asserted throughput from renderer inputs.
- Add regression tests ensuring projection outputs do not mutate authoritative inputs.

Exit criteria:

- No stale direct visual-generation path remains as behavioral truth.
- The visual projection boundary is test-protected.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one projection rule.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum projection change needed to make the test pass.
4. Refactor while preserving determinism and separation from authoritative metrics.
5. Re-run the same focused test.
6. Once stable, run broader affected integration and performance tests.
7. At the end of the slice, run `npm test`.
8. Use Playwright only for optional manual-style smoke coverage if a broad user-visible visual regression needs browser confirmation.

## Test Suite Plan

### New Test Files

- `tests/core/trafficspawnprojection.test.js`
- `tests/core/analyzerprojection.test.js`
- `tests/integration/projection.metrics.test.js`

### Existing Test Files To Review Or Update

- `tests/core/canvasrenderer.test.js`
- `tests/integration/performance.test.js`
- `tests/integration/mitigation.test.js`

Those existing tests already cover some render-facing behavior. Section 5 should retain those expectations while adding proof that renderer-facing counts are projected outputs rather than authoritative truth.

## Comprehensive Test Cases

### A. Traffic Spawn Projection Tests

File: `tests/core/trafficspawnprojection.test.js`

- Zero authoritative outcomes produce no particle spawns.
- Allowed outcomes project to allowed-traffic particles up to the configured cap.
- Blocked outcomes project to blocked-traffic particles up to the configured cap.
- Dropped outcomes project to dropped-traffic particles up to the configured cap.
- Spawn output respects `VISUAL_SPAWN_CAP_PER_SECOND` or equivalent visual cap.
- Spawn output respects `MAX_ACTIVE_PARTICLES` or equivalent active-particle limit.
- Identical inputs produce identical projected spawn batches.
- Returned spawn batches cannot be mutated back into projector internals.

### B. Analyzer Projection Tests

File: `tests/core/analyzerprojection.test.js`

- Empty authoritative event input produces no analyzer rows.
- Analyzer rows are projected deterministically from authoritative event history.
- The configured analyzer budget limits visible rows.
- Events beyond budget increment dropped-by-budget counters.
- Returned analyzer rows cannot be mutated back into projector internals.

### C. Integration Tests For Projection Boundaries

File: `tests/integration/projection.metrics.test.js`

- High authoritative traffic can continue to accumulate while particle counts flatten.
- Analyzer sample limits do not change authoritative metrics totals.
- Reset clears projected particles and analyzer rows because authoritative state resets.
- The frame pipeline sends projected particles to the renderer and projected rows to the analyzer consumer.
- Changing a visual cap changes projected outputs without changing authoritative metrics.

### D. Backward-Compatibility And Performance Tests

Files: `tests/integration/performance.test.js`, `tests/core/canvasrenderer.test.js`

- Existing performance-sensitive caps remain respected.
- Renderer still receives particle input in the expected shape.
- Visual behavior remains stable enough for current performance tests.
- Projection does not introduce a hidden second source of truth for traffic.

## Suggested Implementation Order

1. Add characterization coverage for existing particle and analyzer behavior where needed.
2. Add `tests/core/trafficspawnprojection.test.js`.
3. Implement `js/core/TrafficSpawnProjection.js`.
4. Add `tests/core/analyzerprojection.test.js`.
5. Implement `js/core/AnalyzerProjection.js`.
6. Add `tests/integration/projection.metrics.test.js`.
7. Wire both projections into `js/core/Orchestrator.js` and adjacent consumers.
8. Update render and performance tests.
9. Remove stale direct projection-less generation paths.
10. Run focused Vitest targets.
11. Run `npm test`.

## Acceptance Criteria

- Particles are projected from authoritative outcomes rather than acting as throughput truth.
- Analyzer rows are projected from authoritative event history under an explicit budget.
- Visual caps and analyzer budgets do not alter authoritative metrics.
- Projection outputs are deterministic and testable.
- Renderer and analyzer consumers receive projected data through explicit boundaries.
- All new Vitest tests for this phase pass.
- All pre-existing performance and renderer tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.

## Risks And Review Checks

- Risk: projection logic introduces visible stutter or uneven batching.
- Risk: analyzer sampling becomes nondeterministic and difficult to test.
- Risk: old direct generation paths remain alongside the new projection helpers.

Review checks:

- Verify particle caps are enforced only in projection.
- Verify analyzer row budgets are enforced only in projection.
- Verify authoritative metrics continue to rise independently of projected flattening.
- Verify returned projection data does not leak mutable references.

## Completion Gate

Section 5 is complete only when visual particle and analyzer outputs are derived projections of authoritative outcomes, visual budgets no longer act as accidental throughput truth, stale direct-generation paths have been removed or isolated, and the relevant test suite is green.