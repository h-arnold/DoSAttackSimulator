# Changelog

All notable changes to the specification are documented in this file.

## [1.5.6] - 2026-05-07
- Implement section-4 phase-4 integration by wiring `MetricsCollector` into orchestrator outcome decision points (allowed/blocked/dropped/missed), projecting plain-data snapshots into `runtime.metrics`, and enforcing deterministic metric reset through the authoritative `RESET_SIMULATION` flow with integration coverage for each outcome and reset.

## [1.5.5] - 2026-05-07
- Implement section-4 phase-3 `MetricsCollector` as a deterministic authoritative ledger utility (allowed/blocked/dropped/missed outcome recording, lifetime count+weighted accumulation, rolling-window bucket aging, safe snapshot cloning, and reset behavior) with focused Vitest unit coverage while keeping it decoupled from orchestrator/UI integration.

## [1.5.4] - 2026-05-07
- Define section-4 phase-2 authoritative metrics ledger placeholder shape in defaults and tests: outcome totals (allowed/blocked/dropped/missed with count+weighted fields), rolling-window scaffold (`windowMs`, `totals`, `buckets`), and analyzer sample counters (`visibleCount`, `droppedByBudgetCount`) while keeping state plain-data serializable for store cloning/reset.

## [1.5.3] - 2026-05-07
- Complete section-3 phase-6 cleanup: remove stale cross-domain adapters (server-owned reverse-proxy fields/mutators and firewall-mirrored load-balancing flag), and update renderer/orchestrator/tests to assert explicit firewall, topology, and capacity branch ownership without changing simulation behavior.

## [1.5.2] - 2026-05-07
- Refactor section-3 phase-4 ownership boundaries: server load now consumes explicit capacity input (via effective-capacity helper), and packet routing/addressing consumers now use explicit topology helper inputs for reverse-proxy and direct-path decisions while preserving classroom behavior.

## [1.5.1] - 2026-05-07
- Refine firewall ownership in `SPEC.md` so rate limiting is enforced from explicit firewall policy inputs (`enabled`, `threshold`, `scope`, `windowSeconds`) and explicit clock input, removing the stale dashboard-open activation dependency while preserving protocol/subnet blocking semantics.

## [1.5.0] - 2026-01-08
- **Network Visualization Improvements:**
  - Implement trajectory-based particle spawning: particles now spawn from cluster areas (attacker top, legit bottom) with deterministic positions and velocity vectors
  - Compute velocity as `normalize(destination - spawnPosition) * speed` for accurate paths from source to destination
  - Add cluster rendering: nodes with `deviceCount > 1` display up to 8 semi-transparent dots around the badge (capped at 8 visual, numeric badge shows actual count)
  - Particle spawn positions scatter within cluster radius (15px) for multi-device visualization
  - Add debug overlay test hooks: `window.__SIM_TEST_HOOKS__.debugOverlay` shows velocity vectors (yellow) and spawn points (green)
  - Preserve existing `trafficWeight` and visual scaling math
- **Testing:**
  - Add Playwright visual regression tests for packet trajectory, cluster rendering, and canvas layout
  - Implement MCP server integration for visual diff comparison with fallback to local snapshots
  - Add unit tests for trajectory computation and spawn position distribution
  - Add GitHub Actions workflow for CI visual testing
  - Document test setup and MCP configuration in `tests/README.md`

## [1.4.0] - 2026-01-08
- Implement packet visual scaling defaults (×100) across malicious and genuine traffic, align happiness/drop accounting to weighted aggregates, and add a proxy badge IP/count toggle with analyzer log scale suffixes to keep badges, logs, and metrics consistent.

## [1.3.0] - 2026-01-08
- Clarify that the attacker device-count slider describes a strict 1-1000 range so the UI guidance now matches the control limits documented elsewhere in `SPEC.md` and `constants.js`.
- Split the UDP/ICMP legend into separate colour callouts, ensuring ICMP flood packets are always described as orange squares per the v1.3 visual alignment notes.

## [1.2.0] - 2026-01-08
- Add **Reverse Proxy / DDoS Protection** mitigation to `SPEC.md`: models Public IP (proxy) vs Origin IP, origin shielding, and proxy egress addressing.
- Add visualization and canvas behaviour for the proxy node (proxy checkpoint at `proxyX`) and cyan-coloured forwarded packets to distinguish proxy→origin traffic.
- Define packet metadata additions (`destinationIP`, optional `clientIP`) and constants (`VICTIM_PUBLIC_IP`, `PROXY_PUBLIC_IP`, `PROXY_EGRESS_IP_PREFIX`, `REVERSE_PROXY_ENABLED`).
- Clarify Firewall behaviour when proxy is enabled (use `clientIP` for rate-limiting/blacklisting where available) and that blocked packets are dropped at the edge.
- Update UI requirements to display Origin IP always and display Public IP when reverse proxy is enabled.

## [1.1.0] - 2026-01-08
- Clarify that `Happiness` now recalculates in real-time and will recover as dropped legitimate packets decrease (e.g., after attack mitigation), unless genuine users remain blocked by firewall rules.
- Add top-of-file metadata header in `SPEC.md` and reference to this changelog.

## [1.0.0] - initial
- Initial specification (v1.0.0) describing UI layout, simulation logic, and core mechanics for the DoS/DDoS Attack Simulator.
