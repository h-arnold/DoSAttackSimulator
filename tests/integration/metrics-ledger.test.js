import { beforeEach, describe, expect, it } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import { PACKET_TYPES } from '../../js/constants.js';

function getTotals(orchestrator) {
  return orchestrator.store.getState().runtime.metrics.totals;
}

describe('Metrics Ledger Integration', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    orchestrator.analyzerLogBudget = 100;
  });

  it('increments allowed metrics for allowed traffic outcomes', () => {
    const destinationIP = orchestrator.store.getState().config.defense.topology.publicIP;

    orchestrator.processArrival({
      type: PACKET_TYPES.UDP,
      sourceIP: '198.51.100.10',
      destinationIP,
      trafficWeight: 25,
      isMalicious: true
    });

    expect(getTotals(orchestrator)).toEqual({
      allowed: { count: 1, weighted: 25 },
      blocked: { count: 0, weighted: 0 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 0, weighted: 0 }
    });
  });

  it('increments blocked metrics for firewall-blocked outcomes', () => {
    const destinationIP = orchestrator.store.getState().config.defense.topology.publicIP;
    orchestrator.firewall.blockedProtocols.add('UDP');

    orchestrator.processArrival({
      type: PACKET_TYPES.UDP,
      sourceIP: '198.51.100.11',
      destinationIP,
      trafficWeight: 40,
      isMalicious: true
    });

    expect(getTotals(orchestrator)).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 1, weighted: 40 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 0, weighted: 0 }
    });
  });

  it('increments dropped metrics when server overload/crash drops traffic', () => {
    const destinationIP = orchestrator.store.getState().config.defense.topology.publicIP;
    orchestrator.server.cpuLoad = 100;
    orchestrator.server.updateStatus();

    orchestrator.processArrival({
      type: PACKET_TYPES.HTTP_GET,
      sourceIP: '172.16.0.7',
      destinationIP,
      trafficWeight: 3,
      isMalicious: false
    });

    expect(getTotals(orchestrator)).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 0, weighted: 0 },
      dropped: { count: 1, weighted: 3 },
      missed: { count: 0, weighted: 0 }
    });
  });

  it('increments missed metrics for wrong-destination traffic', () => {
    orchestrator.processArrival({
      type: PACKET_TYPES.UDP,
      sourceIP: '198.51.100.12',
      destinationIP: '10.10.10.10',
      trafficWeight: 9,
      isMalicious: true
    });

    expect(getTotals(orchestrator)).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 0, weighted: 0 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 1, weighted: 9 }
    });
  });

  it('clears authoritative metrics through RESET_SIMULATION flow', () => {
    const destinationIP = orchestrator.store.getState().config.defense.topology.publicIP;

    orchestrator.processArrival({
      type: PACKET_TYPES.UDP,
      sourceIP: '198.51.100.20',
      destinationIP,
      trafficWeight: 11,
      isMalicious: true
    });

    expect(getTotals(orchestrator).allowed.count).toBe(1);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });

    const metrics = orchestrator.store.getState().runtime.metrics;
    expect(metrics.totals).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 0, weighted: 0 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 0, weighted: 0 }
    });
    expect(metrics.rollingWindow.totals).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 0, weighted: 0 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 0, weighted: 0 }
    });
    expect(metrics.rollingWindow.buckets).toEqual([]);
  });
});
