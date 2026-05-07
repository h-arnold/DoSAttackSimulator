import { describe, it, expect, beforeEach, vi } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import { ATTACK_TYPES, CONSTANTS, PROTOCOLS } from '../../js/constants.js';

function cloneState(orchestrator) {
  return structuredClone(orchestrator.store.getState());
}

describe('Orchestrator dispatch contract (Phase 2)', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it('exposes dispatch(command)', () => {
    expect(typeof orchestrator.dispatch).toBe('function');
  });

  it('rejects malformed command envelopes', () => {
    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch()).toThrow('Command must be an object with a string type.');
    expect(() => orchestrator.dispatch(null)).toThrow('Command must be an object with a string type.');
    expect(() => orchestrator.dispatch([])).toThrow('Command must be an object with a string type.');
    expect(() => orchestrator.dispatch({})).toThrow('Command must be an object with a string type.');
    expect(() => orchestrator.dispatch({ type: 42 })).toThrow('Command must be an object with a string type.');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('rejects unknown command types explicitly and keeps state unchanged', () => {
    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({ type: 'UNKNOWN_COMMAND' })).toThrow('Unknown command type: UNKNOWN_COMMAND');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('rejects unsupported payloads for no-payload control commands', () => {
    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION,
      payload: { forced: true }
    })).toThrow('START_SIMULATION does not accept a payload.');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('applies START_SIMULATION and STOP_SIMULATION valid transitions', () => {
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    expect(orchestrator.isSimulationRunning).toBe(true);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION });
    expect(orchestrator.isSimulationRunning).toBe(false);
  });

  it('rejects invalid simulation control transitions', () => {
    const beforeStart = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION }))
      .toThrow('Invalid transition: simulation is already stopped.');
    expect(orchestrator.store.getState()).toEqual(beforeStart);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    const beforeDuplicateStart = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION }))
      .toThrow('Invalid transition: simulation is already running.');
    expect(orchestrator.store.getState()).toEqual(beforeDuplicateStart);
  });

  it('applies START_ATTACK and STOP_ATTACK valid transitions', () => {
    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    expect(orchestrator.attacker.isAttacking).toBe(true);
    expect(orchestrator.attacker.botnetRanges.length).toBeGreaterThan(0);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK });
    expect(orchestrator.attacker.isAttacking).toBe(false);
  });

  it('rejects invalid attack control transitions and keeps state unchanged', () => {
    const beforeStart = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK }))
      .toThrow('Invalid transition: attack is already stopped.');
    expect(orchestrator.store.getState()).toEqual(beforeStart);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    const beforeDuplicateStart = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK }))
      .toThrow('Invalid transition: attack is already running.');
    expect(orchestrator.store.getState()).toEqual(beforeDuplicateStart);
  });

  it('supports RESET_SIMULATION command through dispatch', () => {
    orchestrator.isSimulationRunning = true;
    orchestrator.attacker.isAttacking = true;
    orchestrator.update(0.2);

    expect(orchestrator.particles.length).toBeGreaterThan(0);

    orchestrator.dispatch({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });

    expect(orchestrator.isSimulationRunning).toBe(false);
    expect(orchestrator.attacker.isAttacking).toBe(false);
    expect(orchestrator.particles).toEqual([]);
    expect(orchestrator.analyzerLogs).toEqual([]);
  });

  it('applies SET_ATTACK_CONFIG updates to store-backed attack state', () => {
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: {
        deviceCount: 321,
        attackType: ATTACK_TYPES.TCP_SYN,
        bandwidthMultiplier: 1.7,
        targetIP: '198.51.100.42'
      }
    });

    const state = orchestrator.store.getState();

    expect(orchestrator.attacker.deviceCount).toBe(321);
    expect(orchestrator.attacker.attackType).toBe(ATTACK_TYPES.TCP_SYN);
    expect(orchestrator.attacker.bandwidthMultiplier).toBe(1.7);
    expect(orchestrator.attacker.targetIP).toBe('198.51.100.42');
    expect(state.config.attack).toEqual(expect.objectContaining({
      deviceCount: 321,
      attackType: ATTACK_TYPES.TCP_SYN,
      bandwidthMultiplier: 1.7,
      targetIP: '198.51.100.42'
    }));
  });

  it('rejects invalid SET_ATTACK_CONFIG payloads atomically', () => {
    const invalidPayloads = [
      { deviceCount: 0 },
      { deviceCount: CONSTANTS.DEVICE_COUNT_MAX + 1 },
      { deviceCount: 10.5 },
      { attackType: 'HTTP_GET' },
      { bandwidthMultiplier: CONSTANTS.BANDWIDTH_MULTIPLIER_MIN - 0.1 },
      { bandwidthMultiplier: CONSTANTS.BANDWIDTH_MULTIPLIER_MAX + 0.1 },
      { targetIP: '' },
      { targetIP: '   ' }
    ];

    invalidPayloads.forEach((payload) => {
      const initial = cloneState(orchestrator);

      expect(() => orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
        payload
      })).toThrow();

      expect(orchestrator.store.getState()).toEqual(initial);
    });
  });

  it('updates firewall blocked protocol toggles via command', () => {
    const beforeTopology = structuredClone(orchestrator.store.getState().config.defense.topology);
    const beforeCapacity = structuredClone(orchestrator.store.getState().config.defense.capacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.UDP, blocked: true }
    });

    expect(orchestrator.firewall.blockedProtocols.has(PROTOCOLS.UDP)).toBe(true);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(beforeTopology);
    expect(orchestrator.store.getState().config.defense.capacity).toEqual(beforeCapacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.UDP, blocked: false }
    });

    expect(orchestrator.firewall.blockedProtocols.has(PROTOCOLS.UDP)).toBe(false);
  });

  it('rejects invalid firewall protocol toggle payloads atomically', () => {
    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: 'HTTP', blocked: true }
    })).toThrow('SET_FIREWALL_PROTOCOL_BLOCK requires a valid protocol.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.TCP, blocked: 'yes' }
    })).toThrow('SET_FIREWALL_PROTOCOL_BLOCK requires a boolean blocked flag.');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('updates firewall blocked subnet toggles via command', () => {
    const subnet = '198.51.100';
    const beforeTopology = structuredClone(orchestrator.store.getState().config.defense.topology);
    const beforeCapacity = structuredClone(orchestrator.store.getState().config.defense.capacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_SUBNET_BLOCK,
      payload: { subnet, blocked: true }
    });
    expect(orchestrator.firewall.blockedIPs.has(subnet)).toBe(true);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(beforeTopology);
    expect(orchestrator.store.getState().config.defense.capacity).toEqual(beforeCapacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_SUBNET_BLOCK,
      payload: { subnet, blocked: false }
    });
    expect(orchestrator.firewall.blockedIPs.has(subnet)).toBe(false);
  });

  it('updates firewall rate-limiting commands and validates payloads', () => {
    const beforeTopology = structuredClone(orchestrator.store.getState().config.defense.topology);
    const beforeCapacity = structuredClone(orchestrator.store.getState().config.defense.capacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: true }
    });
    expect(orchestrator.firewall.rateLimitEnabled).toBe(true);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
      payload: { threshold: 42 }
    });
    expect(orchestrator.firewall.rateLimitThreshold).toBe(42);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE,
      payload: { scope: PROTOCOLS.TCP }
    });
    expect(orchestrator.firewall.rateLimitScope).toBe(PROTOCOLS.TCP);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(beforeTopology);
    expect(orchestrator.store.getState().config.defense.capacity).toEqual(beforeCapacity);

    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: 1 }
    })).toThrow('SET_FIREWALL_RATE_LIMIT_ENABLED requires a boolean enabled flag.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
      payload: { threshold: CONSTANTS.RATE_LIMIT_MAX + 1 }
    })).toThrow('SET_FIREWALL_RATE_LIMIT_THRESHOLD requires an integer threshold within allowed range.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE,
      payload: { scope: 'GLOBAL' }
    })).toThrow('SET_FIREWALL_RATE_LIMIT_SCOPE requires a valid scope.');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('updates reverse proxy topology, capacity, and display commands', () => {
    const baseline = structuredClone(orchestrator.store.getState().config.defense);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    expect(orchestrator.server.reverseProxyEnabled).toBe(true);
    expect(orchestrator.server.publicIP).toBe(CONSTANTS.PROXY_PUBLIC_IP);
    expect(orchestrator.store.getState().config.defense.firewall).toEqual(baseline.firewall);
    expect(orchestrator.store.getState().config.defense.capacity).toEqual(baseline.capacity);

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
    expect(orchestrator.firewall.loadBalancingEnabled).toBe(true);
    expect(orchestrator.store.getState().config.defense.firewall).toEqual(baseline.firewall);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(
      expect.objectContaining({
        reverseProxyEnabled: true,
        publicIP: CONSTANTS.PROXY_PUBLIC_IP,
        originIP: baseline.topology.originIP
      })
    );

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 3.5 }
    });
    expect(orchestrator.server.bandwidthCapacityMultiplier).toBe(3.5);
    expect(orchestrator.store.getState().config.defense.firewall).toEqual(baseline.firewall);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(
      expect.objectContaining({
        reverseProxyEnabled: true,
        publicIP: CONSTANTS.PROXY_PUBLIC_IP,
        originIP: baseline.topology.originIP
      })
    );

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'count' }
    });
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('count');
    expect(orchestrator.store.getState().config.defense).toEqual(expect.objectContaining({
      firewall: baseline.firewall,
      topology: expect.objectContaining({
        reverseProxyEnabled: true,
        publicIP: CONSTANTS.PROXY_PUBLIC_IP,
        originIP: baseline.topology.originIP
      }),
      capacity: {
        serverCapacityMultiplier: 3.5,
        loadBalancingEnabled: true,
        loadBalancingMultiplier: 2
      }
    }));
  });

  it('rejects invalid topology/capacity/display payloads atomically', () => {
    const initial = cloneState(orchestrator);

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: 'true' }
    })).toThrow('SET_REVERSE_PROXY_ENABLED requires a boolean enabled flag.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: 'true' }
    })).toThrow('SET_LOAD_BALANCING_ENABLED requires a boolean enabled flag.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 0.1 }
    })).toThrow('SET_SERVER_CAPACITY_MULTIPLIER requires a numeric multiplier within allowed range.');

    expect(() => orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'verbose' }
    })).toThrow('SET_PROXY_BADGE_MODE requires mode to be "ip" or "count".');

    expect(orchestrator.store.getState()).toEqual(initial);
  });

  it('routes setProxyBadgeMode compatibility writes through dispatch to avoid split ownership', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    orchestrator.setProxyBadgeMode('count');

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'count' }
    });
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('count');
  });

  it('normalizes invalid setProxyBadgeMode compatibility input and still routes through dispatch', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    orchestrator.setProxyBadgeMode('invalid');

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'ip' }
    });
    expect(orchestrator.getState().networkNodes.proxy.badgeMode).toBe('ip');
  });
});
