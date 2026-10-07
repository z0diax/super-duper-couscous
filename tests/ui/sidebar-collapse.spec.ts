import { test, expect, type Page } from '@playwright/test';
import { startFixture, Client, testPassword } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => {
  fixture = await startFixture(18791, { HRMDO_DOCUMENT_TARGETED_READS_ENABLED: '1', HRMDO_PAYROLL_TARGETED_READS_ENABLED: '1' });
  const admin = await new Client(fixture.base).login();
  const user = admin.state.users.find((user: any) => user.role === 'admin');
  for (const [role, modules] of [['supervisor', ['dashboard', 'queues']], ['processor', ['dashboard', 'payroll']]] as const) {
    await admin.action('addUser', [{ name: `Rail ${role}`, email: `rail-${role}@example.test`, password: testPassword,
      role, roleTitle: role, office: 'HRMDO', division: 'Operations', position: 'Officer', sidebarModules: modules }]);
  }
  await admin.action('createWorkflowTemplate', [{ title: 'Rail tasks', description: 'Sidebar badge fixture',
    classification: 'Communication', documentType: 'Office Order', isActive: true,
    steps: [{ stepNumber: 1, name: 'Review', description: 'Review', assigneeType: 'Person', assigneeUserId: user.id,
      assigneeName: user.name, slaHours: 24, requiredAction: 'Verify & Process', allowReturn: true, requiresAttachment: false }] }]);
  for (let i = 0; i < 12; i++) {
    await admin.action('registerDocument', [{ title: `Rail record ${i}`, subject: 'Badge fixture', sourceType: 'Internal',
      sourceOffice: 'HRMDO', senderName: 'Records Unit', classification: 'Communication', documentType: 'Office Order',
      priority: 'Routine', description: '', barcode: `RAIL-${i}`, files: [] }]);
  }
});
test.afterAll(async () => { await fixture?.stop(); });

