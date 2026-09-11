import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/ui', workers: 1, timeout: 60000,
  use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, actionTimeout: 10000, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  reporter: 'list' });
