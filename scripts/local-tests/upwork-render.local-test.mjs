// Requires a locally built image: docker build -f scripts/upwork-browser/Dockerfile -t standalone-upwork-browser:test .
// Uses an isolated Docker volume, no network and fake service credentials. No Upwork sign-in.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const suffix = randomUUID();
const volume = `upwork-render-test-${suffix}`;
const name = `upwork-render-test-${suffix}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
const env = ['-e', 'UPWORK_BROWSER_TOKEN=render-test-token-not-a-real-credential', '-e', 'UPWORK_BROWSER_ADMIN_PASSWORD=render-test-password-not-a-real-credential'];
function start(loginMode) {
  docker(['run', '-d', '--name', name, '--network=none', '--shm-size=256m', '-v', `${volume}:/var/data`, ...env,
    '-e', `UPWORK_BROWSER_LOGIN_MODE=${loginMode}`, 'standalone-upwork-browser:test']);
  docker(['exec', '-i', name, 'node', '--input-type=module'], `
    let ok = false;
    for(let i=0;i<80;i++) {
      try { if((await fetch('http://127.0.0.1:3100/live')).status===200){ok=true;break;} } catch {}
      await new Promise(r=>setTimeout(r,500));
    }
    if(!ok) throw new Error('Worker did not become live');
  `);
}
function stop() {
  docker(['stop', '-t', '15', name]);
  docker(['rm', name]);
}
docker(['volume', 'create', volume]);
try {
  start(true);
  docker(['exec', '-i', name, 'node', '--input-type=module'], `
    import assert from 'node:assert/strict';
    import { chromium } from 'playwright';
    const origin='http://127.0.0.1:3100';
    assert.equal((await fetch(origin+'/desktop/vnc.html')).status,401);
    const capture=await fetch(origin+'/capture',{method:'POST',headers:{Authorization:'Bearer '+process.env.UPWORK_BROWSER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({url:'https://www.upwork.com/freelancers/~test'})});
    assert.equal(capture.status,503);
    const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
    try {
      const context=await browser.newContext({httpCredentials:{username:'operator',password:process.env.UPWORK_BROWSER_ADMIN_PASSWORD}});
      const page=await context.newPage();
      await page.goto(origin+'/desktop/vnc.html?autoconnect=1&resize=scale&path=desktop/websockify');
      await page.waitForFunction(()=>document.documentElement.classList.contains('noVNC_connected'),{},{timeout:15000});
      assert.ok(await page.locator('canvas').count());
    } finally { await browser.close(); }
    console.log('ok - container desktop authenticates and connects noVNC to the live browser display');
    console.log('ok - captures are paused during operator login');
  `);
  console.log('ok - container desktop authenticates and connects noVNC to the live browser display');
  console.log('ok - captures are paused during operator login');
  stop();
  start(false);
  docker(['exec', '-i', name, 'node', '--input-type=module'], `
    import assert from 'node:assert/strict';
    import { stat } from 'node:fs/promises';
    const origin='http://127.0.0.1:3100';
    assert.equal((await fetch(origin+'/desktop/vnc.html')).status,404);
    assert.equal((await fetch(origin+'/health',{headers:{Authorization:'Bearer '+process.env.UPWORK_BROWSER_TOKEN}})).status,200);
    assert.ok((await stat('/var/data/upwork-session/Default/Preferences')).isFile());
  `);
  console.log('ok - normal-mode restart disables desktop and retains Chromium profile files on the volume');
  stop();
} catch (error) {
  const logs = spawnSync('docker', ['logs', '--tail', '20', name], { encoding:'utf8' });
  console.error(logs.stderr || logs.stdout);
  throw error;
} finally {
  spawnSync('docker', ['rm', '-f', name], { encoding:'utf8' });
  spawnSync('docker', ['volume', 'rm', volume], { encoding:'utf8' });
}
console.log('3 Render-container smoke checks passed (no live account)');
