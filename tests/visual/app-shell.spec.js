import { expect, test } from '@playwright/test';

async function startScenario(page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('#btn-start-simulation').click();
  await page.locator('#slider-device-count').fill('12');
  await page.selectOption('#dropdown-attack-type', 'UDP');
  await page.locator('#btn-start-attack').click();
}

test.describe('Simulator smoke flow', () => {
  test('renders the main controls and canvas', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#btn-start-simulation')).toBeVisible();
    await expect(page.locator('#btn-start-attack')).toBeVisible();
    await expect(page.locator('#slider-device-count')).toBeVisible();
    await expect(page.locator('#dropdown-attack-type')).toBeVisible();
  });

  test('starts a basic attack scenario without page errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await startScenario(page);
    await page.waitForTimeout(1200);

    await expect(page.locator('#btn-stop-attack')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('exposes simulation state changes in the UI', async ({ page }) => {
    await startScenario(page);
    await page.waitForTimeout(1200);

    const statusText = await page.locator('body').textContent();
    expect(statusText).toBeTruthy();
    expect(statusText).toMatch(/online|degraded|crashed|attack|traffic/i);
  });
});