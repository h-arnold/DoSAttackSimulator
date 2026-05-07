import { PACKET_TYPES, SERVER_STATUS, CONSTANTS } from '../constants.js';
import { clamp } from '../utils.js';
import { calculateEffectiveCapacity } from './capacityConfig.js';

const LOAD_PER_PACKET = 1;
export const DROPPED_PACKET_TTL_SECONDS = 10; // v1.1: dropped packets age out after 10 seconds

export default class Server {
  constructor() {
    this.reset();
  }

  getCurrentLoad() {
    return Math.max(this.bandwidthUsage, this.cpuLoad);
  }

  updateStatus() {
    const load = this.getCurrentLoad();
    if (this.status === SERVER_STATUS.CRASHED && load >= CONSTANTS.SERVER_RECOVERY_THRESHOLD) {
      this.status = SERVER_STATUS.CRASHED;
      return;
    }

    if (load >= CONSTANTS.SERVER_CRASHED_THRESHOLD) {
      this.status = SERVER_STATUS.CRASHED;
    } else if (load >= CONSTANTS.SERVER_DEGRADED_THRESHOLD) {
      this.status = SERVER_STATUS.DEGRADED;
    } else {
      this.status = SERVER_STATUS.ONLINE;
    }
  }

  updateHappiness() {
    // v1.3: Calculate happiness using weighted drops so aggregate badges align
    const activeDroppedWeight = this.droppedPacketEvents.reduce((sum, drop) => sum + drop.weight, 0);
    this.happinessScore = clamp(
      100 - activeDroppedWeight * CONSTANTS.HAPPINESS_PENALTY_PER_DROP,
      0,
      100
    );
    this.droppedPackets = activeDroppedWeight;
  }

  getEffectiveCapacityMultiplier(capacityConfig = null) {
    if (capacityConfig && typeof capacityConfig === 'object') {
      const { effectiveCapacityMultiplier } = calculateEffectiveCapacity(capacityConfig);
      return Math.max(effectiveCapacityMultiplier || 1, 0.0001);
    }

    return Math.max(this.bandwidthCapacityMultiplier || 1, 0.0001);
  }

  receive(packet, options = {}) {
    const weight = packet.trafficWeight || 1;
    const effectiveCapacityMultiplier = this.getEffectiveCapacityMultiplier(options.capacity);

    if (packet.type === PACKET_TYPES.HTTP_GET) {
      const load = this.getCurrentLoad();
      if (this.status === SERVER_STATUS.CRASHED || load >= CONSTANTS.SERVER_CRASHED_THRESHOLD) {
        // v1.1: Track dropped packet with TTL for recovery
        this.recordDroppedPacket(weight);
        return { allowed: false, reason: 'CRASHED' };
      }
      return { allowed: true, reason: 'OK' };
    }

    // Volume attacks (UDP/ICMP) target bandwidth - affected by bandwidth capacity
    if (packet.type === PACKET_TYPES.UDP || packet.type === PACKET_TYPES.ICMP) {
      const effectiveLoad = (weight * LOAD_PER_PACKET) / effectiveCapacityMultiplier;
      this.bandwidthUsage = clamp(this.bandwidthUsage + effectiveLoad, 0, 100);
    } 
    // Protocol attacks (TCP SYN) target CPU/RAM - NOT affected by bandwidth capacity
    else if (packet.type === PACKET_TYPES.TCP_SYN) {
      const activeWeight = this.getActiveConnectionWeight();
      if (activeWeight + weight <= CONSTANTS.MAX_ACTIVE_CONNECTIONS) {
        this.activeConnections.push({ ttl: CONSTANTS.SYN_CONNECTION_TTL_SECONDS, weight });
        this.cpuLoad = clamp(this.cpuLoad + weight * LOAD_PER_PACKET, 0, 100);
      }
    }

    this.updateStatus();
    return { allowed: true, reason: 'ACCEPTED' };
  }

  update(dtSeconds = 1) {
    this.bandwidthUsage = clamp(
      this.bandwidthUsage - CONSTANTS.BANDWIDTH_DECAY_RATE * dtSeconds,
      0,
      100
    );
    this.cpuLoad = clamp(this.cpuLoad - CONSTANTS.CPU_DECAY_RATE * dtSeconds, 0, 100);

    const remaining = [];
    for (const conn of this.activeConnections) {
      const ttl = conn.ttl - dtSeconds;
      if (ttl > 0) {
        remaining.push({ ...conn, ttl });
      } else {
        this.cpuLoad = clamp(this.cpuLoad - conn.weight * LOAD_PER_PACKET, 0, 100);
      }
    }
    this.activeConnections = remaining;

    // v1.1: Age out old dropped packet events for happiness recovery
    const remainingDrops = [];
    for (const drop of this.droppedPacketEvents) {
      const ttl = drop.ttl - dtSeconds;
      if (ttl > 0) {
        remainingDrops.push({ ttl, weight: drop.weight });
      }
    }
    this.droppedPacketEvents = remainingDrops;

    this.updateStatus();
    this.updateHappiness();
  }

  // v1.1: Reset method to restore initial state
  reset() {
    this.bandwidthUsage = 0;
    this.cpuLoad = 0;
    this.activeConnections = [];
    this.happinessScore = 100;
    this.droppedPackets = 0;
    this.droppedPacketEvents = [];
    this.status = SERVER_STATUS.ONLINE;
    this.bandwidthCapacityMultiplier = 1;
  }
  
  // v1.3: Record a dropped packet with TTL for happiness recovery (weighted)
  recordDroppedPacket(weight = 1) {
    this.droppedPacketEvents.push({ ttl: DROPPED_PACKET_TTL_SECONDS, weight });
    this.updateHappiness();
  }

  getActiveConnectionWeight() {
    return this.activeConnections.reduce((sum, conn) => sum + conn.weight, 0);
  }
}
