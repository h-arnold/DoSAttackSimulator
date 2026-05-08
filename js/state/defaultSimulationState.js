import {
  ATTACK_TYPES,
  CONSTANTS,
  PROXY_BADGE_MODES,
  SERVER_STATUS
} from '../constants.js';

function createZeroOutcomeLedger() {
  return {
    allowed: { count: 0, weighted: 0 },
    blocked: { count: 0, weighted: 0 },
    dropped: { count: 0, weighted: 0 },
    missed: { count: 0, weighted: 0 }
  };
}

export default function defaultSimulationState() {
  return {
    config: {
      attack: {
        deviceCount: CONSTANTS.DEVICE_COUNT_MIN,
        attackType: ATTACK_TYPES.UDP,
        bandwidthMultiplier: CONSTANTS.BANDWIDTH_MULTIPLIER_MIN,
        targetIP: CONSTANTS.VICTIM_IP
      },
      legitimateTraffic: {
        userCount: CONSTANTS.GENUINE_USER_COUNT,
        packetsPerUserPerSec: CONSTANTS.GENUINE_PACKETS_PER_USER_PER_SEC
      },
      defense: {
        firewall: {
          blockedProtocols: [],
          blockedSubnets: [],
          rateLimit: {
            enabled: false,
            threshold: CONSTANTS.RATE_LIMIT_DEFAULT,
            scope: 'ALL'
          }
        },
        topology: {
          reverseProxyEnabled: CONSTANTS.REVERSE_PROXY_ENABLED,
          publicIP: CONSTANTS.VICTIM_PUBLIC_IP,
          originIP: CONSTANTS.VICTIM_ORIGIN_IP
        },
        capacity: {
          serverCapacityMultiplier: 1,
          loadBalancingEnabled: false,
          loadBalancingMultiplier: CONSTANTS.LOAD_BALANCING_MULTIPLIER_DEFAULT
        }
      },
      display: {
        proxyBadgeMode: PROXY_BADGE_MODES.IP
      }
    },
    runtime: {
      control: {
        simulationRunning: false,
        attackRunning: false
      },
      traffic: {
        particles: [],
        botnetRanges: [],
        detectedSubnets: []
      },
      server: {
        bandwidthUsage: 0,
        cpuLoad: 0,
        status: SERVER_STATUS.ONLINE,
        activeConnections: [],
        droppedPacketEvents: [],
        happinessScore: 100
      },
      metrics: {
        totals: createZeroOutcomeLedger(),
        rollingWindow: {
          windowMs: 10000,
          totals: createZeroOutcomeLedger(),
          buckets: []
        },
        analyzerSample: {
          logs: [],
          visibleCount: 0,
          droppedByBudgetCount: 0
        },
        analyzerDroppedCount: 0
      }
    }
  };
}