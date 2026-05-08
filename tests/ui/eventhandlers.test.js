import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import EventHandlers from '../../js/ui/EventHandlers.js';
import Orchestrator, { ORCHESTRATOR_COMMAND_TYPES } from '../../js/core/Orchestrator.js';
import UIManager from '../../js/ui/UIManager.js';
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
        <button id="btn-toggle-firewall"></button>
        <div id="firewall-dashboard" class="hidden"></div>
        <span id="firewall-toggle-icon">▼</span>
        <input type="checkbox" id="check-block-tcp" />
        <input type="checkbox" id="check-block-udp" />
        <input type="checkbox" id="check-block-icmp" />
        <input type="checkbox" id="check-rate-limit" />
        <input type="range" id="slider-rate-limit" value="20" />
        <div id="rate-limit-controls" class="hidden"></div>
        <select id="dropdown-rate-limit-scope">
          <option value="ALL">All</option>
          <option value="UDP">UDP</option>
        </select>
        <input type="checkbox" id="check-reverse-proxy" />
        <select id="select-proxy-badge">
          <option value="ip">IP</option>
          <option value="count">Count</option>
        </select>
        <input type="checkbox" id="check-load-balancing" />
        <span id="device-count-value"></span>
        <span id="attack-bandwidth-value"></span>
        <span id="rate-limit-value"></span>
        <div id="botnet-ranges"></div>
        <div id="ip-blacklist"></div>
        <div id="user-logs"></div>
        <div id="analyzer-logs"></div>
      </body>
    </html>
  `);
}

describe('EventHandlers command translation (Section 2 / Phase 4)', () => {
  let dom;
  let orchestrator;
  let uiManager;
  let eventHandlers;

  beforeEach(() => {
    dom = buildDom();
    globalThis.document = dom.window.document;

    orchestrator = new Orchestrator();
    uiManager = new UIManager();
    uiManager.updateAttackerInfo = vi.fn();
    uiManager.updateBotnetRanges = vi.fn();
    uiManager.clearLogs = vi.fn();
    uiManager.updateAddressing = vi.fn();
    uiManager.updateServerIPs = vi.fn();

    eventHandlers = new EventHandlers(orchestrator, uiManager, null);
  });

  it('dispatches simulation and attack control commands while preserving button visibility behavior', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachSimulationControls();

    dom.window.document.getElementById('btn-start-simulation').click();
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.START_SIMULATION });
    expect(orchestrator.store.getState().runtime.control.simulationRunning).toBe(true);
    expect(dom.window.document.getElementById('btn-start-simulation').classList.contains('hidden')).toBe(true);
    expect(dom.window.document.getElementById('btn-stop-simulation').classList.contains('hidden')).toBe(false);
    expect(dom.window.document.getElementById('btn-start-attack').disabled).toBe(false);

    dom.window.document.getElementById('btn-start-attack').click();
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.START_ATTACK });
    expect(orchestrator.store.getState().runtime.control.attackRunning).toBe(true);
    expect(uiManager.updateBotnetRanges).toHaveBeenCalledWith(orchestrator.attacker.botnetRanges);

    dom.window.document.getElementById('btn-stop-attack').click();
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_ATTACK });
    expect(orchestrator.store.getState().runtime.control.attackRunning).toBe(false);

    dom.window.document.getElementById('btn-stop-simulation').click();
    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.STOP_SIMULATION });
    expect(orchestrator.store.getState().runtime.control.simulationRunning).toBe(false);
    expect(dom.window.document.getElementById('btn-start-attack').disabled).toBe(true);
  });

  it('dispatches reset and keeps reset UI defaults/labels in sync', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachSimulationControls();

    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: {
        deviceCount: 12,
        attackType: ATTACK_TYPES.TCP_SYN,
        bandwidthMultiplier: 1.8,
        targetIP: '198.51.100.4'
      }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE,
      payload: { scope: 'UDP' }
    });
    orchestrator.dispatch({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 1.5 }
    });

    dom.window.document.getElementById('slider-device-count').value = '12';
    dom.window.document.getElementById('slider-attack-bandwidth').value = '1.8';
    dom.window.document.getElementById('dropdown-attack-type').value = 'TCP_SYN';
    dom.window.document.getElementById('input-target-ip').value = '198.51.100.4';
    dom.window.document.getElementById('dropdown-rate-limit-scope').value = 'UDP';
    dom.window.document.getElementById('slider-server-capacity').value = '1.5';

    dom.window.document.getElementById('btn-reset').click();

    expect(dispatchSpy).toHaveBeenCalledWith({ type: ORCHESTRATOR_COMMAND_TYPES.RESET_SIMULATION });
    expect(orchestrator.store.getState().runtime.control.simulationRunning).toBe(false);
    expect(orchestrator.store.getState().runtime.control.attackRunning).toBe(false);
    expect(orchestrator.particles).toEqual([]);
    expect(uiManager.clearLogs).toHaveBeenCalled();
    expect(uiManager.updateBotnetRanges).toHaveBeenCalledWith([]);

    expect(dom.window.document.getElementById('slider-device-count').value).toBe('1');
    expect(dom.window.document.getElementById('slider-attack-bandwidth').value).toBe('1');
    expect(dom.window.document.getElementById('dropdown-attack-type').value).toBe('UDP');
    expect(dom.window.document.getElementById('input-target-ip').value).toBe('203.0.113.10');
    expect(dom.window.document.getElementById('dropdown-rate-limit-scope').value).toBe('ALL');
    expect(dom.window.document.getElementById('slider-server-capacity').value).toBe('1');
    expect(dom.window.document.getElementById('server-capacity-value').textContent).toBe('1.0x');
    expect(dom.window.document.getElementById('btn-start-attack').disabled).toBe(true);
  });

  it('dispatches attack config commands from input parsing', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachAttackerControls();

    const deviceSlider = dom.window.document.getElementById('slider-device-count');
    deviceSlider.value = '100';
    deviceSlider.dispatchEvent(new dom.window.Event('input'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { deviceCount: 100 }
    });
    expect(orchestrator.store.getState().config.attack.deviceCount).toBe(100);

    const attackType = dom.window.document.getElementById('dropdown-attack-type');
    attackType.value = 'TCP_SYN';
    attackType.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { attackType: ATTACK_TYPES.TCP_SYN }
    });

    const targetIp = dom.window.document.getElementById('input-target-ip');
    targetIp.value = '198.51.100.99';
    targetIp.dispatchEvent(new dom.window.Event('input'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { targetIP: '198.51.100.99' }
    });

    const bandwidth = dom.window.document.getElementById('slider-attack-bandwidth');
    bandwidth.value = '1.5';
    bandwidth.dispatchEvent(new dom.window.Event('input'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { bandwidthMultiplier: 1.5 }
    });
    expect(uiManager.updateAttackerInfo).toHaveBeenCalledWith(100, 1.5);
  });

  it('falls back invalid attack type to UDP through command dispatch', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachAttackerControls();

    const dropdown = dom.window.document.getElementById('dropdown-attack-type');
    dropdown.innerHTML += '<option value="INVALID">Invalid</option>';
    dropdown.value = 'INVALID';
    dropdown.dispatchEvent(new dom.window.Event('change'));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_ATTACK_CONFIG,
      payload: { attackType: ATTACK_TYPES.UDP }
    });
    expect(dropdown.value).toBe('UDP');
  });

  it('dispatches firewall and topology commands with expected UI side effects', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachFirewallControls();

    const tcp = dom.window.document.getElementById('check-block-tcp');
    tcp.checked = true;
    tcp.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.TCP, blocked: true }
    });

    const udp = dom.window.document.getElementById('check-block-udp');
    udp.checked = true;
    udp.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.UDP, blocked: true }
    });

    const icmp = dom.window.document.getElementById('check-block-icmp');
    icmp.checked = true;
    icmp.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_PROTOCOL_BLOCK,
      payload: { protocol: PROTOCOLS.ICMP, blocked: true }
    });

    const rateLimit = dom.window.document.getElementById('check-rate-limit');
    const rateLimitControls = dom.window.document.getElementById('rate-limit-controls');
    rateLimit.checked = true;
    rateLimit.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_ENABLED,
      payload: { enabled: true }
    });
    expect(rateLimitControls.classList.contains('hidden')).toBe(false);

    const rateLimitSlider = dom.window.document.getElementById('slider-rate-limit');
    rateLimitSlider.value = '30';
    rateLimitSlider.dispatchEvent(new dom.window.Event('input'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_THRESHOLD,
      payload: { threshold: 30 }
    });
    expect(uiManager.elements.rateLimitValue.textContent).toBe('30');

    const scope = dom.window.document.getElementById('dropdown-rate-limit-scope');
    scope.value = 'UDP';
    scope.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_RATE_LIMIT_SCOPE,
      payload: { scope: 'UDP' }
    });

    const reverseProxy = dom.window.document.getElementById('check-reverse-proxy');
    reverseProxy.checked = true;
    reverseProxy.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_REVERSE_PROXY_ENABLED,
      payload: { enabled: true }
    });
    expect(uiManager.updateAddressing).toHaveBeenCalledWith(true);
    const state = orchestrator.getState();
    expect(uiManager.updateServerIPs).toHaveBeenCalledWith(state.server.publicIP, state.server.originIP);

    const loadBalancing = dom.window.document.getElementById('check-load-balancing');
    loadBalancing.checked = true;
    loadBalancing.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_LOAD_BALANCING_ENABLED,
      payload: { enabled: true }
    });
  });

  it('dispatches server-capacity and proxy-badge commands and keeps labels updated', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');
    eventHandlers.attachServerControls();
    eventHandlers.attachDisplayControls();

    const capacity = dom.window.document.getElementById('slider-server-capacity');
    capacity.value = '1.4';
    capacity.dispatchEvent(new dom.window.Event('input'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_SERVER_CAPACITY_MULTIPLIER,
      payload: { multiplier: 1.4 }
    });
    expect(dom.window.document.getElementById('server-capacity-value').textContent).toBe('1.4x');

    const badge = dom.window.document.getElementById('select-proxy-badge');
    badge.value = 'count';
    badge.dispatchEvent(new dom.window.Event('change'));
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_PROXY_BADGE_MODE,
      payload: { mode: 'count' }
    });
  });

  it('dispatches subnet block command from updateIPBlacklist callback path', () => {
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatch');

    orchestrator.firewall.getDetectedSubnets = vi.fn(() => ['198.51.100']);
    eventHandlers.updateIPBlacklist();

    const checkbox = dom.window.document.querySelector('.subnet-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event('change'));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: ORCHESTRATOR_COMMAND_TYPES.SET_FIREWALL_SUBNET_BLOCK,
      payload: { subnet: '198.51.100', blocked: true }
    });
  });

  it('retains simulation and attack button helper toggles', () => {
    const startSim = dom.window.document.getElementById('btn-start-simulation');
    const stopSim = dom.window.document.getElementById('btn-stop-simulation');
    eventHandlers.toggleSimulationButtons(true);
    expect(startSim.classList.contains('hidden')).toBe(true);
    expect(stopSim.classList.contains('hidden')).toBe(false);

    const startAttack = dom.window.document.getElementById('btn-start-attack');
    const stopAttack = dom.window.document.getElementById('btn-stop-attack');
    eventHandlers.toggleAttackButtons(true);
    expect(startAttack.classList.contains('hidden')).toBe(true);
    expect(stopAttack.classList.contains('hidden')).toBe(false);
  });

  it('does not contain direct orchestrator-owned state writes or bypass mutator calls in UI control code', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'js/ui/EventHandlers.js'), 'utf8');

    const disallowedWritePatterns = [
      /this\.orchestrator\.(?:firewall|server|attacker|isSimulationRunning|proxyBadgeMode)\s*=/,
      /this\.orchestrator\.(?:firewall|server|attacker)\.[A-Za-z_$][\w$]*\s*=/,
      /this\.orchestrator\.store\.[A-Za-z_$][\w$]*\s*=/,
      /this\.orchestrator\.writeStatePath\s*\(/,
      /this\.orchestrator\.(?:setProxyBadgeMode|reset)\s*\(/
    ];

    disallowedWritePatterns.forEach((pattern) => {
      expect(source).not.toMatch(pattern);
    });
    expect(source.match(/this\.orchestrator\.dispatch\s*\(/g)?.length ?? 0).toBeGreaterThan(0);
  });
});
