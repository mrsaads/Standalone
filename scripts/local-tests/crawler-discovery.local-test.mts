import assert from "node:assert/strict";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { siteUrl } from "../../lib/marketing/site";

const names = ["NEXT_PUBLIC_SITE_URL", "APP_ORIGIN", "RENDER_EXTERNAL_URL"] as const;
const saved = names.map(name => process.env[name]);
try {
  names.forEach(name => delete process.env[name]);
  process.env.RENDER_EXTERNAL_URL = "https://standalone-jcy4.onrender.com";
  assert.equal(siteUrl(), "https://www.improvexus.com");
  process.env.NEXT_PUBLIC_SITE_URL = "https://standalone-jcy4.onrender.com";
  assert.equal(siteUrl(), "https://www.improvexus.com");
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.improvexus.com/";
  assert.equal(siteUrl(), "https://www.improvexus.com");
  const policy = robots();
  assert.equal(policy.sitemap, "https://www.improvexus.com/sitemap.xml");
  assert.ok(Array.isArray(policy.rules));
  for (const rule of policy.rules as { userAgent: string; allow: string; disallow: string[] }[]) {
    assert.equal(rule.allow, "/");
    for (const path of ["/api/", "/admin", "/account", "/portal", "/audits"]) assert.ok(rule.disallow.includes(path));
    assert.ok(!rule.disallow.includes("/services"));
  }
  assert.ok(sitemap().every(page => page.url.startsWith("https://www.improvexus.com/")));
  assert.ok(sitemap().some(page => page.url === "https://www.improvexus.com/"));
  console.log("Crawler rules, private exclusions, hosting alias and canonical sitemap checks passed");
} finally {
  names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
}
