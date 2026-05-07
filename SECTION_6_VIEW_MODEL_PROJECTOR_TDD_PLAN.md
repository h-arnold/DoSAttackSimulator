# Section 6 Implementation Plan: View Model Projector

## Scope

This plan covers section 6 of the architecture proposal: introducing a single projection step from authoritative state into UI-friendly view models and making UI rendering depend on that projection rather than ad hoc imperative DOM mutation.

The goal of this slice is to ensure every user-visible panel, label, badge, and synchronized addressing display comes from one projected snapshot. This phase should build on sections 1 through 5 and should remove hand-maintained UI state where that state currently drifts from simulation truth.

Vitest is the appropriate primary test framework for this section because the core behavior is pure projection plus DOM rendering from deterministic inputs. Playwright may be appropriate for one or two narrow end-to-end smoke journeys if visible label synchronization becomes a user-facing regression risk.

## Objectives

- Introduce `ViewModelProjector` or equivalent pure projection layer.
- Define a stable view-model schema for server, firewall, topology, metrics, analyzer, and control-state display.
- Refactor `UIManager` to render from `render(viewModel)` rather than reconstructing state from orchestrator internals.
- Eliminate piecemeal UI patch methods as sources of behavioral truth.
- Ensure duplicated labels are synchronized by construction.
- Make reset, topology, and mitigation UI updates flow from projected state rather than imperative patches.

## Non-Goals For This Slice

- Do not redesign the page layout or CSS.
- Do not add new controls or new visual features unrelated to state projection.
- Do not reintroduce direct UI mutation from event handlers.
- Do not push projection logic down into DOM helpers in a way that recreates split ownership.
- Do not rely on Playwright as the primary proof of projector correctness.

## Delivery Strategy

The implementation should move from current UI characterization, to schema definition, to pure projection, to UIManager refactor, then to integration and cleanup.

### Phase 1. Characterize Current UI State Consumption

Purpose: identify which UI fields are currently updated imperatively and which labels drift.

Tasks:

- Review `js/ui/UIManager.js` and catalog every value it reads or reconstructs.
- Identify duplicated labels for IPs, topology state, mitigation state, and metrics.
- Add or update characterization tests for current UI output that should remain stable.
- Identify methods that exist only to patch individual labels or panels.

Exit criteria:

- The current UI update surface is explicit.
- The intended projection targets are known before implementation.

### Phase 2. Define View Model Schema

Purpose: specify the data contract that the UI will render.

Tasks:

- Add failing tests that define the expected view-model shape.
- Group fields into coherent sections such as server, firewall, topology, metrics, analyzer, and controls.
- Ensure the schema contains all data needed by the current UI without requiring UIManager to derive additional domain state.
- Keep the schema plain data and deterministic.

Exit criteria:

- The view-model schema is explicit and test-defined.
- UI rendering needs can be met from one projected snapshot.

### Phase 3. Implement ViewModelProjector

Purpose: create the pure projection layer.

Tasks:

- Implement `js/core/ViewModelProjector.js` or equivalent pure projector.
- Project synchronized IP labels and topology labels from authoritative topology state.
- Project firewall display state from authoritative firewall config.
- Project capacity and server stats from authoritative runtime and capacity state.
- Project metrics and analyzer display data from the authoritative ledger and projection outputs.
- Add tests for determinism, deep-copy safety, and synchronization across duplicated labels.

Exit criteria:

- View-model projection is independently testable and deterministic.
- All UI-facing data can be derived from state plus previously established projections.

### Phase 4. Refactor UIManager To Render View Models

Purpose: make UIManager a renderer, not a state owner.

Tasks:

- Replace `UIManager.update(...)` patterns with `UIManager.render(viewModel)`.
- Remove direct orchestrator or model reads from UIManager.
- Add tests for idempotent rendering and minimal DOM updates where feasible.
- Keep `EventHandlers` as command adapters only.

Exit criteria:

- UIManager renders from view-model input only.
- Re-rendering the same view model does not produce spurious state drift.

### Phase 5. Wire Projection Into Orchestrator And Commands

Purpose: make projection-backed rendering the default app flow.

Tasks:

- Update orchestrator flows so state changes lead to projected view models and then UI rendering.
- Add integration tests covering command -> state -> projection -> UI render.
- Confirm reset and topology changes now update every relevant label through projection.
- Confirm metrics and analyzer display data are synchronized with the same snapshot.

Exit criteria:

- The app renders from projected state after control changes and frame updates.
- UI drift bugs are prevented by the architecture, not patched around.

### Phase 6. Cleanup And Hardening

Purpose: remove stale imperative patch paths and protect the new boundary.

Tasks:

- Remove patch-style UI methods that are no longer needed.
- Remove tests that assert imperative patch sequencing instead of final projected output.
- Add regression tests for synchronized labels, reset rendering, and repeated render safety.
- If user-facing label synchronization becomes a high-risk regression area, add one narrow Playwright smoke journey.

