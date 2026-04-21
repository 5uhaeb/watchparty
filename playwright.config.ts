import { defineConfig, devices } from '@playwright/test';

const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 3000);
const backendPort = Number(process.env.E2E_BACKEND_PORT || 5000);
const baseURL = `http://127.0.0.1:${frontendPort}`;
const backendURL = `http://127.0.0.1:${backendPort}`;

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
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/watchparty-e2e',
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'watchparty-e2e-secret',
        EXTENSION_INTERNAL_SECRET: process.env.EXTENSION_INTERNAL_SECRET || 'watchparty-extension-internal',
        EXTENSION_TOKEN_SECRET: process.env.EXTENSION_TOKEN_SECRET || 'watchparty-extension-token',
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
        NEXTAUTH_URL: baseURL,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'watchparty-e2e-secret',
        NEXT_PUBLIC_API_URL: `${backendURL}/api`,
        NEXT_PUBLIC_SOCKET_URL: backendURL,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test-google-client',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test-google-secret',
        EXTENSION_INTERNAL_SECRET: process.env.EXTENSION_INTERNAL_SECRET || 'watchparty-extension-internal',
      },
    },
  ],
});
