# Do now — while Twilio reviews

Four tasks, about 35 minutes total. Work top to bottom. Everything is copy-paste.

---

## 1 · Send Autostaff the updated brief — 1 min

They're building against rev 1, which had voice as the primary channel. Your markets invert that.

Send them `docs/autostaff-voice-brief.md` and say: **"Revision 2 — supersedes what I sent earlier. Markets are US, UAE, Australia and Europe, so it's message-first now. The 'What changed and why' section explains it."**

---

## 2 · Fix the LinkedIn Lead Gen Form — 10 min

LinkedIn Campaign Manager → your form → edit.

### Fields to have

| Field | Setting |
|---|---|
| First name, Last name | keep |
| Work email | keep, required |
| **Phone number** | **add, required** — no phone, no contact |
| Company name | keep |
| Job title | keep |

### Add one custom question

> **What are you looking to make?**
> - An ad or film
> - An AI solution
> - Not sure yet

Routes the agent's opening line and gives you cost-per-lead split by what people actually want — which is what tells you where the ad budget should go.

### Add the consent checkbox — this is the important one

Custom checkbox, **required**:

> I agree that RIZZ may contact me about this enquiry by phone and WhatsApp, including automated AI-assisted calls, and may record calls for quality purposes. I can withdraw at any time by replying STOP or asking to be removed.

Shorter version if LinkedIn's character limit bites:

> I agree RIZZ may contact me by phone and WhatsApp about this enquiry, including AI-assisted calls, and may record calls. Reply STOP to opt out.

**Why the exact wording matters.** It has to hold in four jurisdictions at once: US TCPA needs prior express written consent naming automated calls; Australia's Do Not Call Register needs explicit, documented consent; GDPR needs it specific, informed and withdrawable; the EU AI Act needs the AI element disclosed. The sentence above covers all four. Don't soften it to "we may be in touch."

**This is the one thing that cannot be backfilled.** Every lead who arrives before this checkbox exists is a lead you cannot legally call. Do it before the ads run again.

---

## 3 · Set up the ElevenLabs agent — 15 min

No phone number needed. You're building it now so that the moment Twilio clears, you attach the number and start calling.

<https://elevenlabs.io/app/sign-up> → **Creator** plan ($22/mo) → **Agents → Create Agent** → blank.

### First message

```
Hi — this is an AI assistant from RIZZ, calling about the form you just filled in. I'll keep this to two questions.
```

Temporary. Once the enrichment service is live this gets replaced by `{{opener}}`, which builds a personalised version per lead.

### System prompt

Copy the entire fenced block from `docs/agent-prompt.md`, section **System prompt**. It's long — take all of it, from `# Who you are` down to the end of the Language section.

### Settings

| Setting | Value | Why |
|---|---|---|
| Voice | plain, mid-paced | Avoid breathy or over-warm — reads as fake on a cold call |
| Language | English | It switches per the prompt's Language section |
| Max duration | 180 seconds | The prompt targets under 3 minutes; this enforces it |
| Interruptions / barge-in | **on** | Non-negotiable. Without it, it talks over people |
| Silence threshold | 300–500 ms if exposed | The single biggest latency win available |

Leave tools empty for now — booking and do-not-contact come after Cal.com and Airtable exist. The agent will offer a meeting it can't yet make, which is fine for testing the conversation.

---

## 4 · Deploy the enrichment service — 5 min

The one piece of finished code with a line that has never actually run.

1. <https://console.anthropic.com> → **API Keys** → create one. Add $5 credit.
2. <https://railway.app> → Login with GitHub → New Project → Deploy from repo → `wreckage-clips`
3. Service settings:

| Setting | Value |
|---|---|
| Root Directory | `services/lead-enrichment` |
| Variable | `ANTHROPIC_API_KEY` = your key |
| Variable | `ENRICH_SHARED_SECRET` = run `openssl rand -hex 32` and paste the output |

4. **Settings → Networking → Generate Domain**

5. Test it:

```bash
curl https://YOUR-APP.up.railway.app/healthz

curl -X POST https://YOUR-APP.up.railway.app/enrich \
  -H 'content-type: application/json' \
  -H 'x-enrich-secret: YOUR_SECRET' \
  -d '{"name":"Toms","email":"toms@stripe.com","caller_name":"RIZZ"}'
```

If the second one comes back with real facts about Stripe and a written opener, the enrichment step is proven. Paste me the output either way.

---

## Then

Everything else waits on the Twilio compliance profile. When the approval email lands:

1. Buy **one** US local number, **Voice** only
2. **Voice → Settings → Geo Permissions** → enable US, UAE, Australia, your European countries
3. Attach the number to the ElevenLabs agent, **inbound**
4. Ring it from your mobile and run the eight tests in `docs/agent-prompt.md`
