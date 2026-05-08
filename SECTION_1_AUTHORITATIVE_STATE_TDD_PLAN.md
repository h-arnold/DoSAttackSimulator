# Section 1 Implementation Plan: Authoritative State Model

## Scope

This plan covers section 1 of the architecture proposal: introducing a single authoritative simulation state object owned by the orchestrator layer.

The goal of this slice is to establish a store-backed state model without broadening scope into later architectural phases. This phase should replace split ownership of defaults and runtime state, while preserving current observable simulator behaviour unless a behavior change is explicitly required to keep the application running.

Vitest is the appropriate primary test framework for this section because the work is state-centric, orchestration-centric, and does not require browser-level interaction to specify the desired behavior.

## Objectives

- Introduce a serializable default simulation state factory in `js/state/defaultSimulationState.js`.
- Introduce a store abstraction in `js/state/SimulationStore.js`.
- Refactor `Orchestrator` to own and read authoritative state from the store.
- Eliminate duplicated default and reset state ownership where section 1 makes that possible.
- Preserve existing behavior needed by current renderer and UI consumers until later phases replace those integration points.
- Drive all implementation through failing tests first.

## Non-Goals For This Slice

- Do not fully convert the UI to command dispatch yet.
- Do not fully introduce projection-backed UI rendering yet.
- Do not fully split firewall policy, topology, and capacity ownership yet.
- Do not add browser-level Playwright coverage for this slice unless a narrow smoke check becomes necessary.
- Do not use this phase to hand-fix unrelated bugs outside the minimum needed to keep the simulator running.

## Delivery Strategy

The implementation should follow strict red-green-refactor loops, starting from the narrowest new abstraction and moving outward.

### Phase 1. Characterize The Current Contract

Purpose: lock down the current orchestrator surface that downstream code already depends on.

Tasks:

- Review the current orchestrator state shape and identify which fields are consumed by renderer, UI, and tests.
- Keep or add characterization tests for current externally visible behavior that must remain stable during the refactor.
- Avoid adding new tests that reinforce direct mutation as the desired long-term architecture.

Exit criteria:

- The current observable orchestrator behavior is pinned by tests strongly enough to refactor internals safely.

### Phase 2. Specify Default Authoritative State

Purpose: define the authoritative state shape before implementing the store.

Tasks:

- Add failing tests for `defaultSimulationState.js`.
- Define a single default state factory that returns a fresh deep clone on every call.
- Ensure the default state is plain data only: objects, arrays, strings, numbers, booleans, and null as needed.
- Do not embed class instances, DOM references, `Set`, or mutable model objects in authoritative state.

Exit criteria:

- The full section 1 state shape exists in one default factory and can be instantiated repeatedly without shared references.

### Phase 3. Specify And Implement The Store

Purpose: create a minimal state container that the orchestrator can own.

Tasks:

- Add failing tests for `SimulationStore.js`.
- Implement a minimal API for initialization, state reads, full replacement, and targeted updates.
- Include cloning or immutability safeguards sufficient to prevent accidental reference leakage.
- Add subscribe and unsubscribe behavior only if the orchestrator or tests need it immediately.

Exit criteria:

- The store becomes the sole owner of the authoritative state object.

### Phase 4. Refactor Orchestrator To Use The Store

Purpose: move the orchestrator from ad hoc mutable state ownership to store-backed ownership.

Tasks:

- Add failing integration tests covering orchestrator construction, reset behavior, and state snapshots.
- Refactor `Orchestrator` to create and own `SimulationStore`.
- Move authoritative defaults for runtime and config out of inline orchestrator fields and into store-backed state.
- Keep only the minimum compatibility surface needed for current consumers, but make those values derive from the store.
- Remove duplicate reset/default logic once store-backed behavior is proven.

Exit criteria:

- `Orchestrator` is the owner of the store, and reset is expressed as store replacement rather than manual field repairs.

### Phase 5. Cleanup And Hardening

Purpose: remove stale code paths created obsolete by section 1.

Tasks:

- Remove duplicated default literals that are now superseded by `defaultSimulationState.js`.
- Remove stale orchestrator reset logic that manually reconstructs state already covered by store replacement.
- Rewrite or remove tests that encode split-brain ownership when those tests are no longer valid.
- Keep compatibility shims only if they are necessary for the current phase, and document them as temporary.

Exit criteria:

- There is one authoritative default state source and one authoritative runtime owner for section 1 concerns.

## TDD Workflow

Each unit of work should follow this sequence:

