# Section 3 Implementation Plan: Separate Policy, Topology, And Capacity Ownership

## Scope

This plan covers section 3 of the architecture proposal: splitting mitigation ownership into separate policy, topology, and capacity concerns.

The goal of this slice is to remove cross-domain state and method ownership so that firewall inspection, network topology, and infrastructure capacity are represented independently in both the authoritative state model and the model layer. This phase should build on sections 1 and 2 and should preserve simulator behavior except where current cross-domain ownership is itself the bug.

Vitest is the appropriate primary test framework for this section because the work is dominated by model behavior, state shape, and orchestrator integration. Playwright should be reserved for narrow user-facing topology or capacity regressions that cannot be specified cleanly through model and integration tests.

## Objectives

- Separate firewall policy from topology and capacity configuration.
- Refactor models to accept explicit domain config instead of owning unrelated mutable state.
- Ensure commands from section 2 target the correct state branches.
- Remove stale cross-domain fields such as topology and capacity flags living on firewall objects.
- Make server load effects depend on explicit capacity input.
- Make routing and addressing effects depend on explicit topology input.

## Non-Goals For This Slice

- Do not add metrics ledger behavior yet; that belongs to section 4.
- Do not introduce projection-backed particles or analyzer rendering yet; that belongs to section 5.
- Do not refactor the entire UI render path yet; that belongs to section 6.
- Do not add new controls or visible product features.
- Do not preserve hidden or dead fields just because old tests relied on them.

## Delivery Strategy

The implementation should move from authoritative state shape, to pure domain helpers, to model refactors, to orchestrator integration.

### Phase 1. Finalize Domain State Shape

Purpose: define the authoritative ownership boundary before refactoring models.

Tasks:

- Update the default state and related tests so `config.defense.firewall`, `config.defense.topology`, and `config.defense.capacity` are explicit and complete.
- Specify what belongs in each branch and what must be removed from neighboring branches.
- Review command targets from section 2 and ensure each one maps to the correct domain branch.
- Add failing tests for the new default shape and removed cross-domain fields.

Exit criteria:

- The authoritative state shape clearly separates policy, topology, and capacity.
- There is no ambiguity about where each mitigation setting lives.

### Phase 2. Specify Pure Domain Helpers

Purpose: make the intended behavior testable without mutable model ownership.

Tasks:

- Introduce pure helpers or small stateless modules for firewall policy evaluation, topology routing, and effective capacity calculation.
- Define their inputs and outputs explicitly so they can be tested independently.
- Add failing tests for rate limiting, block rules, route selection, IP projection, and capacity scaling.
- Keep these helpers free of DOM, class-instance coupling, and unrelated runtime ownership.

Exit criteria:

- The core policy, topology, and capacity rules are test-defined independent of the current model classes.
- Domain behavior is understandable without reading UI code.

### Phase 3. Refactor Firewall To Pure Policy Ownership

Purpose: remove non-policy concerns from the firewall model.

Tasks:

- Remove UI-only or cross-domain fields from `js/models/Firewall.js`.
- Refactor firewall behavior to accept explicit policy config and clock input where needed.
- Update tests so they no longer rely on hidden fields such as stale dashboard state.
- Ensure rate limiting and blocking behavior are driven by policy config, not unrelated model properties.

Exit criteria:

- Firewall behavior depends on explicit firewall policy input.
- Hidden non-policy state is no longer required for enforcement.

### Phase 4. Refactor Server And Routing Consumers

Purpose: remove policy ownership from server runtime and route decisions.

Tasks:

- Refactor `js/models/Server.js` so effective capacity comes from explicit capacity input.
- Route packets through explicit topology logic rather than mixed ownership spread across server, firewall, and UI.
- Ensure reverse proxy logic is represented as topology behavior rather than firewall behavior.
- Add tests covering server load under different capacity configurations and packet routing under different topology configurations.

Exit criteria:

- Server runtime owns runtime only.
- Effective capacity and route behavior are explicit function inputs.

### Phase 5. Wire Domain Separation Through Orchestrator

Purpose: make the frame pipeline depend on separated domain inputs.

Tasks:

- Update orchestrator update logic to pass explicit policy, topology, and capacity slices into the appropriate helpers or models.
- Add integration tests proving that commands reach the correct domain behavior through the frame loop.
- Confirm that load balancing changes effective capacity and reverse proxy changes route behavior.
- Confirm that firewall behavior no longer depends on cross-domain flags.

Exit criteria:

- The simulation loop uses separated domain inputs end to end.
- The audit issues tied to cross-domain ownership are specifically covered by tests.

### Phase 6. Cleanup And Removal Of Dead Fields

Purpose: prevent compatibility leftovers from reintroducing split ownership.

Tasks:

- Remove dead fields from models, state defaults, and tests.
- Remove adapter code that only exists to mirror old ownership.
- Replace stale tests that asserted presence of cross-domain fields with tests that assert the separated model.

Exit criteria:

