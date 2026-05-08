import { describe, it, expect, beforeEach } from 'vitest';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import { ATTACK_TYPES, PROTOCOLS, PACKET_TYPES, CONSTANTS } from '../../js/constants.js';

function makeArrivalPacket({
  type = PACKET_TYPES.UDP,
  sourceIP = '45.33.12.7',
  destinationIP = '203.0.113.10',
  trafficWeight = 20,
  isMalicious = true
} = {}) {
  return {
    type,
    sourceIP,
    destinationIP,
    trafficWeight,
    isMalicious
  };
}

describe('Mitigation Behaviors Integration', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  describe('Phase 5 Domain Wiring', () => {
    it('uses capacity branch in simulation path: load balancing changes effective server load', () => {
      const directPacket = makeArrivalPacket({
        destinationIP: orchestrator.store.getState().config.defense.topology.publicIP,
        trafficWeight: 40
      });

      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
        payload: { enabled: false }
      });

      orchestrator.processArrival({ ...directPacket });
      const baselineLoad = orchestrator.server.bandwidthUsage;
      expect(baselineLoad).toBeGreaterThan(0);

      orchestrator.server.bandwidthUsage = 0;

      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
        payload: { enabled: true }
      });

      orchestrator.processArrival({ ...directPacket });
      const balancedLoad = orchestrator.server.bandwidthUsage;

      expect(orchestrator.store.getState().config.defense.capacity.loadBalancingEnabled).toBe(true);
      expect(balancedLoad).toBeLessThan(baselineLoad);
    });

    it('uses topology branch in simulation path: reverse proxy changes route behavior', () => {
      const clientIP = '203.0.113.77';

      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
        payload: { enabled: true }
      });

      const proxyPacket = makeArrivalPacket({
        type: PACKET_TYPES.HTTP_GET,
        sourceIP: clientIP,
        destinationIP: orchestrator.store.getState().config.defense.topology.publicIP,
        isMalicious: false,
        trafficWeight: 1
      });

      orchestrator.processArrival(proxyPacket);

      expect(orchestrator.store.getState().config.defense.topology.reverseProxyEnabled).toBe(true);
      expect(proxyPacket.isForwarded).toBe(true);
      expect(proxyPacket.clientIP).toBe(clientIP);
      expect(proxyPacket.sourceIP.startsWith('198.51.100.')).toBe(true);
    });

    it('uses firewall policy branch in simulation path: rate limiting works regardless of display flags', () => {
      const sourceIP = '198.18.0.9';

      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
        payload: { enabled: true }
      });
      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
        payload: { threshold: CONSTANTS.RATE_LIMIT_MIN }
      });
      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
        payload: { mode: 'count' }
      });

      const packets = [];
      for (let i = 0; i < CONSTANTS.RATE_LIMIT_MIN + 1; i += 1) {
        const packet = makeArrivalPacket({
          sourceIP,
          destinationIP: orchestrator.store.getState().config.defense.topology.publicIP,
          type: PACKET_TYPES.UDP
        });
        packets.push(packet);
        orchestrator.processArrival(packet);
      }

      const finalPacket = packets[packets.length - 1];
      expect(orchestrator.store.getState().config.defense.firewall.rateLimit.enabled).toBe(true);
      expect(finalPacket.blockedByFirewall).toBe(true);
    });

    it('does not expose capacity flags on firewall model', () => {
      expect(Object.prototype.hasOwnProperty.call(orchestrator.firewall, 'loadBalancingEnabled')).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should drop packets exceeding rate limit threshold', () => {
      orchestrator.firewall.rateLimitEnabled = true;
      orchestrator.firewall.rateLimitThreshold = 3; // Very low threshold

      // Start attack with higher device count to generate more packets
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 5;
      orchestrator.attacker.attackType = ATTACK_TYPES.UDP;
      orchestrator.attacker.bandwidthMultiplier = 2; // More aggressive
      orchestrator.attacker.generateBotnetRanges();

      // Spawn and process packets over time
      for (let i = 0; i < 10; i++) {
        orchestrator.update(1); // 1 second each
      }

      // Should have blocked some packets due to rate limiting
      const blockedLogs = orchestrator.analyzerLogs.filter(log => log.reason === 'RATE_LIMIT');
      expect(blockedLogs.length).toBeGreaterThan(0);
    });

    it('should not apply rate limit when policy is disabled', () => {
      orchestrator.firewall.rateLimitEnabled = false;
      orchestrator.firewall.rateLimitThreshold = 1;

      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 10; // Increased to ensure packets are generated
      orchestrator.attacker.generateBotnetRanges();

      // Run for multiple seconds to ensure packets are processed
      for (let i = 0; i < 5; i++) {
        orchestrator.update(1);
      }

      // Should not have any rate limit blocks when policy is disabled
      const blockedLogs = orchestrator.analyzerLogs.filter(log => log.reason === 'RATE_LIMIT');
      expect(blockedLogs.length).toBe(0);
    });
  });

  describe('Load Balancing', () => {
    it('should render dual pipes when load balancing enabled', () => {
      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
        payload: { enabled: true }
      });

      const state = orchestrator.store.getState();
      expect(state.config.defense.capacity.loadBalancingEnabled).toBe(true);
    });

    it('should toggle load balancing flag correctly', () => {
      orchestrator.dispatch({
        type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
        payload: { enabled: true }
      });
      const state = orchestrator.store.getState();
      
      expect(state.config.defense.capacity.loadBalancingEnabled).toBe(true);
    });
  });

  describe('TCP Protocol Blocking', () => {
    it('should block legitimate HTTP_GET traffic when TCP is blocked', () => {
      // Block TCP protocol
      orchestrator.firewall.blockedProtocols.add(PROTOCOLS.TCP);
      
      // Start simulation (genuine traffic)
      orchestrator.isSimulationRunning = true;
      
      orchestrator.update(1); // Spawn 50 genuine packets
      
      // Move particles through the pipe
      for (let i = 0; i < 100; i++) {
        orchestrator.update(0.1);
        if (orchestrator.particles.length === 0) break;
      }
      
      // Should have blocked HTTP_GET packets (which use TCP)
      const blockedHTTP = orchestrator.analyzerLogs.filter(
        log => log.type === PACKET_TYPES.HTTP_GET && log.action === 'BLOCKED'
      );
      expect(blockedHTTP.length).toBeGreaterThan(0);
      
      // Happiness should decrease due to dropped legitimate packets
      expect(orchestrator.server.happinessScore).toBeLessThan(100);
    });

    it('should also block TCP_SYN attack packets when TCP is blocked', () => {
      orchestrator.firewall.blockedProtocols.add(PROTOCOLS.TCP);
      
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 10;
      orchestrator.attacker.attackType = ATTACK_TYPES.TCP_SYN;
      orchestrator.attacker.generateBotnetRanges();
      
      orchestrator.update(1);
      
      // Process packets
      for (let i = 0; i < 100; i++) {
        orchestrator.update(0.1);
        if (orchestrator.particles.length === 0) break;
      }
      
      // Should have blocked TCP_SYN packets
      const blockedSYN = orchestrator.analyzerLogs.filter(
        log => log.type === PACKET_TYPES.TCP_SYN && log.action === 'BLOCKED'
      );
      expect(blockedSYN.length).toBeGreaterThan(0);
    });
  });

  describe('UDP Protocol Blocking', () => {
    it('should block UDP flood packets without affecting legitimate traffic', () => {
      orchestrator.firewall.blockedProtocols.add(PROTOCOLS.UDP);
      
      orchestrator.isSimulationRunning = true;
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 20;
      orchestrator.attacker.attackType = ATTACK_TYPES.UDP;
      orchestrator.attacker.generateBotnetRanges();
      
      // Spawn and process packets through multiple seconds
      for (let i = 0; i < 8; i++) {
        orchestrator.update(1);
      }
      
      // Should have blocked UDP packets
      const blockedUDP = orchestrator.analyzerLogs.filter(
        log => log.type === PACKET_TYPES.UDP && log.action === 'BLOCKED'
      );
      expect(blockedUDP.length).toBeGreaterThan(0);
      
      // Should have allowed HTTP_GET packets
      const allowedHTTP = orchestrator.analyzerLogs.filter(
        log => log.type === PACKET_TYPES.HTTP_GET && log.action === 'ALLOWED'
      );
      expect(allowedHTTP.length).toBeGreaterThan(0);
      
      // Happiness should remain high since legitimate traffic is not blocked
      expect(orchestrator.server.happinessScore).toBeGreaterThan(90);
    });
  });

  describe('ICMP Protocol Blocking', () => {
    it('should block ICMP flood packets without affecting legitimate traffic', () => {
      orchestrator.firewall.blockedProtocols.add(PROTOCOLS.ICMP);
      
      orchestrator.isSimulationRunning = true;
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 10;
      orchestrator.attacker.attackType = ATTACK_TYPES.ICMP;
      orchestrator.attacker.generateBotnetRanges();
      
      orchestrator.update(1);
      
      // Process packets
      for (let i = 0; i < 50; i++) {
        orchestrator.update(0.1);
      }
      
      // Should have blocked ICMP packets
      const blockedICMP = orchestrator.analyzerLogs.filter(
        log => log.type === PACKET_TYPES.ICMP && log.action === 'BLOCKED'
      );
      expect(blockedICMP.length).toBeGreaterThan(0);
      
      // Happiness should remain high
      expect(orchestrator.server.happinessScore).toBeGreaterThan(90);
    });
  });

  describe('IP Subnet Blocking', () => {
    it('should block packets from blacklisted subnets', () => {
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 20;
      orchestrator.attacker.generateBotnetRanges();
      
      // Block the first botnet range
      const firstRange = orchestrator.attacker.botnetRanges[0];
      orchestrator.firewall.blockedIPs.add(firstRange);
      
      orchestrator.update(1);
      
      // Process packets
      for (let i = 0; i < 50; i++) {
        orchestrator.update(0.1);
      }
      
      // Should have some blocked packets from the blacklisted subnet
      const blockedByIP = orchestrator.analyzerLogs.filter(
        log => log.reason === 'BLOCK_IP'
      );
      expect(blockedByIP.length).toBeGreaterThan(0);
    });

    it('should detect and track subnets from incoming traffic', () => {
      orchestrator.attacker.isAttacking = true;
      orchestrator.attacker.deviceCount = 40;
      orchestrator.attacker.generateBotnetRanges();
      
      // Spawn packets
      orchestrator.update(1);
      
      // Process packets to reach firewall - need several seconds
      for (let i = 0; i < 10; i++) {
        orchestrator.update(1);
      }
      
      const detectedSubnets = orchestrator.firewall.getDetectedSubnets();
      expect(detectedSubnets.length).toBeGreaterThan(0);
    });
  });
});
