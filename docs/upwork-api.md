# Connect Upwork (official API)

The supported way to get a customer's real Upwork profile into the score and audit with almost no
effort from them: they click **Connect Upwork**, sign in on upwork.com, approve read access to their
OWN profile, and Upwork sends them back. No link is pasted, nothing is scraped, no password or
browser session is held. It is switched off until an Upwork API key exists
(`UPWORK_API_CLIENT_ID` / `UPWORK_API_CLIENT_SECRET`).

The browser worker described in `docs/upwork-browser.md` is a different, unapproved route (see below)
and is untouched by this feature.

## Status, in three columns

**Verified (against Upwork's own pages, 2026-10-16)**

- Upwork's Terms of Use (section 3.5) ban robots, spiders and scrapers without written permission,
  and accessing Upwork through anything other than its interface. The API terms also ban
  downloading or scraping the site and proxying Upwork usernames/passwords.
- A key is requested at upwork.com/developer/keys/apply. Requirements stated by Upwork: identity
  verification, a verified payment method, at least $25,000 lifetime earnings or spend, a Job
  Success Score of at least 90% for freelancer or agency accounts, an account in good standing.
  Decisions usually take about a week.
- Upwork's key guide says the API is for personal and internal use only. Its "Commercial API use"
  page says commercial access is for select partners with prior written permission
  (partnerships@upwork.com). Whether a paid audit product counts as commercial is not stated.
- OAuth2 authorization-code flow exists: the user is redirected to Upwork to approve, the app never
  sees their credentials. Access tokens last 24 hours, refresh tokens 2 weeks.
  GraphQL endpoint: `https://api.upwork.com/graphql`. Scope needed for profiles: "Freelancer Profile".
- Documented profile queries: `talentProfileByProfileKey` (name, title, skills, employment records,
  project list, aggregates), `freelancerProfileByProfileKey` (brief), and a search whose results
  include `personalData.description`.

**Assumed (the code relies on these; nothing here is proven)**

- The hosts for the sign-in page and token endpoint (the docs give paths only). Overridable by env.
- That Upwork returns the `state` parameter. If not, the callback refuses every sign-in (fails closed).
- How to learn who just signed in: `query { user { id publicUrl } }`. Upwork's docs do not show this.
  Without it the app cannot show the profile is the customer's own, so it reads nothing.
- Subfield names inside `skills`, `employmentRecords` and `projectList`. The richest selection is
  tried first; if Upwork rejects it the code falls back to documented fields only and lists what is
  missing (`ConnectedEvidence.missing`). Job Success Score, hourly rate and hours are not exposed by
  any documented profile selection, so the connected score treats them as "not checked", never guessed.
- That the "Freelancer Profile" scope allows a customer to read their own profile through these queries.

**Needs your action**

1. Check your Upwork account against the key requirements above (or use a qualifying client account).
2. Email Upwork partnerships (draft in `docs/upwork-partnership-email.md`) BEFORE building further
   on it: ask whether a paid audit product may use customer-authorized profile data, and whether
   public-profile lookups by link are permitted.
3. Apply for the key (application text in the same file). Callback URL to register:
   `https://www.improvexus.com/api/upwork/callback`. Scope: Freelancer Profile (read) and, if offered
   separately, View UserDetails (read).
4. When the key arrives, run the probe on your own computer (below) BEFORE adding the key to Render.
5. Apply `drizzle/0011_upwork_connections.sql` to Supabase, then add the two env vars to Render and redeploy.

## How a visit works

1. The visitor enters WhatsApp and ticks consent, then presses **Connect Upwork**. Those details wait
   in this tab's session storage (never sent anywhere) while they are away.
2. `/api/upwork/connect` sets a random `state` cookie and sends them to Upwork.
3. Upwork sends them to `/api/upwork/callback?code=…&state=…`. The callback checks the state, trades
   the code for a token (secret in the request body), reads identity then the profile, stores the
   customer's profile text in `upwork_connections` for 15 minutes, drops the token, and sets a
   cookie holding the row's random id. It is rate limited per network address.
4. The page sees `?connected=1` and posts to `/api/profile-score` with `connected: true`. The server
   reads the held row named by the cookie, scores that evidence, deletes the row, clears the cookie.
   If scoring fails the row stays so a retry needs no new sign-in; if the row has expired the visitor
   is asked to connect again. No allowance is spent on failures.

## What is stored

Only the profile text and facts read (title, overview, skills, work history, portfolio titles, a few
counts) for at most 15 minutes, in a table closed to everything but the server. Never the access
token, refresh token, Upwork password or cookies. The Upwork API terms require deleting Upwork data
on a user's request: deleting the row (or waiting 15 minutes) does that.

## Probe: find out what Upwork really returns

Run on your own computer once the key exists, BEFORE adding it to Render:

```sh
UPWORK_API_CLIENT_ID=... UPWORK_API_CLIENT_SECRET=... \
UPWORK_API_REDIRECT_URI=https://www.improvexus.com/api/upwork/callback \
npm run upwork:api-probe
```

It prints an Upwork sign-in address, you approve as yourself, paste back the address Upwork sends
you to, and it writes `upwork-probe-report.json`: whether `state` came back, whether each identity
and profile selection was accepted, and (if Upwork allows introspection) the real field names under
the profile type. Strings in the report are replaced by their length, so it holds no profile text and
is safe to share. Then `IDENTITY_QUERIES` and `PROFILE_SELECTIONS` in `lib/upwork-connected.ts` are
corrected in one place.

## Tests

```sh
npm run test:local:upwork-api   # 21 checks, mock Upwork, needs Postgres with migration 0011
npm run test:local:upwork-e2e   # 13 checks: real app in dev mode + mock Upwork + stub AI, every failure path
```

Both run against a mock built from the assumptions above. They prove the app's side of the flow
(state check, no token stored, single-use row, ownership, fail-closed paths) and cannot prove what
Upwork will return.

## Not part of this route

- Reading a profile from a pasted link alone, for an arbitrary freelancer, is not provided. Without
  the customer's sign-in the only options are a scraper (not permitted by Upwork's terms) or a
  public-profile API lookup whose permitted use has to be confirmed with Upwork first.
- Customers who do not connect keep the existing flow: link + pasted overview.
- The full audit does not use Connect yet. `evidenceText()` already produces the `profileText` for it;
  wiring it in waits for the probe, so the audit is built on fields that really arrive.
