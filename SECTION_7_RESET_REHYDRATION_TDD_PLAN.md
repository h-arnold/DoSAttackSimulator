# Section 7 Implementation Plan: Rebuild Reset As Default-State Rehydration

## Scope

This plan covers section 7 of the architecture proposal: rebuilding reset as authoritative default-state replacement followed by normal projection and rendering, rather than piecemeal field repair across models and DOM state.

The goal of this slice is to make reset a single deterministic operation that restores authoritative state, projected visuals, and projected UI to defaults without depending on incidental cleanup order. This phase should build on sections 1 through 6 and should remove manual reset repair paths wherever the new architecture makes them obsolete.

Vitest is the appropriate primary test framework for this section because reset is a state, projection, and integration concern. Playwright may be appropriate for one narrow reset-button smoke journey if the visible reset contract changes materially, but browser timing is not the primary proof of correctness.

## Objectives

- Express reset as store replacement from authoritative defaults.
- Ensure projected visuals and UI return to default through normal rendering flow.
- Clear runtime traffic, analyzer state, metrics, and control flags through one deterministic path.
- Remove stale piecemeal reset code from orchestrator, models, and UI layers.
- Make repeated reset calls idempotent and deterministic.
- Add enough regression coverage to prevent partial reset drift from returning.

## Non-Goals For This Slice

- Do not change the default values themselves unless a separate behavioral decision requires it.
- Do not add a new reset UX.
- Do not preserve stale model-specific reset helpers purely for compatibility if the new architecture makes them unnecessary.
- Do not hand-fix unrelated bugs while cleaning up reset.
- Do not rely on browser-only checks for reset semantics that are better expressed through state and projection tests.

## Delivery Strategy

The implementation should move from characterizing current reset behavior, to specifying reset semantics, to store-backed implementation, then to projection-backed integration and cleanup.

### Phase 1. Characterize Current Reset Behavior

Purpose: define the current reset contract and locate the partial repairs that need removal.

Tasks:

- Review the current reset path in orchestrator, models, and UI code.
- Catalog which fields are manually cleared, restored, or patched.
- Identify where reset currently leaves stale mitigation state, addressing labels, particles, analyzer rows, or counters behind.
- Add or update characterization tests for the current reset outcomes that should remain true after refactor.

Exit criteria:

- The existing reset surface is explicit.
- The stale and partial reset paths are known before implementation starts.

### Phase 2. Specify Reset Semantics

Purpose: define what a correct reset means under the new architecture.

Tasks:

- Add failing tests that define reset as replacement with a fresh default state tree.
- Define which runtime branches must be cleared and which config branches must return to default.
- Define reset idempotency and determinism expectations.
- Define the expectation that UI and render state refresh from the normal projection path after reset.

Exit criteria:

- Reset semantics are explicit and strongly test-defined.
- There is one accepted definition of reset correctness.

### Phase 3. Implement Store-Backed Reset

Purpose: make authoritative state replacement the source of reset behavior.

Tasks:

- Implement reset through `defaultSimulationState()` replacement in the store.
- Ensure reset clears metrics, particles, analyzer state, runtime server state, and control flags through authoritative replacement.
- Add tests proving repeated resets produce identical state snapshots.
- Ensure reset does not preserve leaked nested references.

Exit criteria:

- Reset is implemented as store replacement.
- Reseted state is deterministic and isolated from prior references.

### Phase 4. Re-Project UI And Visual State From Reset State

Purpose: make reset visible by normal projection rather than special-case patching.

Tasks:

- Update the reset flow so it triggers normal projector and UI render paths.
- Ensure projected particles, analyzer rows, and UI labels reflect the reset state.
- Add integration tests for reset -> projection -> UI render.
- Verify reset leaves no stale visible state in topology, mitigation, metrics, or analyzer displays.

Exit criteria:

- Reseted state is reflected through the same paths as all other state changes.
- No special-case UI patching is needed to look correct after reset.

### Phase 5. Remove Stale Reset Repair Paths

Purpose: prevent old piecemeal reset logic from shadowing the new architecture.

Tasks:

- Remove field-by-field reset code that is superseded by authoritative replacement.
- Remove stale model reset helpers that are no longer part of the reset contract.
- Update tests that previously depended on partial reset internals.
- Search for remaining direct reset repairs in orchestrator, UI, and models.

Exit criteria:

- Reset is one coherent operation.
- Stale manual reset repairs are gone or clearly temporary.

### Phase 6. Harden Reset Against Regression

Purpose: ensure reset remains correct across varied prior states.

Tasks:

