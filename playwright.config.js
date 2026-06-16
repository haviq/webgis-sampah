import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  workers: 1, // Kita pakai 1 worker dulu supaya browser tidak tabrakan
  use: {
    headless: false, // Set false agar Anda bisa menonton robotnya bekerja!
    viewport: { width: 1280, height: 720 },
    actionTimeout: 0,
    trace: 'on-first-retry',
  },
});