async function open(page: Page, email = 'admin@example.test', theme = 'classic') {
  const admin = await new Client(fixture.base).login();
  await admin.request('settings.php', 'PUT', { theme });
  const client = email === 'admin@example.test' ? admin : await new Client(fixture.base).login(email);
  await page.context().addCookies(client.cookie.split('; ').map((cookie: string) => {
    const split = cookie.indexOf('=');
    return { name: cookie.slice(0, split), value: cookie.slice(split + 1), url: fixture.base + '/' };
  }));
  await page.addInitScript(() => sessionStorage.setItem('hrmdo.initial-loader-shown', '1'));
  await page.route('**/api/weather.php', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    current: { temperature_2m: 29, apparent_temperature: 30, weather_code: 2, is_day: 1 },
    daily: { temperature_2m_max: [31], temperature_2m_min: [25], precipitation_probability_max: [20] },
  }) }));
  await page.goto(fixture.base + '/');
  await expect(page.locator('#sidebar-link-dashboard')).toBeVisible();
  return admin;
}
async function collapse(page: Page) {
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.locator('aside.app-sidebar')).toHaveCSS('width', '72px');
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('desktop rail preserves all navigation, animations, names, badges, tooltips and quick actions', async ({ page }) => {
  let weatherReads = 0;
  page.on('request', request => { if (request.url().includes('/api/weather.php')) weatherReads++; });
  await open(page);
  const aside = page.locator('aside.app-sidebar');
  const content = page.locator('.app-content');
  await expect(aside).toHaveCSS('width', '288px');
  await expect(content).toHaveCSS('padding-left', '288px');
  const brand = await page.locator('.sidebar-brand-text [role="group"]').elementHandle();
  await collapse(page);
  await expect(content).toHaveCSS('padding-left', '72px');
  await expect(page.locator('.app-content > header').first()).toHaveJSProperty('offsetLeft', 72);
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(aside.locator('.sidebar-brand-header svg').first()).toBeVisible();
  await expect(aside.locator('.sidebar-brand-text')).toBeHidden();
  expect(await brand!.evaluate(element => element.isConnected)).toBe(true);
  await expect(aside.locator('.sidebar-weather-compact')).toContainText('29°');
  await expect(aside.locator('.sidebar-weather-detailed')).toBeHidden();
  expect(weatherReads).toBe(1);
  await expect(aside.locator('.sidebar-badge-compact')).toHaveText('9+');
  await expect(aside.locator('#sidebar-task-count')).toHaveAttribute('aria-label', '12 tasks');
  expect(await aside.locator('.animated-nav-icon').evaluateAll(icons => icons.every(icon => icon.getAnimations({ subtree: true }).length === 0))).toBe(true);

  for (const id of ['dashboard', 'queues', 'payroll', 'registry', 'leave', 'workflows', 'catalogue', 'users', 'migration', 'audit']) {
    const button = page.locator(`#sidebar-link-${id}`);
    const icon = button.locator('.animated-nav-icon');
    await expect(button.locator('.sidebar-label')).toBeHidden();
    await expect(icon).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBe(44);
    expect(box!.height).toBe(44);
    const iconBox = await icon.boundingBox();
    expect(iconBox!.x + iconBox!.width / 2).toBeCloseTo(box!.x + box!.width / 2, 1);
    await button.hover();
    await expect(page.getByRole('tooltip')).toHaveText(await button.getAttribute('aria-label') || '');
    expect((await page.getByRole('tooltip').boundingBox())!.x).toBeGreaterThanOrEqual(80);
    await expect(icon).toHaveAttribute('data-trigger', 'hover');
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(icon).toHaveAttribute('data-trigger', 'activation');
    await expect(icon).toHaveAttribute('data-trigger', 'idle');
    await expect(page.locator('main')).not.toBeEmpty();
    await noOverflow(page);
  }
  await page.keyboard.press('Tab');
  await page.locator('#sidebar-link-dashboard').focus();
  await expect(page.getByRole('tooltip')).toHaveText('Dashboard');
  await expect(page.locator('#sidebar-link-dashboard .animated-nav-icon')).toHaveAttribute('data-trigger', 'focus');
  await page.locator('#sidebar-link-payroll').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Payroll Management');
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('main').getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  for (const [id, label, close] of [
    ['btn-sidebar-register-doc', 'Register Document', 'Close document intake'],
    ['btn-sidebar-register-payroll', 'Intake Payroll', 'Close payroll intake'],
  ]) {
    await page.locator(`#${id}`).hover();
    await expect(page.getByRole('tooltip')).toHaveText(label);
    await page.locator(`#${id}`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: close, exact: true }).click();
  }
  await page.locator('#sidebar-link-payroll').hover();
  await page.screenshot({ path: 'test-results/sidebar-mini-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(content).toHaveCSS('padding-left', '288px');
  await expect(aside.locator('.sidebar-brand-text')).toBeVisible();
  expect(await brand!.evaluate(element => element.isConnected)).toBe(true);
  expect(weatherReads).toBe(1);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expect(aside).toHaveCSS('width', '256px');
  await expect(content).toHaveCSS('padding-left', '256px');
  await collapse(page);
  await noOverflow(page);
});

test('preference survives refresh while mobile keeps its full drawer and automatic closing', async ({ page }) => {
  await open(page);
  await collapse(page);
  await page.locator('#sidebar-link-payroll').click();
  await page.reload();
  await expect(page.locator('aside.app-sidebar')).toHaveCSS('width', '72px');
  await expect(page.locator('#sidebar-link-payroll')).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 844 });
  const aside = page.locator('aside.app-sidebar');
  await expect(aside).toHaveClass(/-translate-x-full/);
  await expect(aside).toHaveCSS('width', '256px');
  await expect(page.locator('.app-content')).toHaveCSS('padding-left', '0px');
  await page.getByRole('button', { name: 'Open sidebar menu' }).click();
  await expect(aside.locator('.sidebar-brand-text')).toBeVisible();
  await expect(aside.locator('#sidebar-link-dashboard .sidebar-label')).toBeVisible();
  await expect(page.locator('#btn-toggle-sidebar-collapsed')).toBeHidden();
  await page.getByRole('button', { name: 'Close sidebar menu' }).click();
  await expect(aside).toHaveClass(/-translate-x-full/);
  await page.getByRole('button', { name: 'Open sidebar menu' }).click();
  await page.locator('#sidebar-link-dashboard').click();
  await expect(aside).toHaveClass(/-translate-x-full/);
  await page.reload();
  await expect(aside).toHaveClass(/-translate-x-full/);
  await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(aside).toHaveCSS('width', '72px');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await page.reload();
  await expect(aside).toHaveCSS('width', '288px');
});