- Add tests for reset after active attack, after mitigation changes, after high traffic, and after repeated resets.
- Add tests proving reset restores all config branches and clears all runtime branches.
- If the visible reset journey changes materially, add one narrow Playwright smoke test for the reset button.

Exit criteria:

- Reset remains deterministic from any relevant prior state.
- The end-to-end contract is test-protected.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one reset guarantee.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum store, projector, or cleanup change needed to make the test pass.
4. Refactor while preserving reset determinism and atomicity.
5. Re-run the same focused test.
6. Once stable, run broader affected integration tests.
7. At the end of the slice, run `npm test`.
8. If the user-visible reset flow changed materially and is not already covered well enough, run or add the narrowest related Playwright smoke spec.

## Test Suite Plan

### New Test Files

- `tests/core/orchestrator.reset.test.js`
- `tests/integration/reset.comprehensive.test.js`

### Existing Test Files To Review Or Update

- `tests/core/orchestrator.state.test.js`
- `tests/core/orchestrator.test.js`
- `tests/integration/mitigation.test.js`
- `tests/visual/app-shell.spec.js`

Those existing files already touch reset outcomes. Section 7 should move them toward authoritative-state and projection-backed assertions rather than manual cleanup details.

## Comprehensive Test Cases

### A. Store Replacement Reset Tests

File: `tests/core/orchestrator.reset.test.js`

- Reset replaces the authoritative state with a fresh default tree.
- Reset clears runtime traffic arrays.
- Reset clears runtime metrics.
- Reset clears runtime server state.
- Reset clears runtime control flags.
- Reset restores attack, legitimate traffic, firewall, topology, and capacity config defaults.
- Reset performed twice yields the same resulting state snapshot.
- Returned reset state does not share stale nested references with pre-reset state.

### B. Integration Reset Tests

File: `tests/integration/reset.comprehensive.test.js`

- Reset after an active simulation returns the app to default state.
- Reset after mitigation changes restores default mitigation config.
- Reset after topology changes restores default addressing config.
- Reset after high traffic clears projected particles and analyzer rows because authoritative state resets.
- Reset after metric accumulation returns authoritative metrics to zeroed defaults.
- Reset after repeated control commands leaves the app in the same default state as a cold start.

### C. Projection And UI Reset Tests

Files: `tests/integration/reset.comprehensive.test.js`, `tests/ui/uimanager.render.test.js`

- Reset triggers normal view-model projection and UI rendering.
- UI labels reflect default reset state without manual patching.
- Analyzer display reflects reset state without stale rows.
- Topology and mitigation labels reflect default reset state across all duplicated displays.

### D. Optional Browser-Level Smoke Tests

Files: `tests/visual/app-shell.spec.js` or a new targeted reset spec

- If the visible reset-button journey changes materially, a narrow browser test verifies the reset button restores obvious default UI state.
- Browser coverage stays narrow and does not duplicate state-reset unit and integration detail.

## Suggested Implementation Order

1. Add `tests/core/orchestrator.reset.test.js`.
2. Implement authoritative reset replacement in `js/core/Orchestrator.js` and related store usage.
3. Add `tests/integration/reset.comprehensive.test.js`.
4. Wire reset through normal projector and UI render flow.
5. Update existing orchestrator and mitigation tests to assert outcomes instead of manual cleanup details.
6. Remove stale field-by-field reset logic from orchestrator, models, and UI helpers.
7. Add or update one narrow browser smoke test only if the visible reset journey changed materially.
8. Run focused Vitest targets.
9. Run `npm test`.
10. If needed for user-facing reset coverage, run `npm run test:visual` for the affected spec.

## Acceptance Criteria

- Reset is implemented as authoritative default-state replacement.
- Reset clears all relevant runtime branches and restores all relevant config branches.
- Reseted UI and projected visual state come from the normal projection/render flow.
- Repeated resets are deterministic and idempotent.
- Stale piecemeal reset logic is removed or clearly temporary.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.
- If the visible reset-button journey changed materially, the relevant Playwright smoke coverage is added or updated.

## Risks And Review Checks

- Risk: nested state references survive reset and cause stale behavior after replacement.
- Risk: a stale special-case UI patch path remains and masks reset bugs in tests.
- Risk: reset correctness depends on call order instead of one authoritative replacement.

Review checks:

- Verify reset performs one authoritative replacement rather than field repair.
- Verify UI and visual reset behavior comes from normal projection and render flow.
- Verify repeated resets are deterministic.
- Verify no stale reset helpers remain in models or UI unless explicitly temporary.

## Completion Gate

Section 7 is complete only when reset is a deterministic authoritative replacement, projected UI and visual state refresh correctly from defaults, stale piecemeal reset paths have been removed or isolated, and the relevant test suite is green.