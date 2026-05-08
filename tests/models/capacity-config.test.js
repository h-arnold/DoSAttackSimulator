import { describe, it, expect } from 'vitest';
import { calculateEffectiveCapacity } from '../../js/models/capacityConfig.js';

describe('capacityConfig helpers', () => {
  it('returns base server capacity multiplier when load balancing is disabled', () => {
    const result = calculateEffectiveCapacity({
      serverCapacityMultiplier: 1.5,
      loadBalancingEnabled: false,
      loadBalancingMultiplier: 2
    });

    expect(result.effectiveCapacityMultiplier).toBe(1.5);
    expect(result.loadBalancingApplied).toBe(false);
  });

  it('applies load balancing multiplier when enabled', () => {
    const result = calculateEffectiveCapacity({
      serverCapacityMultiplier: 1.5,
      loadBalancingEnabled: true,
      loadBalancingMultiplier: 2
    });

    expect(result.effectiveCapacityMultiplier).toBe(3);
    expect(result.loadBalancingApplied).toBe(true);
  });

  it('defaults to neutral multipliers when values are omitted', () => {
    const result = calculateEffectiveCapacity({});
    expect(result.effectiveCapacityMultiplier).toBe(1);
    expect(result.loadBalancingApplied).toBe(false);
  });

  it('does not depend on firewall policy or topology config', () => {
    const baseline = calculateEffectiveCapacity({
      serverCapacityMultiplier: 1,
      loadBalancingEnabled: true,
      loadBalancingMultiplier: 1.5
    });

    const withUnrelatedState = calculateEffectiveCapacity({
      serverCapacityMultiplier: 1,
      loadBalancingEnabled: true,
      loadBalancingMultiplier: 1.5,
      firewallPolicy: { blockedSubnets: ['10.0.0'] },
      topology: { reverseProxyEnabled: true }
    });

    expect(withUnrelatedState).toEqual(baseline);
  });
});