- No stale cross-domain ownership remains in the section 3 surface.
- Tests describe the new separation rather than the old confusion.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test for one domain behavior or one ownership boundary.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum state-shape or model change needed to make that test pass.
4. Refactor while keeping the domain boundary explicit.
5. Re-run the same focused test.
6. Once the behavior is stable, run broader affected model and integration tests.
7. At the end of the slice, run `npm test`.
8. If a visible topology or capacity behavior is intentionally changed for users, run the narrowest related Playwright smoke test.

## Test Suite Plan

### New Test Files

- `tests/models/firewall-policy.test.js`
- `tests/models/topology-config.test.js`
- `tests/models/capacity-config.test.js`

### Existing Test Files To Review Or Update

- `tests/state/defaultSimulationState.test.js`
- `tests/models/firewall.test.js`
- `tests/models/server.test.js`
- `tests/core/commands.test.js`
- `tests/integration/mitigation.test.js`

Those existing files currently mix ownership concerns. Section 3 should replace those assumptions with explicit domain inputs and explicit state branches.

## Comprehensive Test Cases

### A. Authoritative Domain Shape Tests

File: `tests/state/defaultSimulationState.test.js`

- `config.defense.firewall` contains only firewall-policy defaults.
- `config.defense.topology` contains reverse-proxy and addressing defaults.
- `config.defense.capacity` contains capacity and load-balancing defaults.
- Cross-domain fields removed from defaults do not reappear through compatibility literals.

### B. Firewall Policy Tests

File: `tests/models/firewall-policy.test.js`

- A blocked protocol is rejected.
- A blocked subnet is rejected.
- Rate limiting is enforced from policy config.
- Rate limiting resets according to the chosen scope or time window.
- Firewall policy evaluation does not depend on topology or capacity state.

### C. Topology Routing Tests

File: `tests/models/topology-config.test.js`

- Reverse proxy disabled routes directly to the origin path.
- Reverse proxy enabled routes through proxy-visible addressing.
- Public and origin IP labels derive from topology config, not unrelated model fields.
- Topology behavior does not depend on firewall policy or capacity config.

### D. Capacity Computation Tests

File: `tests/models/capacity-config.test.js`

- Effective capacity equals the base multiplier when load balancing is disabled.
- Effective capacity reflects the load-balancing multiplier when enabled.
- Capacity behavior does not depend on firewall or topology config.

### E. Refactored Model Tests

Files: `tests/models/firewall.test.js`, `tests/models/server.test.js`

- Firewall behavior accepts explicit policy config.
- Server behavior accepts explicit capacity input.
- Server runtime updates are independent of policy ownership.
- Reverse proxy behavior is expressed through topology input rather than firewall flags.
- Tests no longer rely on hidden or stale fields to simulate real behavior.

### F. Orchestrator Integration Tests

File: `tests/integration/mitigation.test.js`

- Enabling load balancing changes effective capacity in the simulation path.
- Enabling reverse proxy changes route behavior in the simulation path.
- Enabling rate limiting affects firewall behavior without requiring stale UI-specific flags.
- Commands update the correct state branch and the frame loop consumes that branch correctly.

## Suggested Implementation Order

1. Update default-state tests to pin the three-domain shape.
2. Update `js/state/defaultSimulationState.js` to reflect the separated branches.
3. Add pure domain tests for firewall policy.
4. Add pure domain tests for topology.
5. Add pure domain tests for capacity.
6. Refactor `js/models/Firewall.js` to consume explicit policy input.
7. Refactor `js/models/Server.js` and related routing consumers to consume explicit topology and capacity input.
8. Update orchestrator integration points.
9. Remove dead fields and stale tests.
10. Run focused Vitest targets.
11. Run `npm test`.
12. If a visible routing or addressing contract changed for users, run the narrowest related Playwright smoke spec.

## Acceptance Criteria

- Firewall policy, topology, and capacity are represented as separate authoritative state branches.
- Models no longer own unrelated mitigation state.
- Load balancing affects effective capacity through explicit capacity logic.
- Reverse proxy behavior is expressed through topology logic.
- Firewall behavior does not depend on cross-domain or UI-only state.
- Commands from section 2 target the correct branch and the frame loop consumes that branch.
- Dead cross-domain fields are removed from code and tests.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full suite passes with `npm test` before the change is considered complete.
- If a user-visible topology or addressing contract changes materially, the relevant Playwright smoke coverage is added or updated.

## Risks And Review Checks

- Risk: compatibility shims preserve the old split ownership in practice.
- Risk: model signatures become harder to use if the new inputs are not grouped coherently.
- Risk: partial refactors leave one branch of the simulation still reading stale fields.

Review checks:

- Verify no cross-domain fields remain on firewall or server models.
- Verify orchestrator passes explicit domain inputs into model behavior.
- Verify load balancing and reverse proxy behavior are covered by integration tests that fail if ownership regresses.
- Verify tests no longer need to manipulate stale hidden fields to activate behavior.

## Completion Gate

Section 3 is complete only when policy, topology, and capacity have explicit ownership in state and code, model behavior depends on explicit domain inputs, stale cross-domain fields have been removed or isolated behind temporary compatibility layers, and the relevant test suite is green.