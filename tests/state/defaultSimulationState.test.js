import { describe, it, expect } from 'vitest';
import { ATTACK_TYPES, CONSTANTS, SERVER_STATUS } from '../../js/constants.js';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';

function expectPlainData(value) {
  if (Array.isArray(value)) {
    value.forEach(expectPlainData);
    return;
  }

  if (value === null) {
    return;
  }

  const valueType = typeof value;
  if (valueType !== 'object') {
    expect(['string', 'number', 'boolean']).toContain(valueType);
    return;
  }

  expect(value instanceof Set).toBe(false);
  expect(value instanceof Map).toBe(false);
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);

  Object.values(value).forEach(expectPlainData);
}

describe('defaultSimulationState', () => {
  it('creates the authoritative section 1 state shape with current defaults', () => {
    expect(defaultSimulationState()).toEqual({
      config: {
        attack: {
          deviceCount: CONSTANTS.DEVICE_COUNT_MIN,
          attackType: ATTACK_TYPES.UDP,
          bandwidthMultiplier: CONSTANTS.BANDWIDTH_MULTIPLIER_MIN,
          targetIP: CONSTANTS.VICTIM_IP
        },
        legitimateTraffic: {
          userCount: CONSTANTS.GENUINE_USER_COUNT,
          packetsPerUserPerSec: CONSTANTS.GENUINE_PACKETS_PER_USER_PER_SEC
        },
        defense: {
          firewall: {
            blockedProtocols: [],
            blockedSubnets: [],
            rateLimit: {
              enabled: false,
              threshold: CONSTANTS.RATE_LIMIT_DEFAULT,
              scope: 'ALL'
            }
          },
          topology: {
            reverseProxyEnabled: CONSTANTS.REVERSE_PROXY_ENABLED,
            publicIP: CONSTANTS.VICTIM_PUBLIC_IP,
            originIP: CONSTANTS.VICTIM_ORIGIN_IP
          },
          capacity: {
            serverCapacityMultiplier: 1,
            loadBalancingEnabled: false,
            loadBalancingMultiplier: 1
          }
        },
        display: {
          proxyBadgeMode: 'ip'
        }
      },
      runtime: {
        control: {
          simulationRunning: false,
          attackRunning: false
        },
        traffic: {
          particles: [],
          botnetRanges: [],
          detectedSubnets: []
        },
        server: {
          bandwidthUsage: 0,
          cpuLoad: 0,
          status: SERVER_STATUS.ONLINE,
          activeConnections: [],
          droppedPacketEvents: [],
          happinessScore: 100
        },
        metrics: {
          totals: {
            allowed: 0,
            blocked: 0,
            dropped: 0
          },
          rollingWindow: {
            allowed: 0,
            blocked: 0,
            dropped: 0
          },
          analyzerSample: {
            logs: []
          },
          analyzerDroppedCount: 0
        }
      }
    });
  });

  it('returns a fresh plain-data tree on every call', () => {
    const firstState = defaultSimulationState();
    const secondState = defaultSimulationState();

    firstState.config.attack.deviceCount = 999;
    firstState.config.defense.firewall.blockedProtocols.push('UDP');
    firstState.runtime.traffic.particles.push({ id: 'particle-1' });
    firstState.runtime.metrics.analyzerSample.logs.push({ action: 'BLOCKED' });

    expect(secondState.config.attack.deviceCount).toBe(CONSTANTS.DEVICE_COUNT_MIN);
    expect(secondState.config.defense.firewall.blockedProtocols).toEqual([]);
    expect(secondState.runtime.traffic.particles).toEqual([]);
    expect(secondState.runtime.metrics.analyzerSample.logs).toEqual([]);

    expect(firstState).not.toBe(secondState);
    expect(firstState.config).not.toBe(secondState.config);
    expect(firstState.runtime).not.toBe(secondState.runtime);
    expect(firstState.config.defense.firewall.blockedProtocols).not.toBe(
      secondState.config.defense.firewall.blockedProtocols
    );
    expect(firstState.runtime.traffic.particles).not.toBe(secondState.runtime.traffic.particles);

    expectPlainData(secondState);
  });

  it('separates defense domains into firewall policy, topology, and capacity branches', () => {
    const defense = defaultSimulationState().config.defense;

    expect(Object.keys(defense.firewall).sort()).toEqual([
      'blockedProtocols',
      'blockedSubnets',
      'rateLimit'
    ]);
    expect(Object.keys(defense.topology).sort()).toEqual([
      'originIP',
      'publicIP',
      'reverseProxyEnabled'
    ]);
    expect(Object.keys(defense.capacity).sort()).toEqual([
      'loadBalancingEnabled',
      'loadBalancingMultiplier',
      'serverCapacityMultiplier'
    ]);
  });

  it('does not leak cross-domain fields into adjacent defense branches', () => {
    const { firewall, topology, capacity } = defaultSimulationState().config.defense;

    expect(firewall).not.toHaveProperty('reverseProxyEnabled');
    expect(firewall).not.toHaveProperty('publicIP');
    expect(firewall).not.toHaveProperty('originIP');
    expect(firewall).not.toHaveProperty('serverCapacityMultiplier');
    expect(firewall).not.toHaveProperty('loadBalancingEnabled');
    expect(firewall).not.toHaveProperty('loadBalancingMultiplier');

    expect(topology).not.toHaveProperty('blockedProtocols');
    expect(topology).not.toHaveProperty('blockedSubnets');
    expect(topology).not.toHaveProperty('rateLimit');
    expect(topology).not.toHaveProperty('serverCapacityMultiplier');
    expect(topology).not.toHaveProperty('loadBalancingEnabled');
    expect(topology).not.toHaveProperty('loadBalancingMultiplier');

    expect(capacity).not.toHaveProperty('blockedProtocols');
    expect(capacity).not.toHaveProperty('blockedSubnets');
    expect(capacity).not.toHaveProperty('rateLimit');
    expect(capacity).not.toHaveProperty('reverseProxyEnabled');
    expect(capacity).not.toHaveProperty('publicIP');
    expect(capacity).not.toHaveProperty('originIP');
  });
});