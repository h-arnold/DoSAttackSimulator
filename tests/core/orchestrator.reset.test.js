import { describe, it, expect } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';

describe('Orchestrator reset semantics (Section 7)', () => {
  it('replaces state with fresh defaults and does not retain stale nested references', () => {
    const orchestrator = new Orchestrator();
    const staleRateLimitRef = orchestrator.store.state.config.defense.firewall.rateLimit;

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
      payload: { threshold: 33 }
    });

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });

    const defaults = defaultSimulationState();
    expect(orchestrator.store.getState()).toEqual(defaults);
    expect(orchestrator.store.state.config.defense.firewall.rateLimit).not.toBe(staleRateLimitRef);
  });

  it('is deterministic across repeated reset commands', () => {
    const orchestrator = new Orchestrator();

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });
    const first = structuredClone(orchestrator.store.getState());

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });
    const second = structuredClone(orchestrator.store.getState());

    expect(second).toEqual(first);
  });
});
