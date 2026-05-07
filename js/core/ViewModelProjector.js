import { abbreviateNumber } from '../utils.js';
import { calculateEffectiveCapacity } from '../models/capacityConfig.js';

function getWeightedTotal(entries = []) {
  return entries.reduce((sum, entry) => sum + (entry.weight || 0), 0);
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

export default class ViewModelProjector {
  project(state, { aggregates } = {}) {
    const runtime = state?.runtime || {};
    const config = state?.config || {};
    const topology = config?.defense?.topology || {};
    const firewall = config?.defense?.firewall || {};
    const capacity = config?.defense?.capacity || {};
    const attack = config?.attack || {};
    const legitimateTraffic = config?.legitimateTraffic || {};
    const serverRuntime = runtime?.server || {};
    const trafficRuntime = runtime?.traffic || {};
    const metricsRuntime = runtime?.metrics || {};
    const controlRuntime = runtime?.control || {};

    const computedAggregates = aggregates || {
      activeWeighted: 0,
      activeLegitWeighted: 0,
      activeMaliciousWeighted: 0,
      activeByType: {},
      halfOpenWeighted: getWeightedTotal(serverRuntime.activeConnections || [])
    };

    return {
      server: {
        bandwidthUsage: serverRuntime.bandwidthUsage,
        cpuLoad: serverRuntime.cpuLoad,
        status: serverRuntime.status,
        happinessScore: serverRuntime.happinessScore,
        droppedPackets: getWeightedTotal(serverRuntime.droppedPacketEvents || []),
        activeConnections: cloneArray(serverRuntime.activeConnections).length,
        activeConnectionWeight: computedAggregates.halfOpenWeighted,
        publicIP: topology.publicIP,
        originIP: topology.originIP,
        reverseProxyEnabled: Boolean(topology.reverseProxyEnabled)
      },
      attacker: {
        deviceCount: attack.deviceCount,
        attackType: attack.attackType,
        isAttacking: Boolean(controlRuntime.attackRunning),
        botnetRanges: cloneArray(trafficRuntime.botnetRanges)
      },
      firewall: {
        blockedProtocols: cloneArray(firewall.blockedProtocols),
        blockedIPs: cloneArray(firewall.blockedSubnets),
        rateLimitEnabled: Boolean(firewall?.rateLimit?.enabled),
        rateLimitThreshold: firewall?.rateLimit?.threshold,
        detectedSubnets: cloneArray(trafficRuntime.detectedSubnets)
      },
      capacity: {
        ...capacity,
        ...calculateEffectiveCapacity(capacity)
      },
      particles: cloneArray(trafficRuntime.particles),
      analyzerLogs: cloneArray(metricsRuntime?.analyzerSample?.logs),
      isSimulationRunning: Boolean(controlRuntime.simulationRunning),
      aggregates: {
        ...computedAggregates,
        activeByType: { ...(computedAggregates.activeByType || {}) }
      },
      networkNodes: {
        attackerCount: attack.deviceCount,
        legitUserCount: legitimateTraffic.userCount,
        proxy: {
          enabled: Boolean(topology.reverseProxyEnabled),
          publicIP: topology.publicIP,
          badgeMode: config?.display?.proxyBadgeMode,
          trafficLabel: abbreviateNumber(computedAggregates.activeWeighted || 0)
        },
        origin: {
          ip: topology.originIP,
          status: serverRuntime.status
        }
      }
    };
  }
}