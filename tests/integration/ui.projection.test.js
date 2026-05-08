import { describe, it, expect } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';

describe('UI projection integration (Section 6)', () => {
  it('projects topology and capacity updates through getState view model', () => {
    const orchestrator = new Orchestrator();

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 1.7 }
    });

    const projected = orchestrator.getState();

    expect(projected.server.reverseProxyEnabled).toBe(true);
    expect(projected.server.publicIP).toBe(projected.networkNodes.proxy.publicIP);
    expect(projected.capacity.serverCapacityMultiplier).toBe(1.7);
  });

  it('projects reset defaults consistently after command mutations', () => {
    const orchestrator = new Orchestrator();

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'count' }
    });
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });

    const projected = orchestrator.getState();

    expect(projected.isSimulationRunning).toBe(false);
    expect(projected.networkNodes.proxy.badgeMode).toBe('ip');
    expect(projected.server.reverseProxyEnabled).toBe(false);
  });
});
