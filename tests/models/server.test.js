import { describe, it, expect } from 'vitest';
import Server from '../../js/models/Server.js';
import { PACKET_TYPES, SERVER_STATUS, CONSTANTS } from '../../js/constants.js';

describe('Server', () => {
  it('applies explicit capacity input for volume traffic load', () => {
    const server = new Server();

    server.receive(
      { type: PACKET_TYPES.UDP, trafficWeight: 4 },
      {
        capacity: {
          serverCapacityMultiplier: 1,
          loadBalancingEnabled: true,
          loadBalancingMultiplier: 2
        }
      }
    );

    expect(server.bandwidthUsage).toBeCloseTo(2);
  });

  it('prefers explicit capacity input over legacy server-owned multiplier', () => {
    const server = new Server();

    server.bandwidthCapacityMultiplier = 5;
    server.receive(
      { type: PACKET_TYPES.UDP, trafficWeight: 4 },
      {
        capacity: {
          serverCapacityMultiplier: 1,
          loadBalancingEnabled: false,
          loadBalancingMultiplier: 1
        }
      }
    );

    expect(server.bandwidthUsage).toBeCloseTo(4);
  });

  it('volume packet increases bandwidth and decays with update', () => {
    const server = new Server();
    server.receive({ type: PACKET_TYPES.UDP, trafficWeight: 2 });
    expect(server.bandwidthUsage).toBeCloseTo(2);
    server.update(1);
    expect(server.bandwidthUsage).toBeCloseTo(0);
  });

  it('SYN adds connection, raises CPU, and TTL expiry reduces load', () => {
    const server = new Server();
    server.receive({ type: PACKET_TYPES.TCP_SYN, trafficWeight: 3 });
    expect(server.activeConnections.length).toBe(1);
    expect(server.cpuLoad).toBeCloseTo(3);
    server.update(CONSTANTS.SYN_CONNECTION_TTL_SECONDS);
    expect(server.activeConnections.length).toBe(0);
    expect(server.cpuLoad).toBeCloseTo(0);
  });

  it('status transitions: degraded at 95, crashed at 99, recovers when below 90', () => {
    const server = new Server();
    server.bandwidthUsage = 95;
    server.update(0);
    expect(server.status).toBe(SERVER_STATUS.DEGRADED);

    server.bandwidthUsage = 100;
    server.update(0);
    expect(server.status).toBe(SERVER_STATUS.CRASHED);

    server.bandwidthUsage = 85;
    server.update(0);
    expect(server.status).toBe(SERVER_STATUS.ONLINE);
  });

  it('drops HTTP_GET when crashed and happiness clamps accordingly', () => {
    const server = new Server();
    server.bandwidthUsage = 100;
    server.update(0);
    const result = server.receive({ type: PACKET_TYPES.HTTP_GET, trafficWeight: CONSTANTS.PACKET_VISUAL_SCALE });
    expect(result.allowed).toBe(false);
    expect(server.droppedPackets).toBe(CONSTANTS.PACKET_VISUAL_SCALE);
    expect(server.happinessScore).toBe(0);
  });

  // v1.1 Tests: Happiness Recovery
  it('happiness recovers gradually as dropped packets age out after server recovers', () => {
    const server = new Server();
    
    // Crash the server and drop 10 packets
    server.bandwidthUsage = 100;
    server.update(0);
    for (let i = 0; i < 10; i++) {
      server.receive({ type: PACKET_TYPES.HTTP_GET, trafficWeight: CONSTANTS.PACKET_VISUAL_SCALE });
    }
    expect(server.droppedPackets).toBe(10 * CONSTANTS.PACKET_VISUAL_SCALE);
    expect(server.happinessScore).toBe(0);
    const initialHappiness = server.happinessScore;
    
    // Server recovers (load drops)
    server.bandwidthUsage = 0;
    server.update(0);
    expect(server.status).toBe(SERVER_STATUS.ONLINE);
    
    // Happiness should start recovering as time passes and old drops age out
    // Simulate time passing (multiple update cycles) - need to wait for TTL to expire (10 seconds)
    for (let i = 0; i < 11; i++) {
      server.update(1);
    }
    
    // Happiness should have improved (dropped packets aged out)
    expect(server.happinessScore).toBeGreaterThan(initialHappiness);
    // Should be close to 100 now
    expect(server.happinessScore).toBeGreaterThanOrEqual(90);
  });

  it('happiness does not recover while packets continue to be dropped', () => {
    const server = new Server();
    
    // Drop some packets
    server.bandwidthUsage = 100;
    server.update(0);
    for (let i = 0; i < 5; i++) {
      server.receive({ type: PACKET_TYPES.HTTP_GET, trafficWeight: CONSTANTS.PACKET_VISUAL_SCALE });
    }
    const initialHappiness = server.happinessScore;
    
    // Server recovers
    server.bandwidthUsage = 0;
    server.update(0);
    
    // But continue to drop packets (e.g., from ongoing issues)
    server.recordDroppedPacket();
    server.update(1);
    
    // Happiness should not improve if packets are still being dropped
    expect(server.happinessScore).toBeLessThanOrEqual(initialHappiness);
  });

  it('happiness clamps to 0-100 range during recovery', () => {
    const server = new Server();
    
    // Drop many packets to drive happiness to 0
    server.bandwidthUsage = 100;
    server.update(0);
    for (let i = 0; i < 60; i++) {
      server.receive({ type: PACKET_TYPES.HTTP_GET, trafficWeight: CONSTANTS.PACKET_VISUAL_SCALE });
    }
    expect(server.happinessScore).toBe(0);
    
    // Server recovers and time passes
    server.bandwidthUsage = 0;
    for (let i = 0; i < 100; i++) {
      server.update(1);
    }
    
    // Happiness should recover but stay clamped at 100
    expect(server.happinessScore).toBeLessThanOrEqual(100);
    expect(server.happinessScore).toBeGreaterThan(0);
  });

  it('reset simulation restores happiness to 100', () => {
    const server = new Server();
    
    // Drop packets
    server.bandwidthUsage = 100;
    server.update(0);
    for (let i = 0; i < 10; i++) {
      server.receive({ type: PACKET_TYPES.HTTP_GET, trafficWeight: 1 });
    }
    expect(server.happinessScore).toBeLessThan(100);
    expect(server.droppedPacketEvents.length).toBeGreaterThan(0);
    
    // Reset should restore happiness and clear dropped packet events
    server.reset();
    expect(server.happinessScore).toBe(100);
    expect(server.droppedPackets).toBe(0);
    expect(server.droppedPacketEvents).toEqual([]);
  });

  it('does not own topology fields such as public/origin IP or reverse-proxy flag', () => {
    const server = new Server();

    expect(Object.prototype.hasOwnProperty.call(server, 'publicIP')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(server, 'originIP')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(server, 'reverseProxyEnabled')).toBe(false);
    expect(typeof server.setReverseProxyEnabled).toBe('undefined');
  });
});
