import { describe, expect, it } from 'vitest';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';
import SimulationStore from '../../js/state/SimulationStore.js';

describe('SimulationStore', () => {
  it('initializes from cloned defaults and returns isolated state snapshots', () => {
    const store = new SimulationStore();
    const initialSnapshot = store.getState();

    initialSnapshot.config.attack.deviceCount = 999;
    initialSnapshot.runtime.traffic.particles.push({ id: 'packet-1' });

    expect(store.getState()).toEqual(defaultSimulationState());
    expect(store.getState()).not.toBe(initialSnapshot);
  });

  it('replaces the full state tree and clones caller-provided replacement state', () => {
    const store = new SimulationStore();
    const replacementState = defaultSimulationState();

    replacementState.runtime.control.simulationRunning = true;
    replacementState.config.defense.firewall.blockedProtocols.push('UDP');
    replacementState.runtime.server.activeConnections.push({ id: 'conn-1' });

    store.replaceState(replacementState);

    replacementState.runtime.control.simulationRunning = false;
    replacementState.config.defense.firewall.blockedProtocols.push('TCP');
    replacementState.runtime.server.activeConnections.push({ id: 'conn-2' });

    expect(store.getState()).toMatchObject({
      config: {
        defense: {
          firewall: {
            blockedProtocols: ['UDP']
          }
        }
      },
      runtime: {
        control: {
          simulationRunning: true
        },
        server: {
          activeConnections: [{ id: 'conn-1' }]
        }
      }
    });

    store.replaceState(defaultSimulationState());

    expect(store.getState()).toEqual(defaultSimulationState());
  });

  it('applies targeted nested updates without discarding sibling branches or leaking caller mutation', () => {
    const store = new SimulationStore();
    const update = {
      config: {
        defense: {
          firewall: {
            rateLimit: {
              enabled: true
            }
          }
        }
      },
      runtime: {
        control: {
          attackRunning: true
        }
      }
    };

    store.updateState(update);

    update.config.defense.firewall.rateLimit.enabled = false;
    update.runtime.control.attackRunning = false;

    expect(store.getState()).toEqual({
      ...defaultSimulationState(),
      config: {
        ...defaultSimulationState().config,
        defense: {
          ...defaultSimulationState().config.defense,
          firewall: {
            ...defaultSimulationState().config.defense.firewall,
            rateLimit: {
              ...defaultSimulationState().config.defense.firewall.rateLimit,
              enabled: true
            }
          }
        }
      },
      runtime: {
        ...defaultSimulationState().runtime,
        control: {
          ...defaultSimulationState().runtime.control,
          attackRunning: true
        }
      }
    });
  });

  it('rejects unsupported root-level update payloads without mutating state', () => {
    const store = new SimulationStore();
    const initialState = store.getState();

    expect(() => store.replaceState(null)).toThrow(TypeError);
    expect(() => store.updateState([])).toThrow(TypeError);
    expect(store.getState()).toEqual(initialState);
  });

  it('keeps metrics ledger serializable and isolated across update and reset paths', () => {
    const store = new SimulationStore();

    store.updateState({
      runtime: {
        metrics: {
          totals: {
            allowed: { count: 4, weighted: 400 }
          },
          analyzerSample: {
            visibleCount: 3,
            droppedByBudgetCount: 7,
            logs: [{ action: 'ALLOWED', timestamp: 123 }]
          }
        }
      }
    });

    const snapshot = store.getState().runtime.metrics;
    expect(snapshot.totals.allowed).toEqual({ count: 4, weighted: 400 });
    expect(snapshot.totals.missed).toEqual({ count: 0, weighted: 0 });
    expect(snapshot.rollingWindow).toEqual({
      windowMs: 10000,
      totals: {
        allowed: { count: 0, weighted: 0 },
        blocked: { count: 0, weighted: 0 },
        dropped: { count: 0, weighted: 0 },
        missed: { count: 0, weighted: 0 }
      },
      buckets: []
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);

    store.replaceState(defaultSimulationState());
    expect(store.getState().runtime.metrics).toEqual(defaultSimulationState().runtime.metrics);
  });
});