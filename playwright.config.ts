import { defineConfig, devices } from '@playwright/test';

const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 3000);
const backendPort = Number(process.env.E2E_BACKEND_PORT || 5000);
const baseURL = `http://127.0.0.1:${frontendPort}`;
const backendURL = `http://127.0.0.1:${backendPort}`;

const mongoUri =
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/watchparty-e2e';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix backend run start',
      url: `${backendURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: String(backendPort),
        CLIENT_URL: baseURL,
        MONGODB_URI: mongoUri,
        GUEST_JWT_SECRET: process.env.GUEST_JWT_SECRET || 'watchparty-e2e-secret',
      },
    },
    {
      command: 'npm --prefix frontend run dev',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        ...process.env,
        PORT: String(frontendPort),
        NEXT_PUBLIC_API_URL: `${backendURL}/api`,
        NEXT_PUBLIC_SOCKET_URL: backendURL,
      },
    },
  ],
});
