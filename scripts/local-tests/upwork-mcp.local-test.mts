import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { newMcpFlow, openMcpFlow, sealMcpFlow, mcpAuthorizeUrl, metadataDocument, upworkMcpConfig, validateMcpCallback } from "../../lib/upwork-mcp-auth";
import { readMcpContentProfile, UpworkMcpError } from "../../lib/upwork-mcp-client";
import { mcpContentEvidence } from "../../lib/upwork-content";
import { parseContentScores } from "../../lib/profile-content-score";

let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`ok - ${name}`); };
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", UPWORK_MCP_ENABLED: "true", UPWORK_MCP_ALLOW_LOCAL_TEST: "1", UPWORK_MCP_APP_ORIGIN: "http://127.0.0.1:3210", UPWORK_MCP_SESSION_SECRET: "s".repeat(32) };
const cfg = upworkMcpConfig(env)!;
const target = "https://www.upwork.com/freelancers/~01fe913b052b79af17";
const flow = newMcpFlow({ profileUrl: `${target}?tracking=x`, destination: "score" }, 1000);
const sealed = sealMcpFlow(cfg, flow);
check("OAuth flow is encrypted, expires, and keeps the exact profile target", () => {
  assert.equal(openMcpFlow(cfg, sealed, 2000)?.profileUrl, target);
  assert.equal(openMcpFlow(cfg, `${sealed.slice(0, -1)}x`, 2000), null);
  assert.equal(openMcpFlow(cfg, sealed, flow.expiresAt), null);
  const auth = new URL(mcpAuthorizeUrl(cfg, flow));
  assert.equal(auth.searchParams.get("resource"), "https://mcp.upwork.com/mcp");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.has("code_verifier"), false);
  assert.equal(metadataDocument(cfg).client_id, cfg.metadataUrl);
});
check("callback state and issuer are checked", () => {
  assert.equal(validateMcpCallback(flow, new URLSearchParams({ state: flow.state, code: "one-time", iss: "https://mcp.upwork.com" }), 2000), "one-time");
  assert.throws(() => validateMcpCallback(flow, new URLSearchParams({ state: "0".repeat(48), code: "x" }), 2000));
});

let wrongIdentity = false;
const server = createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const message = JSON.parse(raw); const reply = (result: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result })); };
  if (message.method === "initialize") { res.setHeader("Mcp-Session-Id", "fixture-session"); return reply({ protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fixture", version: "1" } }); }
  if (message.method === "notifications/initialized") { res.statusCode = 202; return res.end(); }
  if (message.method === "tools/list") return reply({ tools: [
    { name: "list_accounts", inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "get_profile", inputSchema: { type: "object", properties: { action: {}, org_uid: {}, role: {} }, required: ["action", "org_uid", "role"] } },
  ] });
  if (message.method === "tools/call" && message.params.name === "list_accounts") return reply({ structuredContent: { accounts: [{ org_uid: "org-1", role: "TALENT", name: "Fixture Person", profile_url: target }] } });
  if (message.method === "tools/call" && message.params.arguments.action === "get") return reply({ structuredContent: { profile: {
    profile_url: wrongIdentity ? "https://www.upwork.com/freelancers/~01aaaaaaaaaaaaaa" : target,
    title: "React Native Developer", overview: "I build reliable mobile products for growing teams with clear delivery plans and maintainable integrations.",
    skills: [{ name: "React Native" }, { name: "TypeScript" }],
  } } });
  if (message.method === "tools/call" && message.params.arguments.action === "list_highlights") return reply({ structuredContent: {
    profile_url: target,
    portfolio: [{ title: "Payments app", description: "Built checkout and subscription flows.", role: "Developer", skills: ["React Native"] }],
    certifications: [{ name: "Programming with JavaScript", issuer: "Meta" }],
  } });
  res.statusCode = 400; res.end();
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture");
  const options = { endpoint: `http://127.0.0.1:${address.port}/mcp`, allowLocalTest: true, timeoutMs: 5000 };
  const profile = await readMcpContentProfile("t".repeat(32), target, options);
  check("MCP transport imports only the five content fields", () => {
    assert.equal(profile.title, "React Native Developer"); assert.deepEqual(profile.skills, ["React Native", "TypeScript"]);
    assert.equal(profile.portfolio[0]?.title, "Payments app"); assert.equal(profile.certifications[0]?.name, "Programming with JavaScript");
    assert.equal("contracts" in profile, false); assert.equal("earnings" in profile, false);
  });
  const evidence = mcpContentEvidence(profile);
  check("held evidence excludes unavailable platform metrics", () => {
    assert.equal(evidence.snapshot.jss, null); assert.deepEqual(evidence.snapshot.unavailableSections, ["track", "offer"]); assert.ok(evidence.contentProfile);
  });
  const score = parseContentScores(JSON.stringify({
    title: { points: 16, note: "Clear role." }, overview: { points: 25, note: "Add stronger outcomes." }, skills: { points: 13, note: "Focused." },
    portfolio: { points: 14, note: "Add measurable results." }, certifications: { points: 7, note: "Relevant." }, topFlaws: ["Add results"], strengths: ["Focused skills"],
  }), profile);
  check("five-field score totals over exactly 100 points", () => { assert.equal(score?.assessedPoints, 100); assert.equal(score?.sections.length, 5); assert.equal(score?.score, 75); });
  wrongIdentity = true;
  await assert.rejects(() => readMcpContentProfile("t".repeat(32), target, options), (error: unknown) => error instanceof UpworkMcpError && error.code === "mismatch");
  checks++; console.log("ok - mismatched profile identity is rejected");
} finally { server.close(); await once(server, "close"); }
console.log(`${checks} checks passed`);