Exit criteria:

- The UI has one rendering contract.
- Stale manual UI state repair paths are gone or clearly temporary.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one projected field set or one rendering behavior.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum projector or UI rendering change needed to make the test pass.
4. Refactor while keeping projection deterministic and UI rendering read-only.
5. Re-run the same focused test.
6. Once stable, run broader affected UI and integration tests.
7. At the end of the slice, run `npm test`.
8. If the slice introduces or changes a user-visible end-to-end label journey that Vitest does not cover confidently, run or add the narrowest related Playwright smoke spec.

## Test Suite Plan

### New Test Files

- `tests/core/viewmodelprojector.test.js`
- `tests/ui/uimanager.render.test.js`
- `tests/integration/ui.projection.test.js`

### Existing Test Files To Review Or Update

- `tests/ui/uimanager.test.js`
- `tests/ui/eventhandlers.test.js`
- `tests/integration/mitigation.test.js`
- `tests/visual/app-shell.spec.js`

Those existing files already touch visible UI behavior. Section 6 should shift them toward projected output and reserve browser coverage for narrow user journeys rather than field-by-field mutation details.

## Comprehensive Test Cases

### A. View Model Schema Tests

File: `tests/core/viewmodelprojector.test.js`

- Projected output contains server display fields.
- Projected output contains firewall display fields.
- Projected output contains topology display fields.
- Projected output contains metrics display fields.
- Projected output contains analyzer display fields.
- Projected output contains control-state display fields.
- Identical state snapshots produce identical view models.
- Returned view models cannot be mutated back into projector internals.

### B. Synchronized Display Tests

File: `tests/core/viewmodelprojector.test.js`

- All public-IP labels in the projected output agree.
- All origin-IP labels in the projected output agree.
- Reverse proxy state is reflected consistently across all projected label groups.
- Firewall rate-limit display fields derive from one authoritative source.
- Capacity and server-status display fields derive from one authoritative source.

### C. UIManager Render Tests

File: `tests/ui/uimanager.render.test.js`

- `render(viewModel)` updates current UI labels from projected state.
- Rendering the same view model twice leaves the DOM in the same state.
- Rendering a changed view model updates the corresponding labels and controls.
- UIManager does not need direct reads from orchestrator-owned domain objects.
- Reset-oriented view models clear UI panels and counters correctly.

### D. End-To-End Projection Integration Tests

File: `tests/integration/ui.projection.test.js`

- A command changes state, projector emits a new view model, and the UI reflects it.
- Reverse proxy changes propagate to every addressing label through projection.
- Capacity changes propagate to server labels through projection.
- Metrics changes propagate to UI labels through projection.
- Reset produces a default view model and the UI reflects it completely.

### E. Optional Browser-Level Smoke Tests

Files: `tests/visual/app-shell.spec.js` or a new targeted visual spec

- If visible synchronization regressions are a concern, a smoke test covers one topology or reset journey.
- Browser-level checks stay narrow and user-facing rather than duplicating projector unit coverage.

## Suggested Implementation Order

1. Add characterization coverage for current UI output where needed.
2. Add `tests/core/viewmodelprojector.test.js`.
3. Implement `js/core/ViewModelProjector.js`.
4. Add `tests/ui/uimanager.render.test.js`.
5. Refactor `js/ui/UIManager.js` to render from a view model.
6. Add `tests/integration/ui.projection.test.js`.
7. Wire projection-backed rendering into `js/core/Orchestrator.js`.
8. Remove stale patch-style UI methods.
9. Update any narrow browser smoke coverage if a visible journey changed materially.
10. Run focused Vitest targets.
11. Run `npm test`.
12. If needed for visible user journeys, run `npm run test:visual` for the narrow affected spec.

## Acceptance Criteria

- A pure view-model projector exists and produces deterministic UI snapshots.
- UIManager renders from projected data only.
- Duplicated UI labels are synchronized by projection rather than manual coordination.
- Command and frame-driven updates both render through the same projection contract.
- Reset and topology changes propagate to every relevant label without manual patching.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.
- If a visible end-to-end UI journey changed materially, the relevant Playwright smoke coverage is added or updated.

## Risks And Review Checks

- Risk: the view-model schema becomes too broad or under-specified and UIManager starts re-deriving domain state.
- Risk: stale imperative patch methods survive and create a second rendering path.
- Risk: projector output leaks mutable references or unstable fields that make rendering nondeterministic.

Review checks:

- Verify UIManager reads only from the view model.
- Verify duplicated labels are projected from a single source.
- Verify reset and topology regressions are covered by integration tests.
- Verify optional Playwright coverage stays focused on user-visible journeys rather than duplicating Vitest detail.

## Completion Gate

Section 6 is complete only when a single projected view model drives UI rendering, stale imperative patch paths have been removed or isolated, synchronized labels are protected by tests, and the relevant test suite is green.