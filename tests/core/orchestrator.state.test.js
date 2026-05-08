import { describe, it, expect, beforeEach } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import { ATTACK_TYPES, PACKET_TYPES } from '../../js/constants.js';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';
import SimulationStore from '../../js/state/SimulationStore.js';

describe('Orchestrator state contract characterization', () => {
  let orchestrator;
  let defaults;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    defaults = defaultSimulationState();
  });

  it('constructor creates and owns a SimulationStore initialized from defaultSimulationState', () => {
    expect(orchestrator.store).toBeInstanceOf(SimulationStore);

    const state = orchestrator.store.getState();

    expect(state).toEqual(defaults);
    expect(state).not.toBe(defaults);
  });

  it('gates genuine traffic spawning on simulation-running state', () => {
    orchestrator.update(1);
    expect(orchestrator.particles).toHaveLength(0);

    orchestrator.isSimulationRunning = true;
    orchestrator.update(1);

    expect(orchestrator.particles).toHaveLength(50);
    expect(orchestrator.particles.every((packet) => packet.isMalicious === false)).toBe(true);
    expect(orchestrator.particles.every((packet) => packet.type === PACKET_TYPES.HTTP_GET)).toBe(true);
  });

  it('gates malicious traffic spawning on attack-running state independently of simulation-running state', () => {
    orchestrator.attacker.deviceCount = 10;
    orchestrator.attacker.attackType = ATTACK_TYPES.UDP;
    orchestrator.attacker.bandwidthMultiplier = 1;

    orchestrator.update(1);
    expect(orchestrator.particles).toHaveLength(0);

    orchestrator.attacker.isAttacking = true;
    orchestrator.update(1);

    expect(orchestrator.particles).toHaveLength(100);
    expect(orchestrator.particles.every((packet) => packet.isMalicious)).toBe(true);
    expect(orchestrator.particles.every((packet) => packet.type === PACKET_TYPES.UDP)).toBe(true);
  });

  it('reset replaces authoritative state from defaults and clears runtime state', () => {
    orchestrator.isSimulationRunning = true;
    orchestrator.attacker.isAttacking = true;
    orchestrator.analyzerLogBudget = 2;
    orchestrator.setProxyBadgeMode('count');
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.firewall.rateLimitEnabled = true;
    orchestrator.firewall.rateLimitThreshold = 30;
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.store.updateState({
      runtime: {
        traffic: {
          botnetRanges: ['198.51.100.0/24'],
          detectedSubnets: ['203.0.113.0/24']
        }
      }
    });
    orchestrator.logAnalyzerEvent({
      ip: '198.51.100.10',
      type: PACKET_TYPES.UDP,
      action: 'BLOCKED',
      reason: 'TEST'
    });
    orchestrator.update(1);

    expect(orchestrator.particles.length).toBeGreaterThan(0);
    expect(orchestrator.analyzerLogs.length).toBeGreaterThan(0);

    orchestrator.reset();

    expect(orchestrator.particles).toEqual([]);
    expect(orchestrator.analyzerLogs).toEqual([]);
    expect(orchestrator.isSimulationRunning).toBe(defaults.runtime.control.simulationRunning);
    expect(orchestrator.attacker.isAttacking).toBe(false);
    expect(orchestrator.store.getState()).toEqual(defaults);
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe(defaults.config.display.proxyBadgeMode);
    expect(orchestrator.getState().server.reverseProxyEnabled).toBe(defaults.config.defense.topology.reverseProxyEnabled);
    expect(orchestrator.firewall.rateLimitEnabled).toBe(defaults.config.defense.firewall.rateLimit.enabled);
    expect(orchestrator.firewall.rateLimitThreshold).toBe(defaults.config.defense.firewall.rateLimit.threshold);
    expect(orchestrator.store.getState().config.defense.capacity.loadBalancingEnabled)
      .toBe(defaults.config.defense.capacity.loadBalancingEnabled);
  });

  it('reset replaces nested default branches and drops stale runtime references', () => {
    const staleRateLimit = orchestrator.store.state.config.defense.firewall.rateLimit;
    const staleParticles = orchestrator.particles;
    const staleAnalyzerLogs = orchestrator.analyzerLogs;

    orchestrator.firewall.rateLimitEnabled = true;
    orchestrator.firewall.rateLimitThreshold = 12;
    staleParticles.push({ id: 'stale-particle' });
    staleAnalyzerLogs.push({ action: 'BLOCKED', reason: 'STALE' });

    orchestrator.reset();

    expect(orchestrator.store.state.config.defense.firewall.rateLimit).toEqual(
      defaults.config.defense.firewall.rateLimit
    );
    expect(orchestrator.store.state.config.defense.firewall.rateLimit).not.toBe(staleRateLimit);
    expect(orchestrator.particles).toEqual([]);
    expect(orchestrator.analyzerLogs).toEqual([]);
    expect(orchestrator.particles).not.toBe(staleParticles);
    expect(orchestrator.analyzerLogs).not.toBe(staleAnalyzerLogs);

    staleRateLimit.enabled = true;
    staleRateLimit.threshold = 999;
    staleParticles.push({ id: 'leaked-particle' });
    staleAnalyzerLogs.push({ action: 'LEAKED', reason: 'STALE_REF' });

    expect(orchestrator.firewall.rateLimitEnabled).toBe(defaults.config.defense.firewall.rateLimit.enabled);
    expect(orchestrator.firewall.rateLimitThreshold).toBe(defaults.config.defense.firewall.rateLimit.threshold);
    expect(orchestrator.particles).toEqual([]);
    expect(orchestrator.analyzerLogs).toEqual([]);
  });

  it('exposes the renderer and UI snapshot shape through getState', () => {
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.isSimulationRunning = true;
    orchestrator.update(0.1);

    const state = orchestrator.getState();

    expect(state).toEqual(expect.objectContaining({
      server: expect.objectContaining({
        bandwidthUsage: expect.any(Number),
        cpuLoad: expect.any(Number),
        status: expect.any(String),
        happinessScore: expect.any(Number),
        droppedPackets: expect.any(Number),
        activeConnections: expect.any(Number),
        activeConnectionWeight: expect.any(Number),
        publicIP: expect.any(String),
        originIP: expect.any(String),
        reverseProxyEnabled: true
      }),
      attacker: expect.objectContaining({
        deviceCount: expect.any(Number),
        attackType: expect.any(String),
        isAttacking: expect.any(Boolean),
        botnetRanges: expect.any(Array)
      }),
      firewall: expect.objectContaining({
        blockedProtocols: expect.any(Array),
        blockedIPs: expect.any(Array),
        rateLimitEnabled: expect.any(Boolean),
        rateLimitThreshold: expect.any(Number),
        detectedSubnets: expect.any(Array)
      }),
      capacity: expect.objectContaining({
        serverCapacityMultiplier: expect.any(Number),
        loadBalancingEnabled: true,
        loadBalancingMultiplier: expect.any(Number),
        effectiveCapacityMultiplier: expect.any(Number),
        loadBalancingApplied: expect.any(Boolean)
      }),
      particles: orchestrator.particles,
      analyzerLogs: orchestrator.analyzerLogs,
      isSimulationRunning: true,
      aggregates: expect.objectContaining({
        activeWeighted: expect.any(Number),
        activeLegitWeighted: expect.any(Number),
        activeMaliciousWeighted: expect.any(Number),
        activeByType: expect.any(Object),
        halfOpenWeighted: expect.any(Number)
      }),
      networkNodes: expect.objectContaining({
        attackerCount: expect.any(Number),
        legitUserCount: expect.any(Number),
        proxy: expect.objectContaining({
          enabled: true,
          publicIP: expect.any(String),
          badgeMode: expect.any(String),
          trafficLabel: expect.any(String)
        }),
        origin: expect.objectContaining({
          ip: expect.any(String),
          status: expect.any(String)
        })
      })
    }));
  });

  it('keeps the default proxy badge mode stable across construction, invalid updates, and reset', () => {
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('ip');

    orchestrator.setProxyBadgeMode('count');
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('count');

    orchestrator.setProxyBadgeMode('unexpected');
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('ip');

    orchestrator.setProxyBadgeMode('count');
    orchestrator.reset();
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('ip');
  });

  it('getState returns a snapshot derived from store-backed state', () => {
    orchestrator.store.updateState({
      config: {
        attack: {
          deviceCount: 77
        },
        display: {
          proxyBadgeMode: 'count'
        },
        defense: {
          topology: {
            reverseProxyEnabled: true
          }
        }
      },
      runtime: {
        control: {
          simulationRunning: true,
          attackRunning: true
        },
        traffic: {
          particles: [{ id: 'packet-1', type: PACKET_TYPES.UDP, isMalicious: true }]
        },
        metrics: {
          analyzerSample: {
            logs: [{ action: 'BLOCKED', reason: 'TEST' }]
          }
        }
      }
    });

    const state = orchestrator.getState();

    expect(state.attacker.deviceCount).toBe(77);
    expect(state.networkNodes.proxy.enabled).toBe(true);
    expect(state.networkNodes.proxy.badgeMode).toBe('count');
    expect(state.isSimulationRunning).toBe(true);
    expect(state.attacker.isAttacking).toBe(true);
    expect(state.particles).toEqual([{ id: 'packet-1', type: PACKET_TYPES.UDP, isMalicious: true }]);
    expect(state.analyzerLogs).toEqual([expect.objectContaining({ action: 'BLOCKED', reason: 'TEST' })]);
  });

  it('nested state mutation through the store is visible through getState', () => {
    orchestrator.store.updateState({
      config: {
        defense: {
          firewall: {
            rateLimit: {
              enabled: true,
              threshold: 45
            }
          }
        }
      }
    });

    const state = orchestrator.getState();

    expect(state.firewall.rateLimitEnabled).toBe(true);
    expect(state.firewall.rateLimitThreshold).toBe(45);
  });

  it('compatibility fields mirror authoritative store state instead of becoming separate state owners', () => {
    orchestrator.isSimulationRunning = true;
    orchestrator.setProxyBadgeMode('count');
    orchestrator.particles = [{ id: 'particle-compat' }];
    orchestrator.analyzerLogs = [{ action: 'ALLOWED' }];
    orchestrator.attacker.isAttacking = true;
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    orchestrator.firewall.rateLimitEnabled = true;

    const state = orchestrator.store.getState();

    expect(state.runtime.control.simulationRunning).toBe(true);
    expect(state.runtime.control.attackRunning).toBe(true);
    expect(state.config.display.proxyBadgeMode).toBe('count');
    expect(state.runtime.traffic.particles).toEqual([{ id: 'particle-compat' }]);
    expect(state.runtime.metrics.analyzerSample.logs).toEqual([expect.objectContaining({ action: 'ALLOWED' })]);
    expect(state.config.defense.topology.reverseProxyEnabled).toBe(true);
    expect(state.config.defense.firewall.rateLimit.enabled).toBe(true);

    orchestrator.store.updateState({
      config: {
        display: { proxyBadgeMode: 'ip' },
        defense: {
          topology: { reverseProxyEnabled: false },
          firewall: {
            rateLimit: { enabled: false }
          }
        }
      },
      runtime: {
        control: {
          simulationRunning: false,
          attackRunning: false
        },
        traffic: {
          particles: [{ id: 'store-particle' }]
        },
        metrics: {
          analyzerSample: {
            logs: [{ action: 'DROPPED' }]
          }
        }
      }
    });

    expect(orchestrator.isSimulationRunning).toBe(false);
    expect(orchestrator.attacker.isAttacking).toBe(false);
    expect(orchestrator.particles).toEqual([{ id: 'store-particle' }]);
    expect(orchestrator.analyzerLogs).toEqual([expect.objectContaining({ action: 'DROPPED' })]);
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('ip');
    expect(orchestrator.getState().server.reverseProxyEnabled).toBe(false);
    expect(orchestrator.firewall.rateLimitEnabled).toBe(false);
  });
});