# Architecture Refactor Proposal

Date: 2026-05-07

Related audit: [SIMULATION_PARAMETER_AUDIT_REPORT.md](./SIMULATION_PARAMETER_AUDIT_REPORT.md)

## Purpose

This proposal defines the architectural changes that should happen before localized bug fixes. The goal is to remove the current split ownership of simulation state, make behavior observable without relying on render artifacts, and ensure every UI control flows through one authoritative state model.

The intention is not to replace the whole app architecture with a heavyweight framework. The target should stay small, readable, and compatible with the current folder layout. The main change is to give the simulator a clear state model and a one-way command flow.

## Decision Summary

The first refactor should establish five structural rules:

1. One authoritative simulation state object, owned by the orchestrator layer.
2. One-way command flow from UI into that state.
3. Explicit separation between firewall policy, network topology, and infrastructure capacity.
4. Metrics and traffic accounting independent from visualization particles and analyzer samples.
5. UI rendering and reset behavior driven from projected state, not hand-maintained DOM mutations.

Everything else in the audit should be fixed after those rules exist.

## Traceability Matrix

| Architectural change | Primary outcome | Audit issues addressed |
| --- | --- | --- |
| Introduce authoritative `SimulationState` with `config` and `runtime` sections | Removes split-brain state and gives reset one source of truth | [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui), [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation), [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states), [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead), [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes) |
| Replace direct UI mutation with orchestrator commands | Makes the UI a caller instead of a peer state owner | [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui), [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation), [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states), [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead), [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths), [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes) |
| Split mitigation ownership into `FirewallPolicy`, `TopologyConfig`, and `CapacityConfig` | Prevents one toggle from writing the wrong domain object | [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui), [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation), [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead), [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes) |
| Add a dedicated `MetricsCollector` and outcome ledger | Gives the app real handled/blocked/dropped throughput independent of logs and particles | [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped), [Issue 6](./SIMULATION_PARAMETER_AUDIT_REPORT.md#6-visual-particle-counts-flatten-by-design-once-traffic-exceeds-the-render-caps), [Issue 7](./SIMULATION_PARAMETER_AUDIT_REPORT.md#7-parameter-changes-often-take-several-seconds-to-show-because-enforcement-only-happens-at-arrival-points), [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths) |
| Make particles and analyzer rows derived projections, not behavioral truth | Prevents visual caps from being mistaken for throughput caps | [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped), [Issue 6](./SIMULATION_PARAMETER_AUDIT_REPORT.md#6-visual-particle-counts-flatten-by-design-once-traffic-exceeds-the-render-caps), [Issue 7](./SIMULATION_PARAMETER_AUDIT_REPORT.md#7-parameter-changes-often-take-several-seconds-to-show-because-enforcement-only-happens-at-arrival-points) |
| Add a `ViewModelProjector` for UI and renderer consumption | Ensures every panel and label is generated from the same state snapshot | [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states), [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead), [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped), [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes) |
| Rebuild tests around commands, state snapshots, and projected view models | Makes the real app flow testable instead of bypassed | [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths) and protects against regressions in [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui), [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation), [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states), [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead), and [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped) |

## Proposed Target Architecture

### 1. Authoritative State Model

Add a single authoritative state object owned by the orchestrator layer.

Suggested file additions:

- `js/state/defaultSimulationState.js`
- `js/state/SimulationStore.js`
- `js/core/ViewModelProjector.js`

Suggested shape:

```js
{
  config: {
    attack: {
      deviceCount,
      attackType,
      bandwidthMultiplier,
      targetIP
    },
    legitimateTraffic: {
      userCount,
      packetsPerUserPerSec
    },
    defense: {
      firewall: {
        blockedProtocols,
        blockedSubnets,
        rateLimit: {
          enabled,
          threshold,
          scope
        }
      },
      topology: {
        reverseProxyEnabled,
        publicIP,
        originIP
      },
      capacity: {
        serverCapacityMultiplier,
        loadBalancingEnabled,
        loadBalancingMultiplier
      }
    },
    display: {
      proxyBadgeMode
    }
  },
  runtime: {
    control: {
      simulationRunning,
      attackRunning
    },
    traffic: {
      particles,
      botnetRanges,
      detectedSubnets
    },
    server: {
      bandwidthUsage,
      cpuLoad,
      status,
      activeConnections,
      droppedPacketEvents,
      happinessScore
    },
    metrics: {
      totals,
      rollingWindow,
      analyzerSample,
      analyzerDroppedCount
    }
  }
}
```

Why this comes first:

- The current app has state spread across `Attacker`, `Firewall`, `Server`, DOM controls, and renderer-facing state.
- That distribution is the common root of the rate-limit bug, the load-balancing bug, the reset drift, and the partial reverse-proxy update.

What changes in practice:

- `Attacker`, `Firewall`, and `Server` stop being mutable UI-owned state containers.
- They become domain services or state transition helpers that operate on explicit config/runtime input.
- Reset becomes a store replacement using `defaultSimulationState`, not a long list of manual field repairs.

Audit issues addressed:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### 2. Command-Driven Orchestrator Boundary

Keep `Orchestrator` as the main coordinator, but change its role.

Instead of this pattern:

- UI directly mutates `orchestrator.firewall.rateLimitEnabled`
- UI directly mutates `orchestrator.firewall.loadBalancingEnabled`
- UI directly mutates `orchestrator.server.bandwidthCapacityMultiplier`

Use this pattern:

- UI dispatches commands into orchestrator.
- Orchestrator validates and applies commands to the store.
- Simulation update reads the store.
- UI and renderer only render projected state.

Suggested command surface:

```js
orchestrator.dispatch({ type: 'SET_ATTACK_CONFIG', patch: { deviceCount: 100 } })
orchestrator.dispatch({ type: 'SET_RATE_LIMIT_ENABLED', enabled: true })
orchestrator.dispatch({ type: 'SET_RATE_LIMIT_THRESHOLD', threshold: 10 })
orchestrator.dispatch({ type: 'SET_LOAD_BALANCING_ENABLED', enabled: true })
orchestrator.dispatch({ type: 'SET_REVERSE_PROXY_ENABLED', enabled: true })
orchestrator.dispatch({ type: 'SET_SERVER_CAPACITY', multiplier: 2 })
orchestrator.dispatch({ type: 'RESET_SIMULATION' })
orchestrator.dispatch({ type: 'START_SIMULATION' })
orchestrator.dispatch({ type: 'START_ATTACK' })
```

Why this comes before local fixes:

- The current direct-write model is why one UI control updates a renderer flag, another updates a server field, and a third requires a hidden property that the UI never sets.
- As long as UI code writes directly into multiple mutable objects, individual bug fixes will keep reintroducing ownership mistakes.

Suggested implementation shape:

- Keep `EventHandlers` only as DOM adapters.
- Move all control semantics into `Orchestrator.dispatch()` handlers or a small `CommandReducer` helper.
- Keep `UIManager` read-only with respect to simulation state.

Audit issues addressed:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### 3. Separate Policy, Topology, And Capacity Ownership

The simulator currently mixes three different defense concerns:

- Inspection policy: protocol blocking, subnet blocking, rate limiting.
- Network topology: reverse proxy and public versus origin addressing.
- Infrastructure capacity: server capacity and load-balancing effect.

These should be separate subdomains.

Suggested responsibilities:

- `FirewallPolicy`
  - Owns blocked protocols, blocked subnets, and rate-limit configuration.
  - Inspects packets using explicit config and clock input.
  - Does not own UI visibility state.
  - Does not own reverse-proxy topology.
  - Does not own load-balancing capacity.

- `TopologyConfig` or `NetworkTopology`
  - Owns `reverseProxyEnabled`, `publicIP`, `originIP`, and routing rules.
  - Decides which checkpoint performs inspection and how source or client IPs are rewritten.

- `CapacityConfig`
  - Owns `serverCapacityMultiplier`, `loadBalancingEnabled`, and any derived effective capacity.
  - Feeds server load calculations.

- `ServerRuntime`
  - Owns actual runtime load, connection state, dropped-packet state, and status.
  - Does not own UI control state.

Why this comes first:

- The load-balancing bug exists because `loadBalancingEnabled` lives in the firewall while capacity lives in the server.
- The reverse-proxy partial update exists because topology is partly owned by the server, partly written into the firewall, and partly re-derived in the UI.

Practical consequence:

- `dashboardOpen` disappears from the domain layer unless the product explicitly restores a collapsible firewall concept.
- `reverseProxyEnabled` disappears from `Firewall`.
- `loadBalancingEnabled` disappears from `Firewall`.
- `Server.receive()` receives capacity data, not UI-mutated flags.

Audit issues addressed:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### 4. Add A Dedicated Metrics And Outcome Ledger

Introduce a metrics subsystem that records authoritative outcomes independent of particles and analyzer rows.

Suggested file addition:

- `js/core/MetricsCollector.js`

Suggested responsibilities:

- Record allowed, blocked, dropped, and missed outcomes.
- Record both raw event counts and weighted totals.
- Maintain rolling one-second and five-second windows for UI display.
- Maintain analyzer sampling counters so the UI can disclose when rows are sampled.

Suggested data shape:

```js
metrics: {
  totals: {
    allowedWeighted,
    blockedWeighted,
    droppedWeighted,
    missedWeighted
  },
  rollingWindow: {
    allowedPerSecond,
    blockedPerSecond,
    droppedPerSecond,
    missedPerSecond
  },
  analyzerSample: {
    visible,
    droppedByBudget
  }
}
```

Why this is architectural, not just UI polish:

- Right now the app relies on active particles, bandwidth percentage, and sampled analyzer rows as proxy signals for real throughput.
- That means render caps and log budgets distort user understanding of whether parameters work.

Practical consequence:

- The UI can show true handled or blocked request rates.
- The renderer can keep using particle caps without becoming the authoritative traffic counter.
- Tests can assert behavioral outcomes without depending on canvas density.

Audit issues addressed:

- [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped)
- [Issue 6](./SIMULATION_PARAMETER_AUDIT_REPORT.md#6-visual-particle-counts-flatten-by-design-once-traffic-exceeds-the-render-caps)
- [Issue 7](./SIMULATION_PARAMETER_AUDIT_REPORT.md#7-parameter-changes-often-take-several-seconds-to-show-because-enforcement-only-happens-at-arrival-points)
- [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths)

### 5. Make Visualization A Projection Of Simulation Outcomes

Retain the current particle-based canvas, but stop treating particles as the nearest thing to truth.

Recommended model:

- Simulation produces authoritative outcomes and runtime counters.
- A projection layer decides how many particles to render for the current frame.
- Particle caps remain a performance optimization only.

Suggested responsibilities:

- `TrafficSpawnProjection`
  - Converts weighted traffic into visual particle batches.
  - Applies caps such as `VISUAL_SPAWN_CAP_PER_SECOND` and `MAX_ACTIVE_PARTICLES`.
  - Never changes the authoritative metrics ledger.

- `AnalyzerProjection`
  - Produces the visible analyzer rows from the authoritative event stream and sampling budget.
  - Exposes sample loss counts.

Why this matters early:

- Without this boundary, every investigation is filtered through a render optimization.
- That makes local behavior tuning harder and tests weaker.

Audit issues addressed:

- [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped)
- [Issue 6](./SIMULATION_PARAMETER_AUDIT_REPORT.md#6-visual-particle-counts-flatten-by-design-once-traffic-exceeds-the-render-caps)
- [Issue 7](./SIMULATION_PARAMETER_AUDIT_REPORT.md#7-parameter-changes-often-take-several-seconds-to-show-because-enforcement-only-happens-at-arrival-points)

### 6. Introduce A View Model Projector

Add a single projection step from authoritative state into UI-friendly snapshots.

Suggested file addition:

- `js/core/ViewModelProjector.js`

Responsibilities:

- Generate all server panel values.
- Generate all addressing labels.
- Generate network stats.
- Generate firewall panel display state.
- Generate renderer-facing node state and traffic labels.

This replaces the current pattern where:

- some UI elements are updated directly by handlers,
- some values are updated per frame,
- some addressing fields are updated while other duplicates are not.

Why this comes before bug-by-bug UI fixes:

- The reverse-proxy UI bug and reset drift are symptoms of partial imperative updates.
- As long as the UI is patched piecemeal, new inconsistencies are likely.

Practical consequence:

- `UIManager.update(state)` becomes `UIManager.render(viewModel)`.
- `EventHandlers` no longer call UI patch methods like `updateServerIPs()` as part of control logic.
- All duplicated labels get the same source data by construction.

Audit issues addressed:

- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### 7. Rebuild Reset As Default-State Rehydration

After the store exists, reset should do exactly one thing: replace the current store with a deep clone of default state, then re-project the UI and renderer from that state.

Reset should not:

- manually clear individual checkboxes,
- manually hide or show specific sub-panels,
- manually patch a subset of labels,
- manually reconstruct a mix of runtime objects and DOM state.

Why this is architectural:

- The reset bug is not just one missing checkbox assignment.
- It exists because reset is currently a hybrid of domain reset and DOM patchwork.

Audit issues addressed:

- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

## Suggested File-Level Refactor Plan

This is the smallest structural change that still fixes the ownership problems.

### New Files

- `js/state/defaultSimulationState.js`
- `js/state/SimulationStore.js`
- `js/core/MetricsCollector.js`
- `js/core/ViewModelProjector.js`

### Existing Files To Evolve

- `js/core/Orchestrator.js`
  - Become command-driven coordinator over `SimulationStore`.
  - Own the update pipeline and state projection.

- `js/models/Attacker.js`
  - Stop owning mutable UI control state directly.
  - Prefer pure generation from `state.config.attack` and `state.runtime`.

- `js/models/GenuineTraffic.js`
  - Generate traffic from `state.config.legitimateTraffic`.

- `js/models/Firewall.js`
  - Become pure inspection policy logic.
  - Remove layout-related and non-policy state.

- `js/models/Server.js`
  - Operate on explicit runtime plus capacity input.
  - Stop serving as a mixed runtime and mitigation-config object.

- `js/ui/EventHandlers.js`
  - Only translate DOM events into commands.
  - Stop mutating `server`, `firewall`, and `attacker` fields directly.

- `js/ui/UIManager.js`
  - Render a full projected view model.
  - Stop participating in control semantics.

## Proposed Frame Pipeline

Each frame should follow the same sequence:

1. Read current config and runtime from `SimulationStore`.
2. Spawn legitimate and malicious traffic from config plus control state.
3. Route packets through topology rules.
4. Inspect packets through firewall policy.
5. Apply server capacity and runtime transitions.
6. Record authoritative outcomes in `MetricsCollector`.
7. Produce view model and render projections.

That ordering gives one place to answer every question:

- Was the packet generated?
- Where was it routed?
- Was it blocked or allowed?
- Did it affect load?
- Was the effect visible or sampled?

## Migration Sequence

### Phase 1. Introduce `SimulationStore` And Default State

Deliverables:

- Add `defaultSimulationState.js`.
- Add `SimulationStore.js`.
- Update `Orchestrator` to read and expose store-backed state.

Do not fix local bugs yet except what is necessary to keep the app running.

Addresses:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### Phase 2. Convert UI To Commands

Deliverables:

- Replace direct field mutation in `EventHandlers` with `orchestrator.dispatch(...)`.
- Add reducer-style command handlers.
- Make reset command store-driven.

Addresses:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 3](./SIMULATION_PARAMETER_AUDIT_REPORT.md#3-reset-recreates-model-state-but-leaves-the-ui-in-old-mitigation-states)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### Phase 3. Split Domain Ownership

Deliverables:

- Move rate-limit and block rules into firewall policy config.
- Move reverse-proxy state into topology config.
- Move load-balancing and capacity state into capacity config.
- Remove dead cross-domain fields.

Addresses:

- [Issue 1](./SIMULATION_PARAMETER_AUDIT_REPORT.md#1-rate-limiting-is-effectively-disabled-from-the-production-ui)
- [Issue 2](./SIMULATION_PARAMETER_AUDIT_REPORT.md#2-load-balancing-only-changes-the-renderer-not-the-simulation)
- [Issue 4](./SIMULATION_PARAMETER_AUDIT_REPORT.md#4-reverse-proxy-state-only-partially-propagates-through-the-ui-and-one-of-the-writes-is-dead)
- [Issue 9](./SIMULATION_PARAMETER_AUDIT_REPORT.md#9-there-is-stale-and-dead-plumbing-left-over-from-older-ui-shapes)

### Phase 4. Add Metrics And Projection Layers

Deliverables:

- Add `MetricsCollector`.
- Add `ViewModelProjector`.
- Move analyzer rows and counters onto projected data.
- Keep particles as a render projection.

Addresses:

- [Issue 5](./SIMULATION_PARAMETER_AUDIT_REPORT.md#5-the-ui-does-not-expose-a-reliable-handled-requests-metric-and-the-main-observable-signals-are-capped)
- [Issue 6](./SIMULATION_PARAMETER_AUDIT_REPORT.md#6-visual-particle-counts-flatten-by-design-once-traffic-exceeds-the-render-caps)
- [Issue 7](./SIMULATION_PARAMETER_AUDIT_REPORT.md#7-parameter-changes-often-take-several-seconds-to-show-because-enforcement-only-happens-at-arrival-points)
- [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths)

### Phase 5. Fix Local Behaviors On Top Of The New Architecture

Only after phases 1 through 4 land should the codebase make the local behavioral fixes.

Those local fixes then become straightforward:

- Remove `dashboardOpen` from rate-limit activation unless the product explicitly restores collapsibility.
- Make load balancing contribute to effective capacity.
- Ensure reverse proxy updates every addressing label through projection.
- Ensure reset is a default-state restore.
- Add handled, blocked, dropped, and missed throughput displays.

## What Should Wait Until After The Architecture Lands

These are real problems, but they should not be the first changes:

- Hand-patching more checkbox resets.
- Adding one more assignment to load balancing.
- Removing `dashboardOpen` without first deciding final state ownership.
- Adding extra analyzer rows without adding real metrics.
- Tuning particle caps or packet speeds before metrics are authoritative.

Those changes are likely to be partially rewritten once the store, command flow, and projection layers exist.

## Testing Strategy For The Refactor

The test strategy should change with the architecture.

### New Test Layers

- Store tests
  - default state creation
  - reset behavior
  - command application

- Domain policy tests
  - firewall inspection with explicit policy config
  - topology routing with explicit topology config
  - server load effects with explicit capacity config

- Projection tests
  - view model contains synchronized IP labels
  - metrics windows produce stable handled and blocked counts
  - particle projection is capped without changing metrics

- UI command tests
  - controls dispatch the correct commands
  - no direct domain mutation from handlers

### What Existing Tests Should Change

- Stop manually setting hidden properties like `firewall.dashboardOpen` to simulate real UI behavior.
- Stop treating `loadBalancingEnabled` being true as sufficient evidence that load balancing works.
- Assert store state and projected state after reset, not only particles and logs.

This directly addresses [Issue 8](./SIMULATION_PARAMETER_AUDIT_REPORT.md#8-tests-and-documentation-normalize-or-hide-the-broken-paths).

## Recommendation

Start with Phase 1 and Phase 2 together if possible: introduce the store and move UI writes behind commands in the same slice. That creates the narrowest stable boundary for the rest of the refactor.

Once that boundary exists, Phase 3 and Phase 4 can be implemented incrementally without reopening the same ownership mistakes.

If the team wants the smallest possible first implementation slice, use this exact sequence:

1. Add `defaultSimulationState.js` and `SimulationStore.js`.
2. Change `Orchestrator` to own the store.
3. Convert one end-to-end control path, preferably rate limiting, from direct mutation to commands plus store-backed state.
4. Add a minimal metrics ledger for allowed and blocked traffic.
5. Add projection-backed rendering for the server and firewall panels.

That slice addresses the most consequential architectural risk with the least churn.