1. Add or update the narrowest failing test that specifies the next required behavior.
2. Run the smallest relevant Vitest target and confirm the failure is for the expected reason.
3. Implement the minimum code change required to make that test pass.
4. Refactor the implementation while keeping the test green.
5. Re-run the same focused test.
6. Once the slice is stable, run the broader affected Vitest files.
7. At the end of the phase, run the full suite with `npm test`.

## Test Suite Plan

### New Test Files

- `tests/state/defaultSimulationState.test.js`
- `tests/state/simulationStore.test.js`
- `tests/core/orchestrator.state.test.js`

### Existing Test Files To Review Or Update

- `tests/core/orchestrator.test.js`
- `tests/ui/eventhandlers.test.js`
- `tests/integration/mitigation.test.js`
- `tests/models/firewall.test.js`

Those existing files currently encode old ownership assumptions in several places. Section 1 should not preserve those assumptions by default. Where needed, replace tests that directly depend on duplicated mutable state with tests that assert store-backed state or clearly marked temporary compatibility behavior.

## Comprehensive Test Cases

### A. Default State Factory Tests

File: `tests/state/defaultSimulationState.test.js`

- Creates a top-level state object with `config` and `runtime` sections.
- Includes `config.attack.deviceCount` default.
- Includes `config.attack.attackType` default.
- Includes `config.attack.bandwidthMultiplier` default.
- Includes `config.attack.targetIP` default.
- Includes `config.legitimateTraffic.userCount` default.
- Includes `config.legitimateTraffic.packetsPerUserPerSec` default.
- Includes `config.defense.firewall.blockedProtocols` default.
- Includes `config.defense.firewall.blockedSubnets` default.
- Includes `config.defense.firewall.rateLimit.enabled` default.
- Includes `config.defense.firewall.rateLimit.threshold` default.
- Includes `config.defense.firewall.rateLimit.scope` default.
- Includes `config.defense.topology.reverseProxyEnabled` default.
- Includes `config.defense.topology.publicIP` default.
- Includes `config.defense.topology.originIP` default.
- Includes `config.defense.capacity.serverCapacityMultiplier` default.
- Includes `config.defense.capacity.loadBalancingEnabled` default.
- Includes `config.defense.capacity.loadBalancingMultiplier` default.
- Includes `config.display.proxyBadgeMode` default.
- Includes `runtime.control.simulationRunning` default.
- Includes `runtime.control.attackRunning` default.
- Includes `runtime.traffic.particles` default as an empty array.
- Includes `runtime.traffic.botnetRanges` default as an empty array.
- Includes `runtime.traffic.detectedSubnets` default as an empty array.
- Includes `runtime.server.bandwidthUsage` default.
- Includes `runtime.server.cpuLoad` default.
- Includes `runtime.server.status` default.
- Includes `runtime.server.activeConnections` default.
- Includes `runtime.server.droppedPacketEvents` default.
- Includes `runtime.server.happinessScore` default.
- Includes `runtime.metrics.totals` placeholder structure.
- Includes `runtime.metrics.rollingWindow` placeholder structure.
- Includes `runtime.metrics.analyzerSample` placeholder structure.
- Includes `runtime.metrics.analyzerDroppedCount` default.
- Returns a fresh deep-cloned state instance on every invocation.
- Mutating one returned state tree does not affect another returned state tree.
- Does not contain class instances.
- Does not contain DOM elements.
- Does not contain `Set` or `Map` objects.

### B. Simulation Store Tests

File: `tests/state/simulationStore.test.js`

- Initializes using a clone of default simulation state rather than the original object reference.
- Exposes a method to read the current state snapshot.
- Replaces the entire state tree when requested.
- Applies a targeted update without discarding untouched branches.
- Preserves sibling branches during nested updates.
- Restores the exact default shape after a full reset or replacement from defaults.
- Prevents caller mutation from leaking into internal state after `replaceState`.
- Prevents caller mutation from leaking into internal state after a targeted update.
- If subscriptions are implemented, notifies listeners once per committed update.
- If subscriptions are implemented, unsubscribe stops future notifications.
- If invalid updates are possible, rejects or safely ignores unsupported update operations.

### C. Orchestrator Store-Backed State Tests

File: `tests/core/orchestrator.state.test.js`

