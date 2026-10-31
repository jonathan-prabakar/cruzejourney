import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://localhost:3002', headless: true, viewport: { width: 1512, height: 982 } },
  webServer: { command: 'npm run dev -- --port 3002', url: 'http://localhost:3002/journey', reuseExistingServer: true, timeout: 30000 },
});
