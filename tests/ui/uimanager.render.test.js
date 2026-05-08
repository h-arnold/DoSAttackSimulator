import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import UIManager from '../../js/ui/UIManager.js';
import defaultSimulationState from '../../js/state/defaultSimulationState.js';
import ViewModelProjector from '../../js/core/ViewModelProjector.js';

describe('UIManager.render', () => {
  let dom;
  let uiManager;
  let projector;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="server-status"></span>
          <span id="bandwidth-value"></span>
          <div id="bandwidth-bar"></div>
          <span id="cpu-value"></span>
          <div id="cpu-bar"></div>
          <span id="happiness-value"></span>
          <div id="happiness-bar"></div>
          <div id="user-logs"></div>
          <div id="analyzer-logs"></div>
          <span id="stat-active-packets"></span>
          <span id="stat-bandwidth"></span>
          <span id="stat-active-halfopen"></span>
        </body>
      </html>
    `);

    global.document = dom.window.document;
    uiManager = new UIManager();
    projector = new ViewModelProjector();
  });

  it('renders projected values and remains idempotent for equal input', () => {
    const state = defaultSimulationState();
    state.runtime.server.bandwidthUsage = 66;
    state.runtime.server.cpuLoad = 22;
    state.runtime.server.happinessScore = 91;

    const viewModel = projector.project(state, {
      aggregates: {
        activeWeighted: 7,
        activeLegitWeighted: 7,
        activeMaliciousWeighted: 0,
        activeByType: {},
        halfOpenWeighted: 2
      }
    });

    uiManager.render(viewModel);
    const firstHtml = dom.window.document.body.innerHTML;

    uiManager.render(viewModel);
    const secondHtml = dom.window.document.body.innerHTML;

    expect(secondHtml).toBe(firstHtml);
    expect(dom.window.document.getElementById('bandwidth-value').textContent).toBe('66%');
    expect(dom.window.document.getElementById('stat-active-halfopen').textContent).toBe('2');
  });

  it('preserves zero active-weighted values instead of falling back to particle length', () => {
    const state = defaultSimulationState();
    state.runtime.traffic.particles = [{ id: 'p1' }, { id: 'p2' }];

    const viewModel = projector.project(state, {
      aggregates: {
        activeWeighted: 0,
        activeLegitWeighted: 0,
        activeMaliciousWeighted: 0,
        activeByType: {},
        halfOpenWeighted: 0
      }
    });

    uiManager.render(viewModel);

    expect(dom.window.document.getElementById('stat-active-packets').textContent).toBe('0');
  });
});
