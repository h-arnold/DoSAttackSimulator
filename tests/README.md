# Testing Documentation

This directory contains the automated test suite for the DoS/DDoS Attack Simulator.

## Test Structure

```text
tests/
├── core/         # Unit tests for engine behavior
├── integration/  # Integration tests for attack and mitigation flows
├── models/       # Unit tests for simulation models
├── ui/           # DOM and event handler tests
└── visual/       # Playwright browser smoke tests
```

## Running Tests

### Vitest

Run the unit and integration suite:

```bash
npm test
```

Run a specific Vitest file:

```bash
npm test -- tests/core/trajectory.test.js
```

### Playwright

Install Chromium once:

```bash
npx playwright install --with-deps chromium
```

Run the browser smoke suite:

```bash
npm run test:visual
```

Run in headed mode:

```bash
npm run test:visual:headed
```

Run with the Playwright inspector:

```bash
npm run test:visual:debug
```

If you already have the app running elsewhere, point Playwright at it:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:visual
```

Otherwise the Playwright config starts the local static server automatically.

## Playwright Scope

The Playwright suite is intentionally small. It verifies that:

1. The app shell loads and the main controls render.
2. A simulation can be started through the UI.
3. A basic attack flow runs without browser-side exceptions.

Use the MCP browser tooling for exploratory or visual checks instead of embedding custom screenshot-upload logic in the repository test suite.

## Debugging Failures

Open the HTML report:

```bash
npx playwright show-report
```

Inspect captured artifacts in `test-results/` when a browser test fails.

## CI

The Playwright workflow installs Chromium, serves the app, and runs `npm run test:visual` on pushes and pull requests.

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Project SPEC.md](../SPEC.md)
- [Project README.md](../README.md)
