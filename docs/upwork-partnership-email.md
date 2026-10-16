# Drafts for Upwork (not sent)

## 1. Email to partnerships@upwork.com

Subject: Commercial API access request: customer-authorized profile audit tool (Improvexus)

Hello,

I run Improvexus, a small agency that helps Upwork freelancers improve their profiles and proposals.
We are building a profile audit tool at https://www.improvexus.com/profile-score and would like to
use Upwork's official API the supported way, so I am asking before we build further.

What we want to do: a freelancer clicks "Connect Upwork", signs in on upwork.com and approves read
access to their own profile. We read that profile once (title, overview, skills, work history,
portfolio), score it, show the result to that freelancer, and keep nothing beyond 15 minutes. We do
not store tokens, do not read anyone else's profile, do not resell or aggregate the data, and delete
it on request. Our paid audit uses the same authorized data to write recommendations for that
freelancer.

Questions:
1. Does this need commercial API approval, given that we also sell paid audits? If so, what is the process?
2. Is the "Freelancer Profile" scope enough for a freelancer to read their own profile through
   talentProfileByProfileKey, and how should the app obtain that user's profile key after sign-in?
3. Are overview text, skills, employment records and portfolio items returned for the signed-in user?
   Are Job Success Score and hourly rate available to the user's own app?
4. Would public-profile lookups by profile link (for a freelancer who has not connected) be permitted,
   or must the profile owner always authorize access?
5. May a third-party app act as a client of the Upwork MCP server for this purpose?

Account details for the key: <your Upwork account name and profile link>.

Thank you,
<name>, Improvexus

## 2. Key application: "intended use" text

Internal and customer-facing profile audit tool. Each freelancer authorizes access to their own
profile through OAuth2; the app reads it once to score it and discards the access token immediately.
Profile text is held for at most 15 minutes and then deleted. No scraping, no bulk collection, no
data resale. Requested scope: Freelancer Profile (read). Callback: https://www.improvexus.com/api/upwork/callback

## 3. If they say no

Fall back to the existing link + pasted overview flow. Do not deploy the browser worker without
Upwork's written permission.
