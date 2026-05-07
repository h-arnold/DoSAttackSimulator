import { CONSTANTS } from '../constants.js';
import { evaluateFirewallPolicy } from './firewallPolicy.js';

export default class Firewall {
  constructor({
    blockedProtocols = [],
    blockedIPs = [],
    rateLimitThreshold = CONSTANTS.RATE_LIMIT_DEFAULT,
    rateLimitScope = 'ALL',
    rateLimitEnabled = false,
    rateLimitWindowSeconds = 1
  } = {}) {
    this.blockedProtocols = new Set(blockedProtocols);
    this.blockedIPs = new Set(blockedIPs);
    this.detectedSubnets = new Set();
    this.rateLimitThreshold = rateLimitThreshold;
    this.rateLimitScope = rateLimitScope;
    this.rateLimitEnabled = rateLimitEnabled;
    this.rateLimitWindowSeconds = rateLimitWindowSeconds;
    this.perIpCounters = new Map();
  }

  getPolicyConfig() {
    return {
      blockedProtocols: Array.from(this.blockedProtocols),
      blockedSubnets: Array.from(this.blockedIPs),
      rateLimit: {
        enabled: this.rateLimitEnabled,
        threshold: this.rateLimitThreshold,
        scope: this.rateLimitScope,
        windowSeconds: this.rateLimitWindowSeconds
      }
    };
  }

  inspect(packet, nowSeconds = Date.now() / 1000, policyConfig = this.getPolicyConfig()) {
    const result = evaluateFirewallPolicy({
      packetType: packet.type,
      sourceIP: packet.sourceIP,
      clientIP: packet.clientIP,
      nowSeconds,
      policy: policyConfig,
      rateLimitCounters: this.perIpCounters
    });

    if (result.effectiveSubnet) {
      this.detectedSubnets.add(result.effectiveSubnet);
    }
    this.perIpCounters = result.rateLimitCounters;

    return { allowed: result.allowed, reason: result.reason };
  }

  getDetectedSubnets() {
    return Array.from(this.detectedSubnets);
  }
}
