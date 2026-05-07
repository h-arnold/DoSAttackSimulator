import { ATTACK_TYPES, CONSTANTS, PROTOCOLS } from '../constants.js';
import GenuineTraffic from '../models/GenuineTraffic.js';
import Attacker from '../models/Attacker.js';
import Server from '../models/Server.js';
import Firewall from '../models/Firewall.js';
import { calculateEffectiveCapacity } from '../models/capacityConfig.js';
import { decideTopologyRoute, projectTopologyAddressing } from '../models/topologyConfig.js';
import defaultSimulationState from '../state/defaultSimulationState.js';
import SimulationStore from '../state/SimulationStore.js';
import MetricsCollector from './MetricsCollector.js';
import ViewModelProjector from './ViewModelProjector.js';

class StoreBackedSetView {
  constructor(getValues) {
    this.getValues = getValues;
  }

  get size() {
    return this.getValues().length;
  }

  has(value) {
    return this.getValues().includes(value);
  }

  add(value) {
    const values = this.getValues();
    if (!values.includes(value)) {
      values.push(value);
    }
    return this;
  }

  delete(value) {
    const values = this.getValues();
    const index = values.indexOf(value);
    if (index >= 0) {
      values.splice(index, 1);
      return true;
    }
    return false;
  }

  clear() {
    this.getValues().length = 0;
  }

  values() {
    return this.getValues()[Symbol.iterator]();
  }

  forEach(callback, thisArg) {
    this.getValues().forEach((value) => callback.call(thisArg, value, value, this));
  }

  [Symbol.iterator]() {
    return this.values();
  }
}

function getWeightedTotal(entries) {
  return entries.reduce((sum, entry) => sum + (entry.weight || 0), 0);
}

export const ORCHESTRATOR_COMMAND_TYPES = Object.freeze({
  START_SIMULATION: 'START_SIMULATION',
  STOP_SIMULATION: 'STOP_SIMULATION',
  START_ATTACK: 'START_ATTACK',
  STOP_ATTACK: 'STOP_ATTACK',
  RESET_SIMULATION: 'RESET_SIMULATION',
  SET_ATTACK_CONFIG: 'SET_ATTACK_CONFIG',
  SET_FIREWALL_PROTOCOL_BLOCK: 'SET_FIREWALL_PROTOCOL_BLOCK',
  SET_FIREWALL_SUBNET_BLOCK: 'SET_FIREWALL_SUBNET_BLOCK',
  SET_FIREWALL_RATE_LIMIT_ENABLED: 'SET_FIREWALL_RATE_LIMIT_ENABLED',
  SET_FIREWALL_RATE_LIMIT_THRESHOLD: 'SET_FIREWALL_RATE_LIMIT_THRESHOLD',
  SET_FIREWALL_RATE_LIMIT_SCOPE: 'SET_FIREWALL_RATE_LIMIT_SCOPE',
  SET_REVERSE_PROXY_ENABLED: 'SET_REVERSE_PROXY_ENABLED',
  SET_LOAD_BALANCING_ENABLED: 'SET_LOAD_BALANCING_ENABLED',
  SET_SERVER_CAPACITY_MULTIPLIER: 'SET_SERVER_CAPACITY_MULTIPLIER',
  SET_PROXY_BADGE_MODE: 'SET_PROXY_BADGE_MODE'
});

const VALID_ATTACK_TYPES = new Set(Object.values(ATTACK_TYPES));
const VALID_PROTOCOLS = new Set(Object.values(PROTOCOLS));
const VALID_RATE_LIMIT_SCOPES = new Set(['ALL', ...Object.values(PROTOCOLS)]);

export default class Orchestrator {
  constructor() {
    this.store = new SimulationStore();
    this.viewModelProjector = new ViewModelProjector();
    this.analyzerLogBudget = 0;
    this.bindCompatibilityAccessors();
    this.initializeModels();
  }

  reset() {
    this.store.replaceState(defaultSimulationState());
    this.analyzerLogBudget = 0;
    this.initializeModels();
  }

