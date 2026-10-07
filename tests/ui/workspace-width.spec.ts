import { test, expect } from '@playwright/test';
import { startFixture, Client } from '../support.mjs';

let fixture: Awaited<ReturnType<typeof startFixture>>;
test.beforeAll(async () => {
  fixture = await startFixture(18792);
  const admin = await new Client(fixture.base).login();
  const user = admin.state.users.find((user: any) => user.role === 'admin');
  await admin.action('createWorkflowTemplate', [{ title: 'Workspace review', description: 'Layout fixture',
    classification: 'Communication', documentType: 'Office Order', isActive: true,
    steps: [{ stepNumber: 1, name: 'Review', description: 'Review', assigneeType: 'Person', assigneeUserId: user.id,
      assigneeName: user.name, slaHours: 24, requiredAction: 'Verify & Process', allowReturn: true, requiresAttachment: false }] }]);
  await admin.action('registerDocument', [{ title: 'Workspace layout verification document', subject: 'Layout fixture',
    sourceType: 'Internal', sourceOffice: 'HRMDO', senderName: 'Records Unit', classification: 'Communication',
    documentType: 'Office Order', priority: 'Routine', description: '', barcode: 'LAYOUT-001', files: [] }]);
});
test.afterAll(async () => { await fixture?.stop(); });

const views = ['dashboard', 'queues', 'payroll', 'registry', 'leave', 'workflows', 'catalogue', 'users', 'migration', 'audit'];
for (const width of [390, 768, 1366, 1440, 1920, 2560]) {
  test(`all workspaces fill the available width at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const admin = await new Client(fixture.base).login();
    await page.context().addCookies(admin.cookie.split('; ').map((cookie: string) => {
      const split = cookie.indexOf('=');
      return { name: cookie.slice(0, split), value: cookie.slice(split + 1), url: fixture.base + '/' };
    }));
    await page.addInitScript(() => {
      sessionStorage.setItem('hrmdo.initial-loader-shown', '1');
      localStorage.setItem('hrmdo.sidebar-collapsed', 'false');
    });
    await page.route('**/api/weather.php', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: false }) }));
    await page.goto(`${fixture.base}/`);
    await expect(page.locator('.app-content > main')).toBeVisible();
    for (const collapsed of width >= 1024 ? [false, true] : [false]) {
      if (collapsed) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      for (const view of views) {
        if (width < 1024) await page.getByRole('button', { name: 'Open sidebar menu' }).click();
        await page.locator(`#sidebar-link-${view}`).click();
        await expect(page.locator(`#sidebar-link-${view}`)).toHaveAttribute('aria-current', 'page');
        const measurements = await page.evaluate(() => {
          const main = document.querySelector('.app-content > main')!;
          const header = document.querySelector('.app-content > header > div.relative')!;
          const footer = document.querySelector('.app-content > footer > div')!;
          const root = main.firstElementChild!;
          const rect = main.getBoundingClientRect();
          return { x: rect.x, width: rect.width, pageWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            padding: Number.parseFloat(getComputedStyle(main).paddingLeft),
            headerPadding: Number.parseFloat(getComputedStyle(header).paddingLeft),
            footerPadding: Number.parseFloat(getComputedStyle(footer).paddingLeft),
            rootWidth: root.getBoundingClientRect().width };
        });
        const offset = width >= 1024 ? collapsed ? 72 : 288 : 0;
        const padding = width >= 1024 ? 32 : width >= 640 ? 24 : 12;
        expect(measurements.x, `${view}: sidebar offset`).toBe(offset);
        expect(measurements.width, `${view}: workspace width`).toBe(width - offset);
        expect(measurements.padding).toBe(padding);
        expect(measurements.headerPadding).toBe(padding);
        expect(measurements.footerPadding).toBe(padding);
        expect(measurements.rootWidth, `${view}: page width`).toBe(width - offset - 2 * padding);
        expect(measurements.scrollWidth, `${view}: no page overflow`).toBeLessThanOrEqual(measurements.pageWidth);
        if ((width === 1920 && ['dashboard', 'registry'].includes(view)) || (width === 390 && view === 'dashboard')) {
          await page.screenshot({ path: `test-results/workspace-${view}-${width}-${collapsed ? 'collapsed' : 'expanded'}.png`, animations: 'disabled' });
        }
      }
    }
  });
}
