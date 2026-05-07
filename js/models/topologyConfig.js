import { CONSTANTS } from '../constants.js';

function getLastOctet(ip) {
  const parts = String(ip).split('.');
  const last = Number(parts[3]);
  if (parts.length !== 4 || Number.isNaN(last) || last < 0 || last > 255) {
    return 1;
  }
  return last;
}

export function projectTopologyAddressing(topology = {}) {
  const {
    reverseProxyEnabled = false,
    publicIP = CONSTANTS.VICTIM_PUBLIC_IP,
    originIP = CONSTANTS.VICTIM_ORIGIN_IP,
    proxyPublicIP = CONSTANTS.PROXY_PUBLIC_IP,
    proxyEgressPrefix = CONSTANTS.PROXY_EGRESS_IP_PREFIX
  } = topology;

  return {
    reverseProxyEnabled,
    routeMode: reverseProxyEnabled ? 'REVERSE_PROXY' : 'DIRECT',
    publicEntryIP: reverseProxyEnabled ? proxyPublicIP : publicIP,
    originIP,
    originObservedSourcePattern: reverseProxyEnabled
      ? `${proxyEgressPrefix}.x`
      : 'client_source_ip'
  };
}

export function decideTopologyRoute({
  topology = {},
  sourceIP,
  clientIP = null
}) {
  const projection = projectTopologyAddressing(topology);

  if (!projection.reverseProxyEnabled) {
    return {
      routeMode: 'DIRECT',
      initialDestinationIP: projection.publicEntryIP,
      originDestinationIP: projection.originIP,
      originSourceIP: sourceIP,
      clientIP: null
    };
  }

  const egressLastOctet = getLastOctet(sourceIP);
  const egressIP = `${(topology.proxyEgressPrefix || CONSTANTS.PROXY_EGRESS_IP_PREFIX)}.${egressLastOctet}`;

  return {
    routeMode: 'REVERSE_PROXY',
    initialDestinationIP: projection.publicEntryIP,
    originDestinationIP: projection.originIP,
    originSourceIP: egressIP,
    clientIP: clientIP || sourceIP
  };
}