  dispatch(command) {
    this.assertValidCommandEnvelope(command);

    switch (command.type) {
      case ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION:
        this.assertNoPayload(command, ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION);
        if (this.isSimulationRunning) {
          throw new Error('Invalid transition: simulation is already running.');
        }
        this.isSimulationRunning = true;
        return;
      case ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION:
        this.assertNoPayload(command, ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION);
        if (!this.isSimulationRunning) {
          throw new Error('Invalid transition: simulation is already stopped.');
        }
        this.isSimulationRunning = false;
        return;
      case ORCHESTRATOR_COMMAND_TYPES.START_ATTACK:
        this.assertNoPayload(command, ORCHESTRATOR_COMMAND_TYPES.START_ATTACK);
        if (this.attacker.isAttacking) {
          throw new Error('Invalid transition: attack is already running.');
        }
        this.attacker.generateBotnetRanges();
        this.attacker.isAttacking = true;
        return;
      case ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK:
        this.assertNoPayload(command, ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK);
        if (!this.attacker.isAttacking) {
          throw new Error('Invalid transition: attack is already stopped.');
        }
        this.attacker.isAttacking = false;
        return;
      case ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION:
        this.assertNoPayload(command, ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION);
        this.reset();
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG:
        this.applySetAttackConfig(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK:
        this.applySetFirewallProtocolBlock(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_SUBNET_BLOCK:
        this.applySetFirewallSubnetBlock(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED:
        this.applySetFirewallRateLimitEnabled(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD:
        this.applySetFirewallRateLimitThreshold(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE:
        this.applySetFirewallRateLimitScope(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED:
        this.applySetReverseProxyEnabled(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED:
        this.applySetLoadBalancingEnabled(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER:
        this.applySetServerCapacityMultiplier(command);
        return;
      case ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE:
        this.applySetProxyBadgeMode(command);
        return;
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  assertValidCommandEnvelope(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.type !== 'string') {
      throw new TypeError('Command must be an object with a string type.');
    }
  }

  assertNoPayload(command, commandType) {
    if (Object.prototype.hasOwnProperty.call(command, 'payload')) {
      throw new Error(`${commandType} does not accept a payload.`);
    }
  }

  assertObjectPayload(command, commandType) {
    const { payload } = command;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`${commandType} requires an object payload.`);
    }
    return payload;
  }

  applySetAttackConfig(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG);
    const allowedFields = ['deviceCount', 'attackType', 'bandwidthMultiplier', 'targetIP'];
    const providedFields = Object.keys(payload);

    if (!providedFields.length || providedFields.some((field) => !allowedFields.includes(field))) {
      throw new Error('SET_ATTACK_CONFIG payload must include at least one valid attack config field.');
    }

    const nextConfig = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'deviceCount')) {
      if (!Number.isInteger(payload.deviceCount)
        || payload.deviceCount < CONSTANTS.DEVICE_COUNT_MIN
        || payload.deviceCount > CONSTANTS.DEVICE_COUNT_MAX) {
        throw new Error('SET_ATTACK_CONFIG.deviceCount must be an integer within allowed range.');
      }
      nextConfig.deviceCount = payload.deviceCount;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'attackType')) {
      if (!VALID_ATTACK_TYPES.has(payload.attackType)) {
        throw new Error('SET_ATTACK_CONFIG.attackType must be one of the supported attack types.');
      }
      nextConfig.attackType = payload.attackType;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'bandwidthMultiplier')) {
      if (typeof payload.bandwidthMultiplier !== 'number'
        || Number.isNaN(payload.bandwidthMultiplier)
        || payload.bandwidthMultiplier < CONSTANTS.BANDWIDTH_MULTIPLIER_MIN
        || payload.bandwidthMultiplier > CONSTANTS.BANDWIDTH_MULTIPLIER_MAX) {
        throw new Error('SET_ATTACK_CONFIG.bandwidthMultiplier must be a number within allowed range.');
      }
      nextConfig.bandwidthMultiplier = payload.bandwidthMultiplier;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'targetIP')) {
      if (typeof payload.targetIP !== 'string' || !payload.targetIP.trim()) {
        throw new Error('SET_ATTACK_CONFIG.targetIP must be a non-empty string.');
      }
      nextConfig.targetIP = payload.targetIP.trim();
    }

    this.store.updateState({
      config: {
        attack: nextConfig
      }
    });
  }

  applySetFirewallProtocolBlock(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK);
    const { protocol, blocked } = payload;

    if (!VALID_PROTOCOLS.has(protocol)) {
      throw new Error('SET_FIREWALL_PROTOCOL_BLOCK requires a valid protocol.');
    }
    if (typeof blocked !== 'boolean') {
      throw new Error('SET_FIREWALL_PROTOCOL_BLOCK requires a boolean blocked flag.');
    }

    if (blocked) {
      this.firewall.blockedProtocols.add(protocol);
      return;
    }
    this.firewall.blockedProtocols.delete(protocol);
  }

