import { ATTACK_TYPES, CONSTANTS, SERVER_STATUS } from '../constants.js';

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
          loadBalancingMultiplier: 1
        }
      },
      display: {
        proxyBadgeMode: 'ip'
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
        totals: {
          allowed: 0,
          blocked: 0,
          dropped: 0
        },
        rollingWindow: {
          allowed: 0,
          blocked: 0,
          dropped: 0
        },
        analyzerSample: {
          logs: []
        },
        analyzerDroppedCount: 0
      }
    }
  };
}