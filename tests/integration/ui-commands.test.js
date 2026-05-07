import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import EventHandlers from '../../js/ui/EventHandlers.js';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import UIManager from '../../js/ui/UIManager.js';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';
import { ATTACK_TYPES, PROTOCOLS } from '../../js/constants.js';

function buildDom() {
  return new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <button id="btn-start-simulation"></button>
        <button id="btn-stop-simulation" class="hidden"></button>
        <button id="btn-start-attack" disabled></button>
        <button id="btn-stop-attack" class="hidden"></button>
        <button id="btn-reset"></button>
        <input type="range" id="slider-device-count" value="1" />
        <select id="dropdown-attack-type">
          <option value="UDP">UDP</option>
          <option value="TCP_SYN">TCP SYN</option>
          <option value="ICMP">ICMP</option>
        </select>
        <input id="input-target-ip" value="203.0.113.10" />
        <input type="range" id="slider-attack-bandwidth" value="1.0" />
        <input type="range" id="slider-server-capacity" value="1.0" />
        <span id="server-capacity-value">1.0x</span>
        <input type="checkbox" id="check-block-tcp" />
        <input type="checkbox" id="check-block-udp" />
        <input type="checkbox" id="check-block-icmp" />
        <input type="checkbox" id="check-rate-limit" />
        <input type="range" id="slider-rate-limit" value="20" />
        <div id="rate-limit-controls" class="hidden"></div>
        <select id="dropdown-rate-limit-scope">
          <option value="ALL">ALL</option>
          <option value="UDP">UDP</option>
        </select>
        <input type="checkbox" id="check-reverse-proxy" />
        <input type="checkbox" id="check-load-balancing" />
        <select id="select-proxy-badge">
          <option value="ip">IP</option>
          <option value="count">Count</option>
        </select>
        <div id="ip-blacklist"></div>
        <div id="botnet-ranges"></div>
        <span id="rate-limit-value"></span>
        <span id="device-count-value"></span>
        <span id="attack-bandwidth-value"></span>
        <div id="user-logs"></div>
        <div id="analyzer-logs"></div>
      </body>
    </html>
  `);
}

describe('UI -> dispatch -> store integration (Section 2 / Phase 4)', () => {
  let dom;
  let orchestrator;
  let uiManager;
  let handlers;

  beforeEach(() => {
    dom = buildDom();
    globalThis.document = dom.window.document;

    orchestrator = new Orchestrator();
    uiManager = new UIManager();
    uiManager.updateAttackerInfo = vi.fn();
    uiManager.updateBotnetRanges = vi.fn();
    uiManager.updateAddressing = vi.fn();
    uiManager.updateServerIPs = vi.fn();
    uiManager.clearLogs = vi.fn();

    handlers = new EventHandlers(orchestrator, uiManager, null);
    handlers.attachAll();
  });

  it('start/stop simulation and attack actions dispatch and update runtime control state', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    dom.window.document.getElementById('btn-start-simulation').click();
    dom.window.document.getElementById('btn-start-attack').click();
    dom.window.document.getElementById('btn-stop-attack').click();
    dom.window.document.getElementById('btn-stop-simulation').click();

    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK });
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION });

    const runtime = orchestrator.store.getState().runtime.control;
    expect(runtime.simulationRunning).toBe(false);
    expect(runtime.attackRunning).toBe(false);
  });

  it('reset dispatch restores store defaults and UI defaults', () => {
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: {
        deviceCount: 75,
        attackType: ATTACK_TYPES.ICMP,
        bandwidthMultiplier: 1.8,
        targetIP: '198.51.100.77'
      }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: true }
    });

    dom.window.document.getElementById('slider-device-count').value = '75';
    dom.window.document.getElementById('dropdown-attack-type').value = 'ICMP';
    dom.window.document.getElementById('slider-attack-bandwidth').value = '1.8';
    dom.window.document.getElementById('input-target-ip').value = '198.51.100.77';

    dom.window.document.getElementById('btn-reset').click();

    const defaults = defaultSimulationState();
    expect(orchestrator.store.getState()).toEqual(defaults);
    expect(dom.window.document.getElementById('slider-device-count').value).toBe('1');
    expect(dom.window.document.getElementById('dropdown-attack-type').value).toBe('UDP');
    expect(dom.window.document.getElementById('slider-attack-bandwidth').value).toBe('1');
    expect(dom.window.document.getElementById('input-target-ip').value).toBe('203.0.113.10');
  });

  it('attack configuration controls dispatch and update attack config branch', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    const deviceCount = dom.window.document.getElementById('slider-device-count');
    deviceCount.value = '100';
    deviceCount.dispatchEvent(new dom.window.Event('input'));

    const attackType = dom.window.document.getElementById('dropdown-attack-type');
    attackType.value = 'TCP_SYN';
    attackType.dispatchEvent(new dom.window.Event('change'));

    const bandwidth = dom.window.document.getElementById('slider-attack-bandwidth');
    bandwidth.value = '1.6';
    bandwidth.dispatchEvent(new dom.window.Event('input'));

    const targetIp = dom.window.document.getElementById('input-target-ip');
    targetIp.value = '198.51.100.8';
    targetIp.dispatchEvent(new dom.window.Event('input'));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { deviceCount: 100 }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { attackType: ATTACK_TYPES.TCP_SYN }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { bandwidthMultiplier: 1.6 }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { targetIP: '198.51.100.8' }
    });

    const attackConfig = orchestrator.store.getState().config.attack;
    expect(attackConfig.deviceCount).toBe(100);
    expect(attackConfig.attackType).toBe(ATTACK_TYPES.TCP_SYN);
    expect(attackConfig.bandwidthMultiplier).toBe(1.6);
    expect(attackConfig.targetIP).toBe('198.51.100.8');
  });

  it('firewall, topology, capacity, and display controls dispatch and update authoritative store branches', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    const tcp = dom.window.document.getElementById('check-block-tcp');
    tcp.checked = true;
    tcp.dispatchEvent(new dom.window.Event('change'));

    const udp = dom.window.document.getElementById('check-block-udp');
    udp.checked = true;
    udp.dispatchEvent(new dom.window.Event('change'));

    const icmp = dom.window.document.getElementById('check-block-icmp');
    icmp.checked = true;
    icmp.dispatchEvent(new dom.window.Event('change'));

    const rateLimitEnabled = dom.window.document.getElementById('check-rate-limit');
    rateLimitEnabled.checked = true;
    rateLimitEnabled.dispatchEvent(new dom.window.Event('change'));

    const rateLimitSlider = dom.window.document.getElementById('slider-rate-limit');
    rateLimitSlider.value = '44';
    rateLimitSlider.dispatchEvent(new dom.window.Event('input'));

    const rateScope = dom.window.document.getElementById('dropdown-rate-limit-scope');
    rateScope.value = 'UDP';
    rateScope.dispatchEvent(new dom.window.Event('change'));

    const reverseProxy = dom.window.document.getElementById('check-reverse-proxy');
    reverseProxy.checked = true;
    reverseProxy.dispatchEvent(new dom.window.Event('change'));

    const loadBalancing = dom.window.document.getElementById('check-load-balancing');
    loadBalancing.checked = true;
    loadBalancing.dispatchEvent(new dom.window.Event('change'));

    const capacity = dom.window.document.getElementById('slider-server-capacity');
    capacity.value = '2.2';
    capacity.dispatchEvent(new dom.window.Event('input'));

    const badge = dom.window.document.getElementById('select-proxy-badge');
    badge.value = 'count';
    badge.dispatchEvent(new dom.window.Event('change'));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.TCP, blocked: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.UDP, blocked: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.ICMP, blocked: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
      payload: { threshold: 44 }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE,
      payload: { scope: 'UDP' }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 2.2 }
    });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'count' }
    });

    const state = orchestrator.store.getState();
    expect(state.config.defense.firewall.blockedProtocols).toEqual(expect.arrayContaining([
      PROTOCOLS.TCP,
      PROTOCOLS.UDP,
      PROTOCOLS.ICMP
    ]));
    expect(state.config.defense.firewall.rateLimit.enabled).toBe(true);
    expect(state.config.defense.firewall.rateLimit.threshold).toBe(44);
    expect(state.config.defense.firewall.rateLimit.scope).toBe('UDP');
    expect(state.config.defense.topology.reverseProxyEnabled).toBe(true);
    expect(state.config.defense.capacity.loadBalancingEnabled).toBe(true);
    expect(state.config.defense.capacity.serverCapacityMultiplier).toBe(2.2);
    expect(state.config.display.proxyBadgeMode).toBe('count');
  });

  it('keeps UI-driven defense updates scoped to the intended domain branch', () => {
    const initialDefense = structuredClone(orchestrator.store.getState().config.defense);

    const rateLimitEnabled = dom.window.document.getElementById('check-rate-limit');
    rateLimitEnabled.checked = true;
    rateLimitEnabled.dispatchEvent(new dom.window.Event('change'));

    expect(orchestrator.store.getState().config.defense.firewall.rateLimit.enabled).toBe(true);
    expect(orchestrator.store.getState().config.defense.topology).toEqual(initialDefense.topology);
    expect(orchestrator.store.getState().config.defense.capacity).toEqual(initialDefense.capacity);

    const reverseProxy = dom.window.document.getElementById('check-reverse-proxy');
    reverseProxy.checked = true;
    reverseProxy.dispatchEvent(new dom.window.Event('change'));

    expect(orchestrator.store.getState().config.defense.topology.reverseProxyEnabled).toBe(true);
    expect(orchestrator.store.getState().config.defense.firewall).toEqual(
      expect.objectContaining({
        blockedProtocols: initialDefense.firewall.blockedProtocols,
        blockedSubnets: initialDefense.firewall.blockedSubnets,
        rateLimit: expect.objectContaining({ enabled: true })
      })
    );

    const loadBalancing = dom.window.document.getElementById('check-load-balancing');
    loadBalancing.checked = true;
    loadBalancing.dispatchEvent(new dom.window.Event('change'));

    const capacity = dom.window.document.getElementById('slider-server-capacity');
    capacity.value = '2.3';
    capacity.dispatchEvent(new dom.window.Event('input'));

    const defense = orchestrator.store.getState().config.defense;
    expect(defense.capacity).toEqual({
      serverCapacityMultiplier: 2.3,
      loadBalancingEnabled: true,
      loadBalancingMultiplier: 2
    });
    expect(defense.topology).toEqual(expect.objectContaining({ reverseProxyEnabled: true }));
    expect(defense.firewall).toEqual(expect.objectContaining({
      blockedProtocols: initialDefense.firewall.blockedProtocols,
      blockedSubnets: initialDefense.firewall.blockedSubnets,
      rateLimit: expect.objectContaining({ enabled: true })
    }));
  });
});