# Section 2 Implementation Plan: Command-Driven Orchestrator Boundary

## Scope

This plan covers section 2 of the architecture proposal: replacing direct UI-to-model mutation with one-way command flow through the orchestrator.

The goal of this slice is to make `Orchestrator.dispatch(...)` the only write entry point for simulation state changes initiated by the UI. This phase should build directly on section 1's store-backed state model and should preserve current observable simulator behavior unless a behavior change is required to remove broken ownership.

Vitest is the appropriate primary test framework for this section because the work is command-centric, state-centric, and fully exercisable in integration tests without browser timing concerns. Playwright should be added only if a user-visible control flow regresses in a way that Vitest cannot cover with confidence.

## Objectives

- Introduce a stable command surface for orchestrator writes.
- Refactor `EventHandlers` to translate DOM input into commands instead of mutating models directly.
- Ensure reset, start, stop, mitigation toggles, and slider changes all flow through one write path.
- Keep `UIManager` read-only with respect to simulation state.
- Preserve compatibility for current renderer and UI consumers while removing direct mutation as the behavioral contract.
- Make command validation explicit enough to prevent invalid state transitions.

## Non-Goals For This Slice

- Do not split firewall, topology, and capacity ownership yet; that belongs to section 3.
- Do not add projection-backed UI rendering yet; that belongs to section 6.
- Do not add new controls or redesign existing controls.
- Do not hand-fix unrelated simulation issues beyond the minimum needed to support command flow.
- Do not add broad Playwright coverage by default; keep browser coverage limited to narrow smoke checks if a user-facing flow changes materially.

## Delivery Strategy

The implementation should move from control-path characterization to command schema, then to reducer logic, then to UI conversion.

### Phase 1. Characterize Existing Control Paths

Purpose: lock down the control semantics that the current app already relies on.

Tasks:

- Review `js/ui/EventHandlers.js` and identify every place that mutates orchestrator, server, firewall, attacker, or UI state directly.
- Map each control to its expected side effect, including start/stop buttons, reset, rate limiting, reverse proxy, load balancing, and capacity changes.
- Add characterization tests for the current end-to-end control outcomes without encoding direct mutation as the desired design.
- Identify hidden coupling such as command effects that currently depend on stale or dead fields.

Exit criteria:

- The current externally visible control behavior is pinned strongly enough to refactor internals safely.
- The set of commands needed for the slice is explicit.

### Phase 2. Specify Command Types And Dispatch Contract

Purpose: define the write boundary before implementation.

Tasks:

- Add failing tests for `orchestrator.dispatch(command)`.
- Define a stable command set for the current UI surface.
- Decide whether commands use `{ type, payload }` or `{ type, ...fields }` and keep that choice consistent.
- Add tests for unknown commands, malformed payloads, and rejected transitions.
- Introduce a small command constants module only if it reduces string drift across handlers and tests.

Exit criteria:

- The dispatch API is explicit and test-defined.
- Command names and payload shape are stable enough for UI and orchestrator refactors.

### Phase 3. Implement Store-Backed Command Handling

Purpose: make orchestrator the only writer to authoritative state.

Tasks:

- Implement `dispatch()` inside `Orchestrator` or via a reducer helper owned by orchestrator.
- Route each supported command into store-backed updates.
- Cover start/stop simulation, start/stop attack, reset, attack configuration, firewall configuration, topology toggles, and capacity changes.
- Ensure `RESET_SIMULATION` is expressed as store replacement, not field-by-field repair.
- Add validation tests for out-of-range values and invalid state transitions.

Exit criteria:

- Orchestrator can apply all supported commands through the store.
- Invalid command paths fail predictably and do not leak partial state.

### Phase 4. Convert EventHandlers To Dispatch

Purpose: remove direct UI-to-model mutation.

Tasks:

- Replace direct field writes in `EventHandlers` with `orchestrator.dispatch(...)` calls.
- Keep event-handler responsibilities limited to DOM extraction, parsing, and command dispatch.
- Update tests to assert command emission and resulting state, not direct mutation of model instances.
- Remove any leftover UI patch calls that were only compensating for direct mutation.

Exit criteria:

- `EventHandlers` no longer performs direct mutation of orchestrator-owned domain state.
- UI command flow is end-to-end testable through dispatch.

### Phase 5. Cleanup And Hardening

Purpose: remove stale write paths and lock in the new boundary.

Tasks:

- Remove compatibility writes that mirror command effects into old mutable fields.
- Add regression tests proving there is no alternate UI write path.
- Search for remaining direct writes in `EventHandlers` and adjacent UI code.
- Confirm reset, start, and mitigation commands remain behaviorally stable.

Exit criteria:

- One write boundary exists for UI-originated changes.
- Tests no longer normalize split ownership.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one command or one control path.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum dispatch or handler change needed to make the test pass.
4. Refactor while keeping the new command contract green.
5. Re-run the same focused test.
6. Once the control path is stable, run broader affected Vitest files.
7. At the end of the slice, run `npm test`.
8. If this slice changes a visible end-to-end control contract beyond current Vitest coverage, run the narrowest relevant Playwright smoke check with `npm run test:visual`.

## Test Suite Plan

### New Test Files

