import { describe, it, expect } from 'vitest';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';
import ViewModelProjector from '../../js/core/ViewModelProjector.js';

describe('ViewModelProjector', () => {
  it('projects expected view-model shape from authoritative state', () => {
    const projector = new ViewModelProjector();
    const state = defaultSimulationState();

    const viewModel = projector.project(state, {
      aggregates: {
        activeWeighted: 42,
        activeLegitWeighted: 12,
        activeMaliciousWeighted: 30,
        activeByType: { UDP: 30, HTTP_GET: 12 },
        halfOpenWeighted: 3
      }
    });

    expect(viewModel).toEqual(expect.objectContaining({
      server: expect.objectContaining({
        publicIP: state.config.defense.topology.publicIP,
        originIP: state.config.defense.topology.originIP,
        reverseProxyEnabled: state.config.defense.topology.reverseProxyEnabled
      }),
      firewall: expect.objectContaining({
        blockedProtocols: state.config.defense.firewall.blockedProtocols,
        blockedIPs: state.config.defense.firewall.blockedSubnets,
        rateLimitEnabled: state.config.defense.firewall.rateLimit.enabled,
        rateLimitThreshold: state.config.defense.firewall.rateLimit.threshold
      }),
      networkNodes: expect.objectContaining({
        attackerCount: state.config.attack.deviceCount,
        legitUserCount: state.config.legitimateTraffic.userCount,
        proxy: expect.objectContaining({
          enabled: state.config.defense.topology.reverseProxyEnabled,
          publicIP: state.config.defense.topology.publicIP
        })
      })
    }));
  });

  it('keeps duplicated IP labels synchronized and returns detached arrays', () => {
    const projector = new ViewModelProjector();
    const state = defaultSimulationState();
    state.config.defense.topology.reverseProxyEnabled = true;
    state.config.defense.topology.publicIP = '203.0.113.20';
    state.config.defense.topology.originIP = '203.0.113.10';
    state.runtime.traffic.particles = [{ id: 'p1' }];

    const viewModel = projector.project(state);

    expect(viewModel.server.publicIP).toBe(viewModel.networkNodes.proxy.publicIP);
    expect(viewModel.server.originIP).toBe(viewModel.networkNodes.origin.ip);

    viewModel.particles.push({ id: 'mutated' });
    expect(state.runtime.traffic.particles).toHaveLength(1);
  });
});
