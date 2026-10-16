# Upwork links through a dedicated browser

Clients submit a profile link. The Next.js server calls a private Playwright worker, which opens
that link using an operator-managed Upwork session. It expands the overview, reads the visible
profile text and returns evidence to the existing preview, audit and scoring flows. The AI key
remains on the app server. No Upwork API key is used.

This is a first implementation. Chromium extraction and the app adapter are tested with fixtures.
It has **not** been validated against a live signed-in Upwork account. Actual selectors, account
permissions and network access must be verified before enabling it for clients. It does not
bypass verification, CAPTCHA, login restrictions or rate limits. Operators handle sign-in/MFA.
A signed-in account does not guarantee that every profile or section is accessible.

## Deploy on Render

The repository's `render.yaml` declares the existing app plus a separate Docker web service,
`improvexus-upwork-browser`, with a 1 GB persistent disk mounted at `/var/data`. The browser
session lives at `/var/data/upwork-session`. A paid worker instance and disk incur Render charges;
the Blueprint selects `standard` for browser memory headroom. Deployment has not been performed
from this workspace. Check the plan and disk pricing in Render before creating the service.

Import or sync the Blueprint after these changes are committed to the deployed branch. Keep the
app's `UPWORK_BROWSER_URL` unset until the worker passes a real capture. Alternatively create the
Docker web service manually using `scripts/upwork-browser/Dockerfile`, repository root as Docker
context, Oregon region, port 3100, `/live` health check, and the persistent disk above. `/live`
checks only that the browser process started; it does not prove Upwork sign-in.

Set these worker environment values securely in Render:

- `UPWORK_BROWSER_TOKEN`: a private random value of at least 32 characters, also set on the app.
- `UPWORK_BROWSER_ADMIN_PASSWORD`: a separate private random value of at least 32 characters.
- `UPWORK_BROWSER_LOGIN_MODE=true` temporarily, for operator sign-in.
- `PORT=3100` (provided by the Blueprint).

The Docker image supplies Chromium, a virtual display and the desktop tools. It listens on
`0.0.0.0:$PORT`, as required for a Render web service. Session data belongs on the mounted disk,
not in the image or repository. Use one instance; the same browser profile cannot be shared by
multiple Chromium processes. Do not change the disk path between deploys.

### Sign in on Render itself

With login mode enabled, open the worker's HTTPS service URL followed by:

```text
/desktop/vnc.html?autoconnect=1&resize=scale&path=desktop/websockify
```

The browser asks for HTTP authentication. Username: `operator`. Password: the worker's
`UPWORK_BROWSER_ADMIN_PASSWORD`. This protects both desktop files and its WebSocket connection.
Use Render HTTPS. The VNC server and websockify are reachable only through the authenticated Node
proxy, not directly over public ports. The operator desktop is protected from framing and rejects
cross-origin WebSocket upgrades. Treat this password as access to the signed-in Upwork account.

Sign in to Upwork in the displayed browser and complete MFA yourself. Account passwords, cookies
and browser sessions must never be sent in chat, committed, or put in the application database.
The login runs on Render, so no local-to-cloud session transfer is required. Profile captures
return unavailable while login mode is enabled.

After sign-in, set `UPWORK_BROWSER_LOGIN_MODE=false` in Render and redeploy the worker. Render
must stop the old instance and preserve the mounted disk. The worker owns SIGTERM handling so Playwright does not exit before session state is flushed.
The entrypoint closes Chromium before stopping its display on SIGTERM and takes an exclusive
filesystem lease on the session directory. It clears only Chromium’s temporary Singleton IPC
locks before startup, because old container hostnames otherwise block restarts. Cookies, local
storage and profile preferences are retained. The desktop and VNC services are disabled in normal mode; `/desktop/` returns 404.
If a deployment interrupts the session, repeat the operator sign-in instead of deleting session
files or manufacturing credentials. Session expiry and Upwork verification can recur.

### Connect the app and check a real link

