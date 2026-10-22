# Upwork profile import through the official MCP server

Improvexus uses Upwork's OAuth-protected MCP endpoint to import a customer's own profile after the customer signs in and approves access. It imports only the profile title, overview, skills, portfolio, and certifications. The site does not request or assess earnings, Job Success Score, badges, rates, reviews, or contracts.

The customer first enters the exact Upwork profile URL. After OAuth, the returned profile identity must match that URL. A mismatch is rejected. The OAuth access token is held only for the request to Upwork and is never written to the database, logs, cookies, or browser storage. Imported evidence expires after 15 minutes unless the customer submits it to the existing score or audit workflow.

## Environment

```dotenv
UPWORK_MCP_ENABLED=true
UPWORK_MCP_APP_ORIGIN=https://www.improvexus.com
UPWORK_MCP_SESSION_SECRET=<at-least-32-random-characters>
```

By default the app publishes an OAuth Client ID Metadata Document at `/api/upwork/mcp/client`. If Upwork supplies a registered OAuth client instead, also set `UPWORK_MCP_CLIENT_ID` and, only when issued, `UPWORK_MCP_CLIENT_SECRET`.

The callback is `https://www.improvexus.com/api/upwork/mcp/callback`. The configured origin is canonical and request host headers cannot change it.

## User flows

- `/profile-score`: enter the profile link, contact details and consent, then select **Connect Upwork and import this profile**.
- `/audits`: sign in, enter the profile link, then connect Upwork. The imported five fields appear in the review step before the audit is generated.
- A connected audit marks every criterion outside the five imported profile fields as not assessed, so missing metrics cannot lower the score.

## Verification

Run `npm run test:local:upwork-mcp` for the local Streamable HTTP MCP fixture and OAuth security checks. Run `npm run build` before deployment. A final production check requires a real Upwork consent because access tokens and user authorization cannot be simulated.

The old persistent browser worker is intentionally absent from `render.yaml`; synchronizing the blueprint will not recreate that paid service.
