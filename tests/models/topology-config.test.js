import { describe, it, expect } from 'vitest';
import {
  decideTopologyRoute,
  projectTopologyAddressing
} from '../../js/models/topologyConfig.js';

describe('topologyConfig helpers', () => {
  it('routes directly to origin when reverse proxy is disabled', () => {
    const topology = {
      reverseProxyEnabled: false,
      publicIP: '203.0.113.10',
      originIP: '203.0.113.10',
      proxyPublicIP: '198.51.100.20',
      proxyEgressPrefix: '198.51.100'
    };

    const route = decideTopologyRoute({ topology, sourceIP: '45.33.12.7' });

    expect(route.routeMode).toBe('DIRECT');
    expect(route.initialDestinationIP).toBe('203.0.113.10');
    expect(route.originDestinationIP).toBe('203.0.113.10');
    expect(route.originSourceIP).toBe('45.33.12.7');
    expect(route.clientIP).toBeNull();
  });

  it('routes through reverse proxy when enabled', () => {
    const topology = {
      reverseProxyEnabled: true,
      publicIP: '203.0.113.10',
      originIP: '203.0.113.10',
      proxyPublicIP: '198.51.100.20',
      proxyEgressPrefix: '198.51.100'
    };

    const route = decideTopologyRoute({ topology, sourceIP: '45.33.12.7' });

    expect(route.routeMode).toBe('REVERSE_PROXY');
    expect(route.initialDestinationIP).toBe('198.51.100.20');
    expect(route.originDestinationIP).toBe('203.0.113.10');
    expect(route.clientIP).toBe('45.33.12.7');
    expect(route.originSourceIP).toBe('198.51.100.7');
  });

  it('projects addressing labels from topology config', () => {
    const directProjection = projectTopologyAddressing({
      reverseProxyEnabled: false,
      publicIP: '203.0.113.10',
      originIP: '203.0.113.10',
      proxyPublicIP: '198.51.100.20',
      proxyEgressPrefix: '198.51.100'
    });
    const proxiedProjection = projectTopologyAddressing({
      reverseProxyEnabled: true,
      publicIP: '203.0.113.10',
      originIP: '203.0.113.10',
      proxyPublicIP: '198.51.100.20',
      proxyEgressPrefix: '198.51.100'
    });

    expect(directProjection.routeMode).toBe('DIRECT');
    expect(directProjection.publicEntryIP).toBe('203.0.113.10');
    expect(directProjection.originIP).toBe('203.0.113.10');
    expect(directProjection.originObservedSourcePattern).toBe('client_source_ip');

    expect(proxiedProjection.routeMode).toBe('REVERSE_PROXY');
    expect(proxiedProjection.publicEntryIP).toBe('198.51.100.20');
    expect(proxiedProjection.originIP).toBe('203.0.113.10');
    expect(proxiedProjection.originObservedSourcePattern).toBe('198.51.100.x');
  });

  it('does not depend on firewall or capacity configuration', () => {
    const topology = {
      reverseProxyEnabled: true,
      publicIP: '203.0.113.10',
      originIP: '203.0.113.10',
      proxyPublicIP: '198.51.100.20',
      proxyEgressPrefix: '198.51.100'
    };

    const baseline = decideTopologyRoute({ topology, sourceIP: '8.8.8.8' });
    const withUnrelatedState = decideTopologyRoute({
      topology,
      sourceIP: '8.8.8.8',
      firewallPolicy: { blockedProtocols: ['UDP'] },
      capacity: { loadBalancingEnabled: true }
    });

    expect(withUnrelatedState).toEqual(baseline);
  });
});
