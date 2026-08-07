# Account setup checklist

EU-first, Railway hosting. Roughly 35 minutes of clicking. Nothing here blocks on anything else except where noted.

**Don't paste API keys into chat.** They go into Railway's environment variables and each tool's own connection settings. I never need to see one.

---

## 1. Anthropic — 2 min · pay-as-you-go

<https://console.anthropic.com> → sign up → **API Keys** → Create Key.

Powers the enrichment service. Add $5 of credit; at 50 leads/month that lasts over a year.

→ Paste the key into Railway as `ANTHROPIC_API_KEY` (step 7). Nowhere else.

## 2. ElevenLabs — 3 min · $22/mo

<https://elevenlabs.io/app/sign-up> → **Creator** plan → **Agents** in the sidebar → Create Agent.

Leave the agent empty for now — I'll give you the full prompt to paste in. While you're there, browse voices and note two or three you'd be happy to be called by; we'll A/B them in Phase 2.

## 3. Twilio — 10 min · ~$1–15/mo ⚠️ read the note

<https://www.twilio.com/try-twilio> → verify email and phone → upgrade from trial (trial numbers can only call verified numbers, which is useless here).

Then **Phone Numbers → Buy a number**, filter by the country you're calling into.

> ⚠️ **EU numbers have their own paperwork.** Latvia, Estonia, Lithuania and most EU countries require a Twilio *Regulatory Bundle* — proof of local address, sometimes a local entity — before they'll sell you a number. Twilio shows the requirement on the number before you buy. It's usually 1–3 days, not the two weeks 10DLC would have been, but it's not instant.
>
> **If your bundle isn't ready:** buy a **UK number** (`+44`) instead and start there. UK numbers have no bundle requirement, work fine for outbound across Europe, and you can swap to a local number later without touching any code. Don't let this hold up week one.

→ Note the number and keep the Account SID / Auth Token in Twilio; ElevenLabs will ask for them when you connect the two.

## 4. Make.com — 3 min · free to start, $9/mo when live

<https://www.make.com/en/register> → free tier is fine until you're actually running leads.

Then **Connections → Add** → search **LinkedIn Lead Forms** → authorise with the LinkedIn account that has admin on the ad account.

→ Tell me once this connects. If LinkedIn refuses the authorisation it's almost always an ad-account permission problem, not a Make problem, and I'll walk you through it.

## 5. Airtable — 2 min · free

<https://airtable.com/signup> → create a workspace. Don't build the base — I'll give you the schema and a script that creates every field with the right type.

## 6. Cal.com — 3 min · free

<https://app.cal.com/signup> → connect Google Calendar → create an event type ("Intro call", 30 min).

→ **Settings → Developer → API Keys** → create one. This is what lets the agent book a meeting during the call, which is the single highest-value thing in the build.

## 7. Railway — 5 min · free tier covers this

<https://railway.app> → **Login with GitHub** → New Project → Deploy from GitHub repo → pick `wreckage-clips`.

Then in the service settings:

| Setting | Value |
|---|---|
| Root Directory | `services/lead-enrichment` |
| Variables | `ANTHROPIC_API_KEY` = your key from step 1 |
| Variables | `ENRICH_SHARED_SECRET` = any long random string — generate with `openssl rand -hex 32` |

Railway auto-detects Node and runs `npm start`. Once it deploys, **Settings → Networking → Generate Domain**.

→ Check it's alive: `curl https://your-app.up.railway.app/healthz` should return `{"ok":true}`.

→ Then the real test, from your laptop:

```bash
curl -X POST https://your-app.up.railway.app/enrich \
  -H 'content-type: application/json' \
  -H 'x-enrich-secret: <your secret>' \
  -d '{"name":"Toms","email":"toms@stripe.com","caller_name":"Acme"}'
```

That's the first end-to-end proof that the Anthropic call works — it hasn't been run yet.

---

## What blocks what

Nothing blocks anything, except:

- **Twilio number** → needed before the agent can make or take a call (Phase 2). If the EU bundle is slow, use a UK number.
- **LinkedIn connection in Make** → needed before any lead can arrive (Phase 1). Do this one first if you only have time for one.
- **Anthropic key + Railway** → needed before enrichment works, but the pipeline runs fine without it.

## Not yet, deliberately

- **A2P 10DLC** — US only. Skip it until the US is actually in scope, then start it two weeks before you need it.
- **A paid Airtable seat** — the free tier holds over a year at this volume.
- **LinkedIn Marketing API access** — the 4-week-to-4-month approval queue. Worth applying for in the background if you want to drop Make eventually; not worth waiting on.
