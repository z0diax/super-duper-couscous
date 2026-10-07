import { test, expect } from '@playwright/test';
import { startFixture, testPassword, Client } from '../support.mjs';
import { SYSTEM_THEMES } from '../../src/theme/themeRegistry';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => { fixture = await startFixture(18784); });
test.afterAll(async () => { await fixture?.stop(); });

test('semantic nav icons play once, restart on activation, and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const aside = page.locator('aside.app-sidebar');
  await expect(page.locator('#sidebar-link-dashboard')).toBeVisible();
  const animations = {
    dashboard: ['.dashboard-tile-1', 'nav-tile-first'],
    queues: ['.inbox-item', 'nav-task-arrival'],
    payroll: ['.payroll-top', 'nav-layer-top'],
    registry: ['.registry-front', 'nav-sheet-retrieve'],
    leave: ['.calendar-minute', 'nav-minute-advance'],
    workflows: ['.workflow-travel', 'nav-flow-travel'],
    catalogue: ['.catalogue-front', 'nav-tag-select'],
    users: ['.users-left', 'nav-user-left'],
    migration: ['.archive-record', 'nav-record-store'],
    audit: ['.audit-trail', 'nav-history-trace'],
  };
  for (const [id, [part, name]] of Object.entries(animations)) {
    const button = page.locator(`#sidebar-link-${id}`);
    const icon = button.locator('.animated-nav-icon');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    await expect(icon.locator('svg')).toHaveAttribute('focusable', 'false');
    await expect(icon.locator('svg')).toHaveCSS('animation-name', 'none');
    expect(await icon.evaluate(element => [element.clientWidth, element.clientHeight])).toEqual([16, 16]);
    const before = await button.boundingBox();
    await button.hover();
    await expect(icon).toHaveAttribute('data-trigger', 'hover');
    await expect(icon.locator(part)).toHaveCSS('animation-name', name);
    await expect(icon.locator(part)).toHaveCSS('animation-iteration-count', '1');
    await expect(icon.locator('svg')).toHaveCSS('animation-name', 'none');
    await expect(icon.locator('svg')).toHaveCSS('transform', 'none');
    expect(await button.boundingBox()).toEqual(before);
    // Sample the actual browser animation: internal shapes must change, while
    // the frame and all explicitly stationary artwork keep their transforms.
    const sampled = await icon.evaluate(element => {
      const playing = element.getAnimations({ subtree: true });
      const samples = [0, .25, .5, .75].map(progress => {
        playing.forEach(animation => {
          animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
        });
        return Array.from(element.querySelectorAll('.icon-part')).map(part => {
          const style = getComputedStyle(part);
          return [style.transform, style.opacity, style.strokeDashoffset].join('|');
        }).join(';');
      });
      const stationary = Array.from(element.querySelectorAll('svg, .icon-static')).every(part =>
        getComputedStyle(part).transform === 'none' && getComputedStyle(part).animationName === 'none');
      playing.forEach(animation => animation.finish());
      return { distinctFrames: new Set(samples).size, stationary };
    });
    expect(sampled.distinctFrames).toBeGreaterThan(1);
    expect(sampled.stationary).toBe(true);
    await expect(icon).toHaveAttribute('data-trigger', 'idle');
    expect(await button.boundingBox()).toEqual(before);
    await page.mouse.move(800, 70);
    await button.hover(); // Re-entering the row reliably replays the parts.
    await expect(icon).toHaveAttribute('data-trigger', 'hover');
    await expect(icon.locator(part)).toHaveCSS('animation-name', name);
    await expect(icon).toHaveAttribute('data-trigger', 'idle');
    await button.click();
    await expect(button).toHaveClass(/sidebar-nav-active/);
    await expect(icon).toHaveAttribute('data-active', 'true');
    await expect(icon).toHaveAttribute('data-trigger', 'activation');
    await expect(icon).toHaveAttribute('data-trigger', 'idle');
    await button.click(); // Clicking an already active module also replays.
    await expect(icon).toHaveAttribute('data-trigger', 'activation');
    await expect(icon).toHaveAttribute('data-trigger', 'idle');
    await expect(icon.locator('svg')).toHaveCSS('transform', 'none');
    expect(await icon.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await icon.locator('.icon-transient').evaluateAll(parts => parts.every(part => getComputedStyle(part).opacity === '0'))).toBe(true);
    await expect(page.locator('main')).not.toBeEmpty();
  }
  const dashboard = page.locator('#sidebar-link-dashboard');
  await page.keyboard.press('Tab'); // Establish keyboard focus modality.
  await dashboard.focus();
  await expect(dashboard.locator('.animated-nav-icon')).toHaveAttribute('data-trigger', 'focus');
  await expect(dashboard.locator('.animated-nav-icon')).toHaveAttribute('data-trigger', 'idle');
  await page.keyboard.press('Enter');
  await expect(dashboard).toHaveClass(/sidebar-nav-active/);
  await expect(dashboard.locator('.animated-nav-icon')).toHaveAttribute('data-trigger', 'activation');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dashboard.locator('svg')).toHaveCSS('animation-name', 'none');
  await expect(dashboard.locator('svg')).toHaveCSS('transform', 'none');
  expect(await aside.locator('.animated-nav-icon').evaluateAll(icons => icons.every(icon =>
    icon.getAnimations({ subtree: true }).length === 0 && Array.from(icon.querySelectorAll('.icon-part')).every(part =>
      getComputedStyle(part).animationName === 'none' && getComputedStyle(part).transform === 'none')))).toBe(true);
  await page.locator('#sidebar-link-registry').hover();
  await page.locator('#sidebar-link-registry').click();
  await expect(page.locator('#sidebar-link-registry')).toHaveClass(/sidebar-nav-active/);
  await expect(aside.locator('.animated-nav-icon:not([data-trigger="idle"])')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await aside.locator('.animated-nav-icon').evaluateAll(icons => icons.every(icon => icon.getAnimations({ subtree: true }).length === 0))).toBe(true);
  await page.screenshot({ path: 'test-results/semantic-sidebar-icons-desktop.png', animations: 'disabled' });
  await expect(page.locator('#btn-sidebar-register-doc .animated-nav-icon')).toHaveCount(0);
  await expect(page.locator('#btn-sidebar-register-payroll .animated-nav-icon')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#btn-open-sidebar-menu').click();
  expect(await aside.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dashboard.click();
  await expect(aside).toHaveClass(/-translate-x-full/);
  await expect(dashboard).toHaveClass(/sidebar-nav-active/);
});