- Constructor creates and owns a `SimulationStore` instance.
- Constructor state is initialized from `defaultSimulationState()`.
- `reset()` replaces authoritative state from defaults instead of manually rebuilding each field.
- `reset()` clears runtime traffic state including particles.
- `reset()` clears analyzer log state.
- `reset()` clears runtime control flags to defaults.
- `reset()` restores topology state to default values.
- `reset()` restores capacity state to default values.
- `reset()` restores firewall rate-limit state to default values.
- `getState()` returns a snapshot derived from store-backed state.
- Existing renderer-facing snapshot fields remain available if they are still required by current consumers.
- Proxy badge mode is derived from authoritative state rather than separate ad hoc ownership.
- Simulation-running state is derived from authoritative state rather than separate ad hoc ownership.
- Attack-running state is derived from authoritative state rather than separate ad hoc ownership.
- A nested state mutation performed through the store is visible through `getState()`.
- No orchestrator test needs to mutate multiple independent objects to represent one logical state change.

### D. Characterization Tests To Preserve Current Behavior

These may live in the existing orchestrator suite or be moved into the new state-focused suite as appropriate.

- Genuine traffic still spawns when authoritative simulation-running state is true.
- Genuine traffic does not spawn when authoritative simulation-running state is false.
- Attack traffic still spawns when authoritative attack-running state is true.
- Reset still clears active particles.
- Reset still clears analyzer logs.
- Existing snapshot shape still contains enough data for current renderer and UI consumption.
- Existing public behavior stays stable for default proxy badge mode.

### E. Cleanup Regression Tests

These tests are important because section 1 is partially about removing stale ownership.

- Reset no longer depends on duplicated literal defaults spread across orchestrator internals.
- Default state is not redefined separately inside orchestrator constructor fields.
- Mutating a nested branch such as firewall rate-limit config is fully undone by restoring defaults.
- Analyzer logs are not preserved through reset by stale array references.
- Particle arrays are not preserved through reset by stale array references.
- Compatibility fields, if temporarily retained, are proven to mirror authoritative store state rather than act as separate sources of truth.
- Tests that previously depended on `firewall.dashboardOpen` as an activation prerequisite are removed or rewritten if that dependency is no longer part of section 1 ownership.

## Suggested Implementation Order

1. Create `tests/state/defaultSimulationState.test.js`.
2. Implement `js/state/defaultSimulationState.js`.
3. Create `tests/state/simulationStore.test.js`.
4. Implement `js/state/SimulationStore.js`.
5. Create `tests/core/orchestrator.state.test.js`.
6. Refactor `js/core/Orchestrator.js` to own the store and satisfy the new tests.
7. Update existing orchestrator tests to assert store-backed behavior rather than direct field ownership where needed.
8. Remove stale default/reset code made obsolete by the store.
9. Run focused Vitest targets.
10. Run the full suite with `npm test`.

## Acceptance Criteria

- `js/state/defaultSimulationState.js` exists and is the only authoritative source of default simulation state for section 1 concerns.
- `js/state/SimulationStore.js` exists and owns the authoritative state object used by `Orchestrator`.
- `js/core/Orchestrator.js` owns the store and reads authoritative state from it.
- `Orchestrator.reset()` is implemented as a store replacement or default-state rehydration, not a long list of manual field repairs.
- Runtime state covered by section 1 is no longer simultaneously owned by scattered orchestrator fields and model objects where the store now provides the authority.
- Duplicate default literals introduced by historical reset or constructor logic are removed once replaced by the authoritative default state factory.
- Stale section 1 code paths that only exist to preserve old split ownership are removed, unless a temporary compatibility layer is required and explicitly covered by tests.
- Tests that normalize stale ownership, such as directly depending on hidden state couplings, are removed or rewritten to target the new authoritative model.
- The implementation does not add new stale state mirrors or new parallel sources of truth.
- All new Vitest tests for this phase pass.
- All pre-existing tests that remain valid after the refactor pass.
- The full test suite passes with `npm test` before the change is considered complete.
- If section 1 implementation changes documented simulator behavior, `SPEC.md` must be updated with a semver version bump and `CHANGELOG.md` must be updated in the same change.
- If behavior does not change and the work is purely structural, the implementation must explicitly confirm that no spec change was required.

## Risks And Review Checks

- Risk: keeping compatibility fields too long can preserve split ownership in practice.
- Risk: deep cloning strategies may hide mutation bugs if tests do not explicitly check for reference isolation.
- Risk: existing tests may need careful rewriting because some of them currently encode outdated architecture rather than desired behavior.

Review checks:

- Verify one authoritative source exists for defaults.
- Verify one authoritative owner exists for runtime state in scope.
- Verify reset is implemented through replacement, not manual piecemeal repair.
- Verify no new direct UI-to-model mutation paths are introduced while doing section 1.
- Verify the final code is simpler to reason about than the pre-refactor split ownership model.

## Completion Gate

Section 1 is complete only when the store-backed authoritative state exists, stale duplicate state ownership has been cleaned up for this slice, the new tests specify the architecture clearly, and the full test suite is green.