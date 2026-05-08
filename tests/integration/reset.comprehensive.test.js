import { describe, it, expect } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import Packet from '../../js/models/Packet.js';

describe('Comprehensive reset integration (Section 7)', () => {
  it('clears runtime branches and restores mitigation/topology defaults after active use', () => {
    const orchestrator = new Orchestrator();

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });

    const destinationIP = orchestrator.store.getState().config.defense.topology.publicIP;
    const packet = new Packet('172.16.0.4', destinationIP, 'HTTP_GET', false);
    packet.trafficWeight = 3;
    orchestrator.processArrival(packet);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });

    const state = orchestrator.store.getState();
    expect(state.runtime.control.simulationRunning).toBe(false);
    expect(state.runtime.control.attackRunning).toBe(false);
    expect(state.runtime.traffic.particles).toEqual([]);
    expect(state.runtime.metrics.totals.allowed.weighted).toBe(0);
    expect(state.config.defense.capacity.loadBalancingEnabled).toBe(false);
    expect(state.config.defense.topology.reverseProxyEnabled).toBe(false);
  });
});
