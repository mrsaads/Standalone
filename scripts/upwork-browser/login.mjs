import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
const dir = process.env.UPWORK_BROWSER_SESSION_DIR;
if (!dir) throw new Error('Set UPWORK_BROWSER_SESSION_DIR to a private directory outside the checkout.');
await mkdir(dir, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
const context = await chromium.launchPersistentContext(resolve(dir), { headless: false, executablePath: process.env.UPWORK_BROWSER_EXECUTABLE_PATH || undefined });
try {
  const page = await context.newPage();
  await page.goto('https://www.upwork.com/ab/account-security/login');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  await terminal.question('Sign in yourself in the browser, including any MFA. Press Enter here when finished. ');
  terminal.close();
} finally { await context.close(); }