- `tests/core/commands.test.js`
- `tests/integration/ui-commands.test.js`

### Existing Test Files To Review Or Update

- `tests/ui/eventhandlers.test.js`
- `tests/core/orchestrator.test.js`
- `tests/core/orchestrator.state.test.js`
- `tests/integration/mitigation.test.js`

Those existing files currently cover pieces of the same control surface from different angles. Section 2 should align them around dispatch and store-backed state rather than direct mutable object ownership.

## Comprehensive Test Cases

### A. Dispatch Interface Tests

File: `tests/core/commands.test.js`

- `dispatch()` accepts a supported command object.
- Unknown command types are rejected or handled explicitly.
- `SET_ATTACK_CONFIG` updates attack config in the authoritative store.
- `SET_RATE_LIMIT_ENABLED` updates firewall rate-limit config in the authoritative store.
- `SET_RATE_LIMIT_THRESHOLD` updates the threshold in the authoritative store.
- `SET_REVERSE_PROXY_ENABLED` updates topology config in the authoritative store.
- `SET_LOAD_BALANCING_ENABLED` updates capacity config in the authoritative store.
- `SET_SERVER_CAPACITY` updates capacity multiplier in the authoritative store.
- `START_SIMULATION` updates `runtime.control.simulationRunning`.
- `STOP_SIMULATION` updates `runtime.control.simulationRunning`.
- `START_ATTACK` updates `runtime.control.attackRunning`.
- `STOP_ATTACK` updates `runtime.control.attackRunning`.
- `RESET_SIMULATION` replaces store state from defaults.
- Invalid numeric payloads are rejected without leaking partial state.
- Invalid transition commands fail cleanly.

### B. Event Handler Command Translation Tests

File: `tests/ui/eventhandlers.test.js`

- Clicking the rate-limit control dispatches the correct enable or disable command.
- Adjusting the rate-limit slider dispatches the correct threshold command.
- Changing attack device count dispatches an attack-config command with parsed numeric data.
- Changing attack type dispatches the correct attack-config command.
- Toggling reverse proxy dispatches the correct topology command.
- Toggling load balancing dispatches the correct capacity command.
- Changing capacity dispatches the correct multiplier command.
- Clicking start and stop buttons dispatches the correct control commands.
- Clicking reset dispatches `RESET_SIMULATION`.
- No event-handler test needs to assert direct field mutation on orchestrator-owned models.

### C. UI Command Integration Tests

File: `tests/integration/ui-commands.test.js`

- A UI action dispatches a command and the resulting store-backed state changes as expected.
- Starting the simulation via commands preserves current genuine traffic behavior.
- Starting the attack via commands preserves current attack traffic behavior.
- Reset via commands clears runtime traffic and analyzer state.
- Reset via commands restores mitigation settings to defaults.
- Multiple commands applied in sequence produce deterministic state snapshots.

### D. Cleanup Regression Tests

- `EventHandlers` no longer writes to `this.orchestrator.firewall`, `this.orchestrator.server`, or `this.orchestrator.attacker` directly.
- Compatibility fields, if temporarily retained, mirror store-backed state rather than act as separate sources of truth.
- Reset behavior does not depend on direct UI patching as a write mechanism.
- No test needs to set hidden domain fields just to simulate a real control path.

## Suggested Implementation Order

1. Add `tests/core/commands.test.js`.
2. Implement the minimal `dispatch()` surface in `js/core/Orchestrator.js`.
3. Add core command handlers for reset and control flags.
4. Add command handlers for attack, firewall, topology, and capacity updates.
5. Add `tests/integration/ui-commands.test.js`.
6. Refactor `js/ui/EventHandlers.js` to dispatch instead of mutate.
7. Update `tests/ui/eventhandlers.test.js` to assert commands and resulting state.
8. Remove stale direct-write paths.
9. Run focused Vitest targets.
10. Run `npm test`.
11. If a visible command journey changes in a way Vitest does not cover well, run the narrowest related Playwright smoke spec.

## Acceptance Criteria

- `Orchestrator.dispatch(...)` exists and is the only intended write entry point for UI-originated state changes.
- `EventHandlers` dispatches commands instead of mutating domain state directly.
- Reset, start, stop, and mitigation controls all flow through dispatch.
- Store-backed state updates are visible through the orchestrator compatibility surface.
- Invalid commands or payloads fail without corrupting authoritative state.
- Tests no longer normalize direct mutation as the intended control path.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.
- If a user-visible control journey changes materially and is not already covered, a narrow Playwright smoke test is added or updated.

## Risks And Review Checks

- Risk: dispatch becomes a thin wrapper while direct mutation still survives elsewhere.
- Risk: validation rules reject legitimate control inputs.
- Risk: reset still performs hidden piecemeal repair behind the new command surface.

Review checks:

- Verify no direct UI-to-model mutation remains in `EventHandlers`.
- Verify command handlers write to store-backed state only.
- Verify reset remains atomic and store-driven.
- Verify integration tests cover at least one full UI -> dispatch -> state path per major control family.

## Completion Gate

Section 2 is complete only when UI-originated state changes flow through commands, direct mutation paths are removed or quarantined behind temporary compatibility layers, the new tests specify the command boundary clearly, and the full relevant test suite is green.