test('sidebar motifs and controls follow every system theme, appearance, and effects preference', async ({ page }) => {
  const admin = await new Client(fixture.base).login();
  await page.goto(`${fixture.base}/`);
  await page.getByLabel('Email address').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const aside = page.locator('aside.app-sidebar');
  const active = page.locator('#sidebar-link-dashboard');
  const register = page.locator('#btn-sidebar-register-doc');
  await expect(active).toBeVisible();

  for (const theme of Object.values(SYSTEM_THEMES).filter(theme => theme.enabled && theme.id !== 'weather-sync')) {
    const setting = await admin.request('settings.php', 'PUT', { theme: theme.id });
    await page.evaluate(value => {
      const channel = new BroadcastChannel('hrmdo-theme');
      channel.postMessage(value);
      channel.close();
    }, setting);
    await expect(page.locator('html')).toHaveAttribute('data-system-theme', theme.id);
    if (theme.effectId) await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', theme.effectId);
    if (theme.effectId) {
      await expect(page.locator('[data-nav-effect]')).toHaveAttribute('data-nav-effect', theme.effectId);
      if (theme.id !== 'valentine') await expect(page.locator('[data-nav-effect] svg')).toHaveCount(2);
    } else {
      await expect(page.locator('[data-nav-effect]')).toHaveCount(0);
      await expect(aside.locator('.sidebar-theme-decoration')).toHaveCount(0);
    }

    await expect.poll(() => page.evaluate(() => {
      const root = document.documentElement;
      const sample = document.createElement('div');
      sample.style.backgroundColor = 'var(--app-primary-hover)';
      document.body.appendChild(sample);
      const expectedActive = getComputedStyle(sample).backgroundColor;
      sample.style.backgroundColor = 'var(--app-primary)';
      const expectedPrimary = getComputedStyle(sample).backgroundColor;
      sample.remove();
      return {
        active: getComputedStyle(document.querySelector('#sidebar-link-dashboard')!).backgroundColor === expectedActive,
        primary: getComputedStyle(document.querySelector('#btn-sidebar-register-doc')!).backgroundColor === expectedPrimary,
        appearance: root.dataset.appearance,
      };
    })).toMatchObject({ active: true, primary: true });
  }

  await page.evaluate(() => {
    const channel = new BroadcastChannel('hrmdo-theme');
    channel.postMessage({ theme: 'weather-sync', effectiveWeatherTheme: 'rainy', revision: 999999, updatedAt: null, weatherUpdatedAt: null });
    channel.close();
  });
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-rainy');
  await page.evaluate(() => {
    const channel = new BroadcastChannel('hrmdo-theme');
    channel.postMessage({ theme: 'weather-sync', effectiveWeatherTheme: 'cloudy', revision: 1000000, updatedAt: null, weatherUpdatedAt: null });
    channel.close();
  });
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-cloudy');

  await page.locator('#btn-persona-switcher').click();
  await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(aside.locator('.sidebar-theme-decoration')).toBeVisible();
  await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'Off' }).click();
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveCount(0);
  await expect(active).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(register).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('group', { name: 'Theme effects' }).getByRole('button', { name: 'On' }).click();
  await expect(aside.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'weather-cloudy');

  await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 500, y: 500 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(aside).toHaveClass(/-translate-x-full/);
  await page.locator('#btn-open-sidebar-menu').click();
  await expect(aside).toBeVisible();
  expect(await aside.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('#sidebar-link-registry').click();
  await expect(aside).toHaveClass(/-translate-x-full/);
});
