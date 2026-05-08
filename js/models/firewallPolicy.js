import { PACKET_TYPES, PROTOCOLS } from '../constants.js';
import { extractSubnet } from '../utils.js';

function mapPacketTypeToProtocol(packetType) {
  if (packetType === PACKET_TYPES.HTTP_GET || packetType === PACKET_TYPES.TCP_SYN) {
    return PROTOCOLS.TCP;
  }
  if (packetType === PACKET_TYPES.UDP) {
    return PROTOCOLS.UDP;
  }
  if (packetType === PACKET_TYPES.ICMP) {
    return PROTOCOLS.ICMP;
  }
  return undefined;
}

function shouldApplyRateLimit(rateLimit, protocol) {
  if (!rateLimit?.enabled || !protocol) {
    return false;
  }
  return rateLimit.scope === 'ALL' || rateLimit.scope === protocol;
}

function makeRateLimitKey(effectiveIP, scope, protocol) {
  return scope === 'ALL' ? `${effectiveIP}|ALL` : `${effectiveIP}|${protocol}`;
}

function advanceCounter(counter, nowSeconds, windowSeconds) {
  const nextCounter = { ...counter };
  if (nowSeconds - nextCounter.windowStart >= windowSeconds) {
    nextCounter.windowStart = nowSeconds;
    nextCounter.count = 0;
  }
  nextCounter.count += 1;
  return nextCounter;
}

export function evaluateFirewallPolicy({
  packetType,
  sourceIP,
  clientIP = null,
  nowSeconds = 0,
  policy = {},
  rateLimitCounters = new Map()
}) {
  const blockedProtocols = policy.blockedProtocols || [];
  const blockedSubnets = policy.blockedSubnets || [];
  const rateLimit = {
    enabled: false,
    threshold: 20,
    scope: 'ALL',
    windowSeconds: 1,
    ...(policy.rateLimit || {})
  };

  const protocol = mapPacketTypeToProtocol(packetType);
  const effectiveIP = clientIP || sourceIP;
  const effectiveSubnet = extractSubnet(effectiveIP);

  if (protocol && blockedProtocols.includes(protocol)) {
    return {
      allowed: false,
      reason: 'BLOCK_PROTOCOL',
      protocol,
      effectiveIP,
      effectiveSubnet,
      rateLimitCounters: new Map(rateLimitCounters)
    };
  }

  if (blockedSubnets.includes(effectiveSubnet)) {
    return {
      allowed: false,
      reason: 'BLOCK_IP',
      protocol,
      effectiveIP,
      effectiveSubnet,
      rateLimitCounters: new Map(rateLimitCounters)
    };
  }

  if (shouldApplyRateLimit(rateLimit, protocol)) {
    const key = makeRateLimitKey(effectiveIP, rateLimit.scope, protocol);
    const previous = rateLimitCounters.get(key) || { count: 0, windowStart: nowSeconds };
    const nextCounter = advanceCounter(previous, nowSeconds, rateLimit.windowSeconds);
    const nextRateLimitCounters = new Map(rateLimitCounters);
    nextRateLimitCounters.set(key, nextCounter);

    if (nextCounter.count > rateLimit.threshold) {
      return {
        allowed: false,
        reason: 'RATE_LIMIT',
        protocol,
        effectiveIP,
        effectiveSubnet,
        rateLimitCounters: nextRateLimitCounters
      };
    }

    return {
      allowed: true,
      reason: 'ALLOWED',
      protocol,
      effectiveIP,
      effectiveSubnet,
      rateLimitCounters: nextRateLimitCounters
    };
  }

  return {
    allowed: true,
    reason: 'ALLOWED',
    protocol,
    effectiveIP,
    effectiveSubnet,
    rateLimitCounters: new Map(rateLimitCounters)
  };
}

export { mapPacketTypeToProtocol };