  applySetFirewallSubnetBlock(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_SUBNET_BLOCK);
    const { subnet, blocked } = payload;

    if (typeof subnet !== 'string' || !subnet.trim()) {
      throw new Error('SET_FIREWALL_SUBNET_BLOCK requires a non-empty subnet string.');
    }
    if (typeof blocked !== 'boolean') {
      throw new Error('SET_FIREWALL_SUBNET_BLOCK requires a boolean blocked flag.');
    }

    const normalizedSubnet = subnet.trim();
    if (blocked) {
      this.firewall.blockedIPs.add(normalizedSubnet);
      return;
    }
    this.firewall.blockedIPs.delete(normalizedSubnet);
  }

  applySetFirewallRateLimitEnabled(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED);
    const { enabled } = payload;

    if (typeof enabled !== 'boolean') {
      throw new Error('SET_FIREWALL_RATE_LIMIT_ENABLED requires a boolean enabled flag.');
    }

    this.firewall.rateLimitEnabled = enabled;
  }

  applySetFirewallRateLimitThreshold(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD);
    const { threshold } = payload;

    if (!Number.isInteger(threshold)
      || threshold < CONSTANTS.RATE_LIMIT_MIN
      || threshold > CONSTANTS.RATE_LIMIT_MAX) {
      throw new Error('SET_FIREWALL_RATE_LIMIT_THRESHOLD requires an integer threshold within allowed range.');
    }

    this.firewall.rateLimitThreshold = threshold;
  }

  applySetFirewallRateLimitScope(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE);
    const { scope } = payload;

    if (typeof scope !== 'string' || !VALID_RATE_LIMIT_SCOPES.has(scope)) {
      throw new Error('SET_FIREWALL_RATE_LIMIT_SCOPE requires a valid scope.');
    }

    this.firewall.rateLimitScope = scope;
  }

  applySetReverseProxyEnabled(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED);
    const { enabled } = payload;

    if (typeof enabled !== 'boolean') {
      throw new Error('SET_REVERSE_PROXY_ENABLED requires a boolean enabled flag.');
    }

    const topology = this.getTopologyConfig();
    const projection = projectTopologyAddressing({ ...topology, reverseProxyEnabled: enabled });

    this.writeStatePath(['config', 'defense', 'topology', 'reverseProxyEnabled'], enabled);
    this.writeStatePath(['config', 'defense', 'topology', 'publicIP'], projection.publicEntryIP);
  }

  applySetLoadBalancingEnabled(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED);
    const { enabled } = payload;

    if (typeof enabled !== 'boolean') {
      throw new Error('SET_LOAD_BALANCING_ENABLED requires a boolean enabled flag.');
    }

    this.writeStatePath(['config', 'defense', 'capacity', 'loadBalancingEnabled'], enabled);
    this.writeStatePath(['config', 'defense', 'capacity', 'loadBalancingMultiplier'], enabled ? 2 : 1);
  }

  applySetServerCapacityMultiplier(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER);
    const { multiplier } = payload;

    if (typeof multiplier !== 'number'
      || Number.isNaN(multiplier)
      || multiplier < 0.5
      || multiplier > 5) {
      throw new Error('SET_SERVER_CAPACITY_MULTIPLIER requires a numeric multiplier within allowed range.');
    }

    this.writeStatePath(['config', 'defense', 'capacity', 'serverCapacityMultiplier'], multiplier);
  }

  applySetProxyBadgeMode(command) {
    const payload = this.assertObjectPayload(command, ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE);
    const { mode } = payload;

    if (mode !== 'ip' && mode !== 'count') {
      throw new Error('SET_PROXY_BADGE_MODE requires mode to be "ip" or "count".');
    }

    this.proxyBadgeMode = mode;
  }

  update(dt) {
    // Reset analyzer log budget each second
    this.analyzerLogBudget += dt * CONSTANTS.UI_ANALYZER_LOG_MAX_PER_SECOND;
    if (this.analyzerLogBudget > CONSTANTS.UI_ANALYZER_LOG_MAX_PER_SECOND) {
      this.analyzerLogBudget = CONSTANTS.UI_ANALYZER_LOG_MAX_PER_SECOND;
    }

    this.syncGenuineTrafficUsers();
    const frameConfig = {
      topology: this.getTopologyConfig(),
      firewallPolicy: this.getFirewallPolicyConfig(),
      capacity: this.getCapacityConfig()
    };
    const topologyProjection = projectTopologyAddressing(frameConfig.topology);

    // Server decay
    this.server.update(dt);

    // Spawn genuine traffic if simulation is running
    if (this.isSimulationRunning) {
      const genuinePackets = this.genuineTraffic.spawnPackets(dt);
      genuinePackets.forEach((packet) => {
        packet.destinationIP = topologyProjection.publicEntryIP;
      });
      this.addParticles(genuinePackets, frameConfig.topology);
    }

    // Spawn attack traffic if attacking
    if (this.attacker.isAttacking) {
      const { packets: attackPackets } = this.attacker.spawnPackets(dt);
      // v1.2: Set destination IP to attacker's target IP
      attackPackets.forEach((packet) => {
        packet.destinationIP = this.attacker.targetIP;
      });
      this.addParticles(attackPackets, frameConfig.topology);
    }

    // Update particle positions and process arrivals
    this.updateParticles(dt, frameConfig);
  }

  addParticles(newPackets, topology = this.getTopologyConfig()) {
    for (const packet of newPackets) {
      if (this.particles.length >= CONSTANTS.MAX_ACTIVE_PARTICLES) {
        break;
      }
      // Initialize particle position based on cluster
      this.initializeParticlePosition(packet, topology);
      this.particles.push(packet);
    }
  }

  initializeParticlePosition(packet, topology = this.getTopologyConfig()) {
    const centerY = CONSTANTS.CANVAS_HEIGHT / 2;
    const leftX = 80;
    const rightX = CONSTANTS.CANVAS_WIDTH - 80;
    const topologyProjection = projectTopologyAddressing(topology);
    
    // Determine spawn cluster based on packet type
    let spawnX, spawnY, destX, destY;
    
    if (packet.isMalicious) {
      // Attacker cluster (top-left)
      spawnX = leftX;
      spawnY = centerY - 60;
    } else {
      // Legitimate user cluster (bottom-left)
      spawnX = leftX;
      spawnY = centerY + 60;
    }
    
    // Add cluster scatter for multi-device visualization
    const clusterRadius = 15;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * clusterRadius;
    spawnX += Math.cos(angle) * distance;
    spawnY += Math.sin(angle) * distance;
    
    // Determine destination
    if (topologyProjection.reverseProxyEnabled) {
      // Destination is proxy node when proxy enabled
      const pipeStartX = (CONSTANTS.CANVAS_WIDTH - CONSTANTS.PIPE_WIDTH) / 2;
      destX = pipeStartX + (CONSTANTS.PIPE_WIDTH * 0.85);
      destY = centerY;
    } else {
      // Destination is server (right side)
      destX = rightX;
      destY = centerY;
    }
    
    // Set position
    packet.x = spawnX;
    packet.y = spawnY;
    
    // Compute velocity vector
    const dx = destX - spawnX;
    const dy = destY - spawnY;
    const distanceTotal = Math.sqrt(dx * dx + dy * dy);
    
    if (distanceTotal > 0) {
      const speed = packet.speed || CONSTANTS.SPEED_MALICIOUS;
      packet.vx = (dx / distanceTotal) * speed;
      packet.vy = (dy / distanceTotal) * speed;
    } else {
      packet.vx = packet.speed || CONSTANTS.SPEED_MALICIOUS;
      packet.vy = 0;
    }
  }

  updateParticles(dt, frameConfig = {
    topology: this.getTopologyConfig(),
    firewallPolicy: this.getFirewallPolicyConfig(),
    capacity: this.getCapacityConfig()
  }) {
    const remaining = [];
    const pipeEndX = CONSTANTS.CANVAS_WIDTH;
    const pipeStartX = (CONSTANTS.CANVAS_WIDTH - CONSTANTS.PIPE_WIDTH) / 2;
    const proxyX = pipeStartX + (CONSTANTS.PIPE_WIDTH * 0.85);
    const rightX = CONSTANTS.CANVAS_WIDTH - 80;
    const topologyProjection = projectTopologyAddressing(frameConfig.topology);

    for (const particle of this.particles) {
      // Use velocity vector if available, otherwise fall back to horizontal movement
      if (particle.vx !== undefined && particle.vy !== undefined) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        
        // Update destination after passing proxy
        if (topologyProjection.reverseProxyEnabled && particle.hasPassedProxy && !particle.destinationUpdated) {
          particle.destinationUpdated = true;
          const centerY = CONSTANTS.CANVAS_HEIGHT / 2;
          const dx = rightX - particle.x;
          const dy = centerY - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 0) {
            const speed = particle.speed || CONSTANTS.SPEED_MALICIOUS;
            particle.vx = (dx / distance) * speed;
            particle.vy = (dy / distance) * speed;
          }
        }
      } else {
        particle.x += particle.speed * dt;
      }

      if (this.processProxyCheckpoint(particle, proxyX, frameConfig)) {
        continue;
      }

      if (this.processServerEdge(particle, rightX, frameConfig)) {
        continue;
      }

      if (this.handleCollision(particle, remaining)) {
        continue;
      }

      remaining.push(particle);
    }

    this.particles = remaining;
  }

  processProxyCheckpoint(particle, proxyX, frameConfig = {
    topology: this.getTopologyConfig(),
    firewallPolicy: this.getFirewallPolicyConfig(),
    capacity: this.getCapacityConfig()
  }) {
    const projection = projectTopologyAddressing(frameConfig.topology);
    if (!projection.reverseProxyEnabled || particle.hasPassedProxy || particle.x < proxyX) {
      return false;
    }

    particle.hasPassedProxy = true;
    this.runInspection(particle, frameConfig);
    return particle.blockedByFirewall || particle.missedTarget;
  }

  processServerEdge(particle, pipeEndX, frameConfig = {
    topology: this.getTopologyConfig(),
    firewallPolicy: this.getFirewallPolicyConfig(),
    capacity: this.getCapacityConfig()
  }) {
    if (particle.x < pipeEndX) {
      return false;
    }

    if (!projectTopologyAddressing(frameConfig.topology).reverseProxyEnabled) {
      this.runInspection(particle, frameConfig);
    }

    if (!particle.blockedByFirewall && !particle.missedTarget && !particle.droppedByCollision) {
      this.processServerArrival(particle, frameConfig);
    }

    return true;
  }

  handleCollision(particle, remaining) {
    const shouldDropLegit = !particle.isMalicious
      && !particle.blockedByFirewall
      && !particle.missedTarget
      && this.server.bandwidthUsage > CONSTANTS.BANDWIDTH_COLLISION_THRESHOLD;

    if (shouldDropLegit) {
      particle.droppedByCollision = true;
      this.server.recordDroppedPacket(particle.trafficWeight || 1);
      this.recordOutcome('dropped', particle);
      this.logAnalyzerEvent({
        ip: particle.sourceIP,
        type: particle.type,
        action: 'DROPPED',
        reason: 'COLLISION',
        weight: particle.trafficWeight
      });
      remaining.push(particle);
      return true;
    }

    return particle.droppedByCollision;
  }

  // Exposed for tests: process a single packet arrival through proxy + server path
  processArrival(particle) {
    const frameConfig = {
      topology: this.getTopologyConfig(),
      firewallPolicy: this.getFirewallPolicyConfig(),
      capacity: this.getCapacityConfig()
    };
    // If proxy was never crossed (e.g., direct invocation), flag it to reuse proxy logic
    if (projectTopologyAddressing(frameConfig.topology).reverseProxyEnabled && !particle.hasPassedProxy) {
      particle.hasPassedProxy = true;
    }

    this.runInspection(particle, frameConfig);

    if (!particle.blockedByFirewall && !particle.missedTarget && !particle.droppedByCollision) {
      this.processServerArrival(particle, frameConfig);
    }
  }

  runInspection(particle, frameConfig = {
    topology: this.getTopologyConfig(),
    firewallPolicy: this.getFirewallPolicyConfig(),
    capacity: this.getCapacityConfig()
  }) {
    const route = decideTopologyRoute({
      topology: frameConfig.topology,
      sourceIP: particle.sourceIP,
      clientIP: particle.clientIP
    });

    if (particle.destinationIP !== route.initialDestinationIP) {
      particle.missedTarget = true;
      this.recordOutcome('missed', particle);
      this.logAnalyzerEvent({
        ip: particle.sourceIP,
        type: particle.type,
        action: 'MISSED',
        reason: 'WRONG_IP',
        weight: particle.trafficWeight
      });
      return;
    }

    if (route.routeMode === 'REVERSE_PROXY') {
      if (!particle.clientIP) {
        particle.clientIP = route.clientIP;
      }
      particle.sourceIP = route.originSourceIP;
      particle.isForwarded = true;
    }
    
    // Firewall inspection
    const firewallResult = this.firewall.inspect(
      particle,
      Date.now() / 1000,
      frameConfig.firewallPolicy
    );
    
    if (!firewallResult.allowed) {
      // Firewall blocked packet
      particle.blockedByFirewall = true;
      this.recordOutcome('blocked', particle);
      this.logAnalyzerEvent({
        ip: particle.clientIP || particle.sourceIP,
        type: particle.type,
        action: 'BLOCKED',
        reason: firewallResult.reason,
        weight: particle.trafficWeight
      });
      
      // If legitimate packet was blocked, count as dropped
      if (!particle.isMalicious) {
        this.server.recordDroppedPacket(particle.trafficWeight || 1);
      }
    }
  }

  processServerArrival(particle, frameConfig = {
    topology: this.getTopologyConfig(),
    firewallPolicy: this.getFirewallPolicyConfig(),
    capacity: this.getCapacityConfig()
  }) {
    if (this.server.status === 'CRASHED') {
      if (!particle.isMalicious) {
        this.server.recordDroppedPacket(particle.trafficWeight || 1);
      }
      this.recordOutcome('dropped', particle);
      this.logAnalyzerEvent({
        ip: particle.clientIP || particle.sourceIP,
        type: particle.type,
        action: 'DROPPED',
        reason: 'SERVER_CRASHED',
        weight: particle.trafficWeight
      });
    } else {
      const serverResult = this.server.receive(particle, { capacity: frameConfig.capacity });
      const action = serverResult.allowed ? 'ALLOWED' : 'DROPPED';
      this.recordOutcome(serverResult.allowed ? 'allowed' : 'dropped', particle);

      this.logAnalyzerEvent({
        ip: particle.clientIP || particle.sourceIP,
        type: particle.type,
        action,
        reason: serverResult.reason,
        weight: particle.trafficWeight
      });
    }
  }

  logAnalyzerEvent(event) {
    if (this.analyzerLogBudget < 1) return;

    this.analyzerLogs.unshift({
      ...event,
      timestamp: Date.now()
    });
    this.analyzerLogBudget -= 1;

    if (this.analyzerLogs.length > CONSTANTS.UI_LOG_MAX_ENTRIES) {
      this.analyzerLogs = this.analyzerLogs.slice(0, CONSTANTS.UI_LOG_MAX_ENTRIES);
    }
  }

  getState() {
    const state = this.store.state;
    const aggregates = this.computeAggregates(state);
    return this.viewModelProjector.project(state, { aggregates });
  }

  computeAggregates(state = this.store.state) {
    const aggregates = {
      activeWeighted: 0,
      activeLegitWeighted: 0,
      activeMaliciousWeighted: 0,
      activeByType: {},
      halfOpenWeighted: getWeightedTotal(state.runtime.server.activeConnections)
    };

    for (const particle of state.runtime.traffic.particles) {
      const weight = particle.trafficWeight || 1;
      aggregates.activeWeighted += weight;
      const typeKey = particle.type;
      aggregates.activeByType[typeKey] = (aggregates.activeByType[typeKey] || 0) + weight;
      if (particle.isMalicious) {
        aggregates.activeMaliciousWeighted += weight;
      } else {
        aggregates.activeLegitWeighted += weight;
      }
    }

    return aggregates;
  }

  setProxyBadgeMode(mode) {
    this.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: mode === 'count' ? 'count' : 'ip' }
    });
  }

  bindCompatibilityAccessors() {
    this.bindStoreBackedProperty(this, 'isSimulationRunning', ['runtime', 'control', 'simulationRunning'], Boolean);
    this.bindStoreBackedProperty(this, 'proxyBadgeMode', ['config', 'display', 'proxyBadgeMode'], (value) => value === 'count' ? 'count' : 'ip');
    this.bindStoreBackedProperty(this, 'particles', ['runtime', 'traffic', 'particles'], (value) => Array.isArray(value) ? value : []);
    this.bindStoreBackedProperty(this, 'analyzerLogs', ['runtime', 'metrics', 'analyzerSample', 'logs'], (value) => Array.isArray(value) ? value : []);
  }

  initializeModels() {
    this.genuineTraffic = new GenuineTraffic();
    this.attacker = new Attacker();
    this.server = new Server();
    this.firewall = new Firewall();
    this.metricsCollector = new MetricsCollector({
      windowMs: this.readStatePath(['runtime', 'metrics', 'rollingWindow', 'windowMs'])
    });

    this.bindGenuineTraffic();
    this.bindAttacker();
    this.bindServer();
    this.bindFirewall();
    this.syncMetricsSnapshot(0);
    this.syncGenuineTrafficUsers();
  }

  getPacketWeight(particle) {
    return Number.isFinite(particle?.trafficWeight) ? particle.trafficWeight : 1;
  }

  recordOutcome(outcome, particle, timestampMs = Date.now()) {
    this.metricsCollector.recordOutcome(outcome, {
      weight: this.getPacketWeight(particle),
      timestampMs
    });
    this.syncMetricsSnapshot(timestampMs);
  }

  syncMetricsSnapshot(timestampMs = Date.now()) {
    const snapshot = this.metricsCollector.getSnapshot({ timestampMs });
    const existingMetrics = this.readStatePath(['runtime', 'metrics']);
    const existingAnalyzerSample = existingMetrics.analyzerSample || {};
    const existingLogs = Array.isArray(existingAnalyzerSample.logs)
      ? existingAnalyzerSample.logs.map((entry) => ({ ...entry }))
      : [];

    this.writeStatePath(['runtime', 'metrics'], {
      totals: snapshot.totals,
      rollingWindow: snapshot.rollingWindow,
      analyzerSample: {
        logs: existingLogs,
        visibleCount: existingAnalyzerSample.visibleCount || 0,
        droppedByBudgetCount: existingAnalyzerSample.droppedByBudgetCount || 0
      },
      analyzerDroppedCount: existingMetrics.analyzerDroppedCount || 0
    });
  }

  bindGenuineTraffic() {
    this.bindStoreBackedProperty(this.genuineTraffic, 'userCount', ['config', 'legitimateTraffic', 'userCount']);
    this.bindStoreBackedProperty(this.genuineTraffic, 'packetsPerUserPerSec', ['config', 'legitimateTraffic', 'packetsPerUserPerSec']);
  }

  bindAttacker() {
    this.bindStoreBackedProperty(this.attacker, 'deviceCount', ['config', 'attack', 'deviceCount']);
    this.bindStoreBackedProperty(this.attacker, 'attackType', ['config', 'attack', 'attackType']);
    this.bindStoreBackedProperty(this.attacker, 'targetIP', ['config', 'attack', 'targetIP']);
    this.bindStoreBackedProperty(this.attacker, 'bandwidthMultiplier', ['config', 'attack', 'bandwidthMultiplier']);
    this.bindStoreBackedProperty(this.attacker, 'isAttacking', ['runtime', 'control', 'attackRunning'], Boolean);
    this.bindStoreBackedProperty(this.attacker, 'botnetRanges', ['runtime', 'traffic', 'botnetRanges'], (value) => Array.isArray(value) ? value : []);
  }

  bindServer() {
    this.bindStoreBackedProperty(this.server, 'bandwidthUsage', ['runtime', 'server', 'bandwidthUsage']);
    this.bindStoreBackedProperty(this.server, 'cpuLoad', ['runtime', 'server', 'cpuLoad']);
    this.bindStoreBackedProperty(this.server, 'status', ['runtime', 'server', 'status']);
    this.bindStoreBackedProperty(this.server, 'activeConnections', ['runtime', 'server', 'activeConnections'], (value) => Array.isArray(value) ? value : []);
    this.bindStoreBackedProperty(this.server, 'droppedPacketEvents', ['runtime', 'server', 'droppedPacketEvents'], (value) => Array.isArray(value) ? value : []);
    this.bindStoreBackedProperty(this.server, 'happinessScore', ['runtime', 'server', 'happinessScore']);
    this.bindStoreBackedProperty(this.server, 'bandwidthCapacityMultiplier', ['config', 'defense', 'capacity', 'serverCapacityMultiplier']);
    Object.defineProperty(this.server, 'droppedPackets', {
      configurable: true,
      enumerable: true,
      get: () => getWeightedTotal(this.readStatePath(['runtime', 'server', 'droppedPacketEvents'])),
      set: () => {}
    });
  }

  bindFirewall() {
    this.firewall.blockedProtocols = this.createStoreBackedSet(['config', 'defense', 'firewall', 'blockedProtocols']);
    this.firewall.blockedIPs = this.createStoreBackedSet(['config', 'defense', 'firewall', 'blockedSubnets']);
    this.firewall.detectedSubnets = this.createStoreBackedSet(['runtime', 'traffic', 'detectedSubnets']);
    this.bindStoreBackedProperty(this.firewall, 'rateLimitThreshold', ['config', 'defense', 'firewall', 'rateLimit', 'threshold']);
    this.bindStoreBackedProperty(this.firewall, 'rateLimitScope', ['config', 'defense', 'firewall', 'rateLimit', 'scope']);
    this.bindStoreBackedProperty(this.firewall, 'rateLimitEnabled', ['config', 'defense', 'firewall', 'rateLimit', 'enabled'], Boolean);
  }

  syncGenuineTrafficUsers() {
    if (this.genuineTraffic.userIPs.length === this.genuineTraffic.userCount) {
      return;
    }

    this.genuineTraffic.userIPs = Array.from(
      { length: this.genuineTraffic.userCount },
      (_, index) => `${this.genuineTraffic.ipPrefix}.${index + 1}`
    );
  }

  createStoreBackedSet(path) {
    return new StoreBackedSetView(() => this.readStatePath(path));
  }

  getTopologyConfig() {
    return this.readStatePath(['config', 'defense', 'topology']);
  }

  getFirewallPolicyConfig() {
    return this.readStatePath(['config', 'defense', 'firewall']);
  }

  getCapacityConfig() {
    const capacity = this.readStatePath(['config', 'defense', 'capacity']);
    return {
      ...capacity,
      ...calculateEffectiveCapacity(capacity)
    };
  }

  bindStoreBackedProperty(target, property, path, normalize = (value) => value) {
    Object.defineProperty(target, property, {
      configurable: true,
      enumerable: true,
      get: () => this.readStatePath(path),
      set: (value) => {
        this.writeStatePath(path, normalize(value));
      }
    });
  }

  readStatePath(path) {
    return path.reduce((branch, key) => branch[key], this.store.state);
  }

  writeStatePath(path, value) {
    const branch = path.slice(0, -1).reduce((current, key) => current[key], this.store.state);
    branch[path[path.length - 1]] = value;
  }
}
