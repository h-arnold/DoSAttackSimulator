import { describe, it, expect } from 'vitest';
import { PACKET_TYPES, PROTOCOLS } from '../../js/constants.js';
import { evaluateFirewallPolicy } from '../../js/models/firewallPolicy.js';

describe('firewallPolicy helpers', () => {
  it('rejects packets when protocol is blocked', () => {
    const result = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.HTTP_GET,
      sourceIP: '45.33.12.8',
      nowSeconds: 10,
      policy: {
        blockedProtocols: [PROTOCOLS.TCP],
        blockedSubnets: [],
        rateLimit: { enabled: false, threshold: 2, scope: 'ALL', windowSeconds: 1 }
      },
      rateLimitCounters: new Map()
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BLOCK_PROTOCOL');
    expect(result.effectiveIP).toBe('45.33.12.8');
    expect(result.effectiveSubnet).toBe('45.33.12');
  });

  it('rejects packets when subnet is blocked', () => {
    const result = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '99.1.2.33',
      nowSeconds: 10,
      policy: {
        blockedProtocols: [],
        blockedSubnets: ['99.1.2'],
        rateLimit: { enabled: false, threshold: 2, scope: 'ALL', windowSeconds: 1 }
      },
      rateLimitCounters: new Map()
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BLOCK_IP');
    expect(result.effectiveSubnet).toBe('99.1.2');
  });

  it('enforces rate limit threshold and resets when window elapses', () => {
    const policy = {
      blockedProtocols: [],
      blockedSubnets: [],
      rateLimit: { enabled: true, threshold: 2, scope: 'ALL', windowSeconds: 1 }
    };

    const first = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.5',
      nowSeconds: 100,
      policy,
      rateLimitCounters: new Map()
    });
    const second = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.5',
      nowSeconds: 100.2,
      policy,
      rateLimitCounters: first.rateLimitCounters
    });
    const third = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.5',
      nowSeconds: 100.3,
      policy,
      rateLimitCounters: second.rateLimitCounters
    });
    const afterReset = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.5',
      nowSeconds: 101.2,
      policy,
      rateLimitCounters: third.rateLimitCounters
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe('RATE_LIMIT');
    expect(afterReset.allowed).toBe(true);
  });

  it('applies rate limit scope by protocol', () => {
    const policy = {
      blockedProtocols: [],
      blockedSubnets: [],
      rateLimit: { enabled: true, threshold: 1, scope: PROTOCOLS.UDP, windowSeconds: 1 }
    };

    const udpFirst = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.8',
      nowSeconds: 50,
      policy,
      rateLimitCounters: new Map()
    });
    const udpSecond = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '10.0.0.8',
      nowSeconds: 50.2,
      policy,
      rateLimitCounters: udpFirst.rateLimitCounters
    });
    const tcpSameIp = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.HTTP_GET,
      sourceIP: '10.0.0.8',
      nowSeconds: 50.3,
      policy,
      rateLimitCounters: udpSecond.rateLimitCounters
    });

    expect(udpFirst.allowed).toBe(true);
    expect(udpSecond.allowed).toBe(false);
    expect(udpSecond.reason).toBe('RATE_LIMIT');
    expect(tcpSameIp.allowed).toBe(true);
  });

  it('uses clientIP as effective identity when present', () => {
    const result = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.ICMP,
      sourceIP: '198.51.100.44',
      clientIP: '77.8.9.10',
      nowSeconds: 20,
      policy: {
        blockedProtocols: [],
        blockedSubnets: ['77.8.9'],
        rateLimit: { enabled: false, threshold: 2, scope: 'ALL', windowSeconds: 1 }
      },
      rateLimitCounters: new Map()
    });

    expect(result.allowed).toBe(false);
    expect(result.effectiveIP).toBe('77.8.9.10');
    expect(result.effectiveSubnet).toBe('77.8.9');
  });

  it('does not depend on unrelated topology or capacity inputs', () => {
    const baseline = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '1.2.3.4',
      nowSeconds: 5,
      policy: {
        blockedProtocols: [],
        blockedSubnets: [],
        rateLimit: { enabled: false, threshold: 1, scope: 'ALL', windowSeconds: 1 }
      },
      rateLimitCounters: new Map()
    });

    const withUnrelatedState = evaluateFirewallPolicy({
      packetType: PACKET_TYPES.UDP,
      sourceIP: '1.2.3.4',
      nowSeconds: 5,
      policy: {
        blockedProtocols: [],
        blockedSubnets: [],
        rateLimit: { enabled: false, threshold: 1, scope: 'ALL', windowSeconds: 1 }
      },
      rateLimitCounters: new Map(),
      topology: { reverseProxyEnabled: true },
      capacity: { loadBalancingEnabled: true }
    });

    expect(withUnrelatedState.allowed).toBe(baseline.allowed);
    expect(withUnrelatedState.reason).toBe(baseline.reason);
  });
});
