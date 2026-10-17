import { profileUrl } from './core.mjs';

// Secrets stay in the environment; output contains counts, never profile text or tokens.
async function main() {
  const target = profileUrl(process.argv[2]);
  if (!target) throw new Error('Usage: npm run browser:verify -- https://www.upwork.com/freelancers/PROFILE_ID');
  const endpoint = new URL(process.env.UPWORK_BROWSER_URL || 'http://127.0.0.1:3100');
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/')
    throw new Error('UPWORK_BROWSER_URL must be an HTTPS service origin (HTTP allowed only on loopback).');
  const token = process.env.UPWORK_BROWSER_TOKEN;
  if (!token || token.length < 32) throw new Error('Set UPWORK_BROWSER_TOKEN to the worker secret (32+ characters).');
  async function request(path, body) {
    const response = await fetch(new URL(path, endpoint), {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Worker ${path} returned HTTP ${response.status}. Check credentials, login mode, or cooldown.`);
    return response.json();
  }
  const health = await request('/health');
  if (!health.ok || health.busy) throw new Error('Worker is unavailable or busy; retry after 15 seconds.');
  const capture = await request('/capture', { url: target });
  if (!capture.ok) {
    const outcomes = ['login_required', 'blocked', 'incomplete', 'parse_failed', 'busy', 'timeout', 'unavailable'];
    throw new Error(`Capture failed: ${outcomes.includes(capture.outcome) ? capture.outcome : 'invalid response'}.`);
  }
  if (profileUrl(capture.url) !== target || typeof capture.overview !== 'string' || capture.overview.trim().length < 80 ||
      capture.overview.length > 5000 || typeof capture.text !== 'string' || capture.text.length < 200 || capture.text.length > 40000)
    throw new Error('Capture did not contain valid matching profile evidence.');
  console.log(`Profile capture passed: ${capture.overview.length} overview characters, ${capture.text.length} visible text characters.`);
  console.log('Verify the profile content in the app preview before enabling scoring for users.');
}
main().catch(() => {
  // Never print arbitrary network/provider errors that may contain sensitive details.
  console.error('Verification failed. Check the worker URL/token, disable login mode after signing in, and inspect worker status.');
  process.exitCode = 1;
});