test('hidden branding stays mounted and keeps typing through collapse and seasonal changes', async ({ page }) => {
  const date = new Date('2026-10-31T12:00:00+08:00');
  await page.clock.install({ time: date });
  await page.clock.pauseAt(date);
  const admin = await open(page, 'admin@example.test', 'hallo-christmas');
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'hallo-christmas');
  const wrapper = page.locator('.sidebar-brand-text');
  const mounted = await wrapper.locator('[role="group"]').elementHandle();
  await page.clock.runFor(8500);
  const duringTyping = await wrapper.textContent();
  await collapse(page);
  expect(await wrapper.textContent()).toBe(duringTyping);
  expect(await mounted!.evaluate(element => element.isConnected)).toBe(true);
  await page.clock.runFor(3000);
  const progressed = await wrapper.textContent();
  expect(progressed).not.toBe(duringTyping);
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(wrapper).toBeVisible();
  expect(await wrapper.textContent()).toBe(progressed);
  expect(await mounted!.evaluate(element => element.isConnected)).toBe(true);
  await collapse(page);
  const setting = await admin.request('settings.php', 'PUT', { theme: 'breast-cancer-awareness' });
  await page.evaluate(value => { const channel = new BroadcastChannel('hrmdo-theme'); channel.postMessage(value); channel.close(); }, setting);
  await expect(page.locator('html')).toHaveAttribute('data-system-theme', 'breast-cancer-awareness');
  await expect(page.locator('.sidebar-theme-decoration')).toHaveAttribute('data-sidebar-effect', 'breast-cancer-awareness');
  await page.clock.runFor(15000);
  await expect(wrapper).toContainText('Together, let us raise awareness and inspire hope.');
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toContainText('Together, let us raise awareness and inspire hope.');
});

test('mini mode preserves supervisor and restricted-user module permissions', async ({ page }) => {
  for (const [email, expected] of [
    ['rail-supervisor@example.test', ['dashboard', 'queues', 'audit']],
    ['rail-processor@example.test', ['dashboard', 'payroll']],
  ] as const) {
    await open(page, email);
    if (await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).isVisible()) await collapse(page);
    const ids = await page.locator('#sidebar-navigation button').evaluateAll(buttons => buttons.map(button => button.id.replace('sidebar-link-', '')));
    expect(ids).toEqual([...expected]);
    await expect(page.locator('#btn-sidebar-register-doc')).toHaveCount(0);
    await expect(page.locator('#btn-sidebar-register-payroll')).toHaveCount(email.includes('processor') ? 1 : 0);
    for (const id of expected) {
      await page.locator(`#sidebar-link-${id}`).click();
      await expect(page.locator(`#sidebar-link-${id}`)).toHaveAttribute('aria-current', 'page');
    }
  }
});

test('short desktop rail scrolls without clipping tooltips and reduced motion removes layout animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 600 });
  await open(page);
  await collapse(page);
  await expect(page.locator('aside.app-sidebar')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.app-content')).toHaveCSS('transition-duration', '0s');
  expect(await page.locator('#sidebar-navigation').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator('#sidebar-link-audit').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Audit Trail & Reports');
  await expect(page.locator('#sidebar-link-audit .audit-trail')).toHaveCSS('animation-name', 'none');
  await page.locator('#sidebar-link-audit').click();
  await expect(page.locator('#sidebar-link-audit')).toHaveAttribute('aria-current', 'page');
  await noOverflow(page);
});

test('collapse still works when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key === 'hrmdo.sidebar-collapsed') throw new Error('Storage unavailable'); return read.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key === 'hrmdo.sidebar-collapsed') throw new Error('Storage unavailable'); return write.call(this, key, value); };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await collapse(page);
  await page.locator('#sidebar-link-queues').click();
  await expect(page.locator('#sidebar-link-queues')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('targeted shell errors retain a compact warning beside the rail icon', async ({ page }) => {
  test.skip(process.env.VITE_DOCUMENT_SHELL_TARGETED_READS !== '1', 'Requires targeted shell build.');
  await page.route('**/api/document_shell_summary.php', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await open(page);
  await collapse(page);
  const warning = page.locator('#sidebar-task-error');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('aria-label', 'Task count unavailable');
  expect((await warning.boundingBox())!.width).toBe(14);
  await page.locator('#sidebar-link-queues').click();
  await expect(page.locator('#sidebar-link-queues')).toHaveAttribute('aria-current', 'page');
  await noOverflow(page);
});
