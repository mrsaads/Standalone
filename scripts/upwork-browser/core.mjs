// This worker only reads pages available to the operator's own signed-in account.
export function profileUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !['upwork.com', 'www.upwork.com'].includes(u.hostname) ||
        u.port || u.username || u.password || !/^\/(freelancers|fl)\/[^/]+\/?$/.test(u.pathname)) return null;
    u.search = ''; u.hash = '';
    return u.href;
  } catch { return null; }
}

export function allowedResource(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
      ['upwork.com', 'upworkcdn.com'].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

export function classifyCapture({ url, title, text, overview, heading }) {
  if (/verify you are (?:a )?human|checking your browser|access denied|attention required|enable javascript and cookies to continue/i.test(`${title}\n${text}`))
    return { ok: false, outcome: 'blocked' };
  if (!profileUrl(url) || /log in to upwork|sign in to upwork/i.test(title))
    return { ok: false, outcome: 'login_required' };
  if (!heading?.trim() || text.trim().length < 200 || !/job success|total jobs|work history|portfolio|skills|\$[\d,.]+\s*\/\s*hr/i.test(text))
    return { ok: false, outcome: 'parse_failed' };
  // A header-only capture is not a full link import. Never silently score it as complete.
  if (!overview || overview.trim().length < 80 || overview.length > 5000)
    return { ok: false, outcome: 'incomplete' };
  return { ok: true };
}

export async function captureProfile(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (response && [401, 403, 429].includes(response.status())) return { ok: false, outcome: 'blocked' };
    if (response && !response.ok()) return { ok: false, outcome: 'unavailable' };
    // Wait for profile content rather than networkidle: live pages have persistent connections.
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    // Only expand the profile overview, never arbitrary links or account controls.
    const overviewRoot = page.locator('[data-test="profile-overview"], [data-test="overview"], .profile-overview').first();
    // Hydration can finish after the heading appears. Wait for the overview itself.
    await overviewRoot.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await overviewRoot.isVisible().catch(() => false)) {
      const more = overviewRoot.getByRole('button', { name: /^(more|show more)$/i }).first();
      if (await more.isVisible().catch(() => false)) {
        const before = await overviewRoot.innerText();
        await more.click();
        await page.waitForFunction(({ selector, before }) => {
          const root = document.querySelector(selector);
          return root && root.innerText !== before;
        }, { selector: '[data-test="profile-overview"], [data-test="overview"], .profile-overview', before }, { timeout: 5000 }).catch(() => {});
      }
    }
    const evidence = await page.evaluate(() => {
      const root = document.querySelector('main') || document.body;
      const overview = document.querySelector('[data-test="profile-overview"], [data-test="overview"], .profile-overview');
      return {
        text: root.innerText.slice(0, 40000),
        overview: overview?.innerText.replace(/\s*(?:more|less|show more|show less)\s*$/i, '').trim() || '',
        heading: root.querySelector('h1')?.innerText || '',
        title: document.title,
      };
    });
    const finalUrl = page.url();
    const classification = classifyCapture({ ...evidence, url: finalUrl });
    if (!classification.ok) return classification;
    // Never return session cookies, browser storage, or the full signed-in account HTML.
    const meta = await page.locator('meta[property], meta[name]').evaluateAll(nodes => nodes
      .filter(n => ['og:title', 'og:description', 'product:price:amount'].includes(n.getAttribute('property') || n.getAttribute('name')))
      .map(n => ({ key: n.getAttribute('property') || n.getAttribute('name'), value: n.getAttribute('content') || '' })));
    return { ok: true, url: finalUrl, capturedAt: new Date().toISOString(), ...evidence, meta };
  } catch (error) {
    return { ok: false, outcome: error?.name === 'TimeoutError' ? 'timeout' : 'unavailable' };
  } finally { await page.close(); }
}