Copy the same `UPWORK_BROWSER_TOKEN` into the app's Render environment and set
`UPWORK_BROWSER_URL` to the worker's HTTPS service origin (no trailing path). This server credential
is independent of Upwork; there is no Upwork API key. The app's AI and database settings remain
required. Restart the app after setting the URL. Keep the token and admin password out of any
`NEXT_PUBLIC_` variables. If testing from this cloud workspace, add only the actual worker
hostname to its restricted network allowlist after Render assigns the service URL.

`GET /health` requires bearer authentication and proves the worker is reachable. `POST /capture`
requires the same bearer authentication, `Content-Type: application/json`, and JSON
`{"url":"https://www.upwork.com/freelancers/PROFILE_ID"}`. It must return `ok: true`, the matching
profile URL, an overview of 80–5000 characters and correct visible profile text. Verify the text
against the actual page before enabling the app URL. Use a private operator tool or server script
that reads the token from environment; do not paste credentials into commands or logs.

Then submit only a link through the app and confirm the right person's overview is scored and
the preview contains the expected evidence. The form hides pasted-overview controls when the
worker URL is configured. Test a worker restart to confirm the Render disk retains the session.
If Upwork blocks access, shows verification or changes its DOM, the live milestone remains open;
fixture tests cannot establish that production access will work.

## Run locally or on another host

Use Node >=20, `npm ci`, and either `npx playwright install --with-deps chromium` or a system
Chromium selected by `UPWORK_BROWSER_EXECUTABLE_PATH`. This workspace uses `/usr/bin/chromium`.
Bundled browser downloads from cdn.playwright.dev were blocked by its network policy. Chromium
and Debian packages in the Docker image use the distribution's verified package repositories.

For a desktop login outside Docker, set `UPWORK_BROWSER_SESSION_DIR` to a private absolute
directory outside the checkout and run `npm run browser:login`. Stop the worker first. Then run
`npm run browser:worker` with the same session directory and `UPWORK_BROWSER_TOKEN`. Local workers
bind to 127.0.0.1:3100 by default; `UPWORK_BROWSER_HOST` and `PORT` are overridden in Render.
`UPWORK_BROWSER_HEADED=true` is used in the Render image with its virtual display.

## Operation and limits

Capture uses one browser page at a time and allows at most one attempt per 15 seconds. Busy
requests fail promptly for retry; this first version has no durable queue. There are no automatic
capture retries, proxy rotation, stealth settings or automated challenge solving. Login-required,
blocked, incomplete, wrong-profile and oversized results are rejected. App capture failures refund
the scoring allowance and do not trigger an AI call. A lead can still be saved for follow-up.

On login expiry, re-enable login mode, sign in through the operator desktop, then disable it and
redeploy. If the DOM changes, inspect the overview selectors in `scripts/upwork-browser/core.mjs`
against actual authorized page evidence. The full audit uses visible text; paginated history,
unopened portfolio details and visual design are not guaranteed captured. Missing evidence must
remain unverified. Screenshots/OCR are not implemented yet. Disk backups contain account session
credentials and must be kept private.

Local automated checks (no Upwork or AI credentials):

```sh
UPWORK_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:local:browser
UPWORK_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:local:desktop
npm run test:local:profile-score
npm run test:local:marketing
npm run build
# After building the Docker image with tag standalone-upwork-browser:test:
node scripts/local-tests/upwork-render.local-test.mjs
```

The browser suite runs actual Chromium against intercepted fixture pages and a local worker stub.
The desktop suite checks HTTP authentication and real Chromium WebSocket access through the
operator proxy, including rejection of cross-origin access. These do not establish live Upwork
compatibility, Render deployment, or external AI/database readiness.

The container smoke test uses an isolated temporary volume, fake service credentials and disabled
outbound networking. It checks the actual noVNC-to-display connection, login-mode capture pause,
and a fresh-container restart using the same volume. It verifies retained Chromium profile files,
not survival of a real Upwork login. Temporary containers and the test volume are removed afterward.
