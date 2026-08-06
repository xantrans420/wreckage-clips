# LinkedIn Ads → AI Voice / SMS Follow-up → Single Source of Truth

**Roadmap, system choices, and costs**

Prepared: August 2026
Assumptions confirmed with stakeholder: global / mixed targeting, **under 50 leads/month**, LinkedIn Ads account already running, **hybrid build** (no-code orchestration + custom voice-agent logic).

---

## 1. What you're actually asking for

Restated plainly, so we're building the same thing:

> A lead sees a LinkedIn ad and fills in a form. Within a minute or two they either (a) get a phone call from an AI agent that qualifies them and books a meeting, or (b) get an SMS — **their choice, made on the form**. Everything that happens — the lead data, the call recording, the transcript, the outcome — lands in **one place** you can open and read.

Three things are worth naming up front, because they change the design:

1. **The channel choice must be captured at form-fill time.** It's a field on the LinkedIn Lead Gen Form ("How should we follow up? → Call me / Text me"). It is not something the system guesses.
2. **"One place" should be a database, not a social channel.** Google Drive works. Airtable works better. TikTok and X/Twitter are publishing channels — they can't store or query lead records, so they're out of scope for the store (they may matter later for retargeting, which is a different project).
3. **At under 50 leads/month, tooling cost is noise.** LinkedIn B2B cost-per-lead typically runs $50–150, so 50 leads/month means roughly **$3,000–7,500/month in ad spend**. The entire automation stack below costs **~$70–130/month**. You are optimizing the ~2% tail. Optimize for *speed to launch and lead experience*, not for saving $20/month on an orchestrator.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LinkedIn Sponsored Content / Conversation Ad                   │
│  → Lead Gen Form                                                │
│     fields: name, email, company, job title, PHONE,             │
│             + custom Q: "Prefer a call or a text?"              │
│             + consent checkbox (calls / SMS / AI disclosure)    │
└────────────────────────────┬────────────────────────────────────┘
                             │  LinkedIn Lead Sync
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR   n8n (self-hosted or cloud) or Make.com          │
│  • normalize + validate phone (E.164, lookup carrier/type)      │
│  • dedupe on email + phone                                      │
│  • assign lead ID, write record  ───────────────┐               │
│  • branch on channel choice                     │               │
└──────────┬─────────────────────────┬────────────┼───────────────┘
           │ "Call me"               │ "Text me"  │
           ▼                         ▼            │
┌──────────────────────┐   ┌──────────────────┐   │
│ VOICE                │   │ SMS              │   │
│ ElevenLabs Agents    │   │ Twilio Messaging │   │
│  over Twilio number  │   │  (or WhatsApp)   │   │
│ • qualify (BANT-ish) │   │ • intro + link   │   │
│ • book meeting via   │   │ • 2-way replies  │   │
│   Cal.com tool call  │   │   → LLM handler  │   │
│ • retry ladder on    │   │ • escalate to    │   │
│   no-answer          │   │   human on ask   │   │
└──────────┬───────────┘   └────────┬─────────┘   │
           │ post-call webhook      │             │
           │ (transcript, audio,    │             │
           │  structured summary)   │             │
           ▼                        ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│  SINGLE SOURCE OF TRUTH                                         │
│  Airtable base "Leads"   (+ Google Drive folder for audio)      │
│  one row per lead: contact · channel · attempts · transcript    │
│  · recording link · qualification score · outcome · next step   │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   Cal.com booking    Slack/email alert    LinkedIn Conversions API
   → Google Calendar  for hot leads        (feeds ad optimization)
```

---

## 3. The one thing that will bite you: speed-to-lead

Everything else here is standard plumbing. This is the part that decides whether the project works.

**The problem.** LinkedIn Lead Gen Form responses reach Zapier/Make/n8n via LinkedIn's Lead Sync, and the connectors for it are **polling-based**, not push. Real-world latency is typically **1–15 minutes**, and heavy polling is a known source of duplicated and dropped leads. Meanwhile the whole value of an AI voice agent is calling while the lead still has the tab open.

**Three ways out, in order of preference:**

| Option | Latency | Trade-off |
|---|---|---|
| **A. Use your own landing page instead of the LinkedIn native form** — ad click → your page → form posts a true webhook | < 5 seconds | Lower conversion rate than native Lead Gen Forms (typically 2–5× worse), because the lead has to type. But you get instant, reliable, fully-controlled data. |
| **B. Native form + fastest available poll**, accept 1–5 min | 1–5 min | Best form conversion, acceptable call timing. Requires dedupe logic to survive polling glitches. |
| **C. Run both** — native form as primary, landing page for retargeting/high-intent audiences | mixed | What I'd actually recommend after week 4, once you know your CPL on each. |

**Recommendation: start with B**, instrument the actual lead-to-dial latency from day one (log `linkedin_submitted_at` vs `first_dial_at` on every row), and only build A if the measured median exceeds ~5 minutes.

---

## 4. System choices

### 4.1 Voice agent platform

| Platform | All-in cost/min | Why you'd pick it | Why you wouldn't |
|---|---|---|---|
| **ElevenLabs Agents** ✅ *recommended* | ~$0.08–0.15 | Best voice quality by a clear margin; single vendor for STT+LLM+TTS+telephony; native Twilio integration and SIP trunking; built-in **post-call webhooks** returning transcript + recording + structured analysis; batch calling; strong multilingual coverage (matters for "global"). | Less modular — you can't freely swap the LLM layer. Billed on wall-clock conversation time, so silence and hold time still costs. |
| **Vapi** | ~$0.13–0.32 | Maximum modularity: pick your own STT, LLM, TTS. Good if you want to A/B model stacks. | You assemble and pay for every layer separately ($0.05/min orchestration fee *on top of* provider costs). More moving parts to debug. |
| **Retell AI** | ~$0.11–0.15 | Nice middle ground, production-focused features, easy to operate. | Smaller ecosystem; voice quality behind ElevenLabs. |
| **OpenAI Realtime (gpt-realtime-2.1)** | ~$0.06–0.11 with prompt caching; **$0.18–0.46 without** | Cheapest raw model cost if you get caching right, and the reasoning is excellent. | It's an API, not a platform — you build telephony, barge-in, retries, recording, transcript storage, and the webhook layer yourself. That's the 4–8 weeks of dev you said you didn't want. Cost blows out 3–4× if caching isn't working, which is a genuinely easy mistake. |

**Verdict:** ElevenLabs Agents. At 50 leads/month the per-minute difference between all four options is **under $10/month** — literally irrelevant. Pick on voice quality, multilingual coverage, and how little you have to build. ElevenLabs wins all three.

### 4.2 Orchestration

| | Make.com | n8n Cloud | n8n self-hosted ✅ |
|---|---|---|---|
| Price | $9–16/mo (10k credits) | $20/mo (2,500 executions) | ~$6–12/mo VPS |
| Billing unit | **per operation** — a 3-step scenario easily burns 8–15 ops per run | **per full workflow execution**, regardless of node count | unlimited |
| Custom code | limited | full JS/Python nodes | full |
| Self-host | ❌ impossible | ❌ | ✅ |

At 50 leads/month all three are comfortably inside their entry tier, so this is a **control** decision, not a cost decision. **n8n** (cloud first, self-host later) fits the hybrid brief: you get a visual canvas for the boring parts and real code nodes for the retry ladder, phone normalization, and SMS reply handling. Make's per-operation billing is the thing that punishes you later when volume grows — a 12-step scenario at 500 leads/month is a very different bill than it looks like on the canvas.

### 4.3 The single source of truth

| | Google Sheets + Drive | **Airtable** ✅ | HubSpot Free |
|---|---|---|---|
| Cost | $0 (you have Workspace) | Free ≤1,000 records; Team $20–24/seat/mo | $0 for 2 users, 1,000 contacts |
| Fit | Fine at this volume. Breaks down past ~5k rows and has no real record view. | Purpose-built: attachments (recordings), linked tables (Lead ↔ Call Attempts ↔ Meetings), Interfaces for a clean read-only dashboard, good API. | A real CRM with LinkedIn's native integration — but free tier caps hard (1,000 contacts, 2 users, 10 custom properties, single-step automations only) and pushes you to paid within 6–12 months. |

**Recommendation: Airtable free tier** as the operational store — 50 leads/month is 600 records/year, so the free 1,000-record cap holds for over a year — with **call recordings written to a Google Drive folder** and linked by URL from the Airtable row. That satisfies "everything in one place" (one Airtable view is the place) without paying $24/seat before there's a pipeline to justify it, and without stuffing large audio files into a database.

Do **not** use TikTok or X as the store. They can't hold structured records and you'd be putting lead PII on a public-facing platform.

### 4.4 Everything else

- **Telephony:** Twilio. One local number per major market. Global reach, and ElevenLabs has a native integration plus SIP trunking, so no glue code.
- **Booking:** Cal.com (free tier is generous, clean API) → writes into Google Calendar. The voice agent books it directly via a tool call during the conversation. This is the single highest-value feature in the whole build — do not settle for "we'll email you a link."
- **Alerts:** Slack or email on a qualified lead. Humans need to know within seconds when something is hot.
- **Attribution loop:** push booked-meeting events back to **LinkedIn Conversions API**. This is what makes the ads get cheaper over time — you're teaching LinkedIn what a good lead looks like, not just what a form-fill looks like.

---

## 5. Compliance — read this before writing any code

You selected **global / mixed** targeting, which means you inherit the strictest rule in every market you touch. This is the part of the project most likely to cause real damage, and it costs almost nothing to get right up front.

**AI disclosure — this is live now.** The EU AI Act's Article 50 transparency obligations apply from **2 August 2026**. Systems interacting with people must disclose that they are AI. Several US states (California, Utah among them) have parallel bot-disclosure rules. **The agent must state it's an AI assistant in the first few seconds of every call.** Build it into the opening line; don't treat it as a setting someone can toggle off.

**Consent must be explicit and captured at form-fill.** The LinkedIn Lead Gen Form needs a consent checkbox covering: contact by phone, contact by SMS, and call recording. Store the consent text, timestamp, and IP alongside the lead record — if a complaint arrives 18 months later, that row is your entire defence.

**Per-market specifics:**

| Market | Requirement | Cost / lead time |
|---|---|---|
| **US** | A2P 10DLC brand + campaign registration is mandatory for SMS. TCPA requires prior express written consent for autodialed calls and texts. Calling hours 8am–9pm *recipient's* local time. Two-party consent for recording in ~12 states. | ~$4 one-off brand fee + $2–10/mo campaign; **1–2 weeks lead time — start this first** |
| **UK / EU** | GDPR lawful basis (consent), ePrivacy rules on direct marketing, right to erasure — so recordings need a retention policy and a deletion path. Sender-ID registration varies by country. | ~$0, but 1–2 days of setup |
| **Everywhere** | Honour opt-outs instantly. STOP keyword on SMS (Twilio handles this natively), and a "do not call me again" intent handler on the voice agent that writes a suppression flag. | build cost only |

**Practical rule:** put a `do_not_contact` boolean on the Airtable record and check it at the top of *every* workflow branch. One field, checked everywhere, is worth more than any amount of policy documentation.

---

## 6. Roadmap

Sequenced so that something useful is live in week 1 and each phase is independently valuable. Total ~40–70 hours of build for the hybrid approach.

### Phase 0 — Foundations (2–3 days, mostly waiting)
- [ ] Start **A2P 10DLC registration** immediately (1–2 week lead time — it's the long pole)
- [ ] Buy Twilio numbers for your top 2–3 markets
- [ ] Create ElevenLabs, n8n, Airtable, Cal.com accounts
- [ ] Rewrite the LinkedIn Lead Gen Form: add **phone (required)**, the **call-or-text choice**, and the **consent checkbox**
- [ ] Write the qualification criteria as plain English — what makes a lead worth a meeting? Everything downstream encodes this, so it has to exist before anything is built.

### Phase 1 — Capture + instant acknowledgement (week 1) 🎯 *ships alone, delivers most of the value*
- [ ] LinkedIn Lead Sync → n8n webhook
- [ ] Phone normalization to E.164 + Twilio Lookup (validate the number is real and mobile-capable — this alone kills a surprising share of junk)
- [ ] Dedupe on email + phone
- [ ] Write to Airtable
- [ ] Instant SMS to *every* lead regardless of channel choice: "Thanks {name} — {your name} here. You asked for a {call/text}, we'll be in touch in the next few minutes."
- [ ] Slack alert to the team

**Why this ships first:** even with zero AI, a lead that gets a personalized text 90 seconds after form-fill converts dramatically better than one that gets an email the next morning. If the project stalled here it would still pay for itself.

### Phase 2 — Voice agent, inbound only (week 2)
- [ ] Build the ElevenLabs agent: AI disclosure opener, qualification script, objection handling, Cal.com booking tool
- [ ] Attach to a Twilio number, inbound
- [ ] Put that number in the Phase 1 SMS ("or call us right now on …")
- [ ] Post-call webhook → transcript + recording to Drive + structured summary to Airtable
- [ ] **Test it yourself 20+ times.** Call it from a bad connection. Interrupt it. Ask it something off-script. Ask it if it's a robot.

**Why inbound first:** an inbound call is a lead who *chose* to call. If the agent embarrasses you, it embarrasses you in front of far fewer people, and you find every rough edge before it's dialing strangers.

### Phase 3 — Outbound auto-dial + retry ladder (week 3)
- [ ] Trigger outbound call on "Call me" leads, target < 2 min from form-fill
- [ ] Retry ladder: +5 min → +1 hour → next business day → then fall back to SMS and stop
- [ ] Local calling-hours guard (never dial outside 8am–9pm in the lead's timezone — derive it from the phone number prefix)
- [ ] Voicemail detection → leave a short message, log it, move to the SMS branch
- [ ] Cap total attempts at 3–4. More than that is harassment and it doesn't work anyway.

### Phase 4 — Two-way SMS + closing the loop (weeks 4–5)
- [ ] LLM-backed SMS reply handler with human escalation on request
- [ ] STOP / opt-out → `do_not_contact` flag
- [ ] Booked meetings → Google Calendar + reminder sequence
- [ ] **LinkedIn Conversions API**: push booked-meeting events back so ad optimization targets meetings, not form-fills
- [ ] Airtable Interface dashboard: leads by channel, contact rate, connect rate, booking rate, cost per meeting

### Phase 5 — Optimization (ongoing)
- [ ] A/B the agent opener and the qualification script
- [ ] A/B call-first vs SMS-first for leads who don't express a preference
- [ ] Review 10 transcripts weekly; feed real objections back into the prompt
- [ ] Revisit the landing-page option (§3A) if measured lead-to-dial latency is poor

---

## 7. Costs

### 7.1 Running cost at 50 leads/month

Modelling: 50 leads → ~30 choose "call me" → ~35 dial attempts (retries included) → ~12–15 connected conversations averaging 3.5 min → **~150 billable voice minutes/month**. Plus ~300 SMS segments.

| Item | Monthly | Notes |
|---|---|---|
| ElevenLabs Agents — Creator plan | $22 | includes a minute allowance; usage-based billing beyond it |
| ElevenLabs overage (~150 min @ ~$0.08–0.12) | $12–18 | may be partly covered by the plan allowance |
| Twilio phone numbers (2–3, mixed international) | $3–20 | US local $1.15; international $1.50–10+ each |
| Twilio voice (~150 min, mixed international) | $2–7 | $0.013/min US, up to $0.045/min some markets |
| Twilio SMS (~300 segments, mixed international) | $3–12 | $0.0079 + $0.003 10DLC surcharge US; ~$0.04 UK |
| A2P 10DLC campaign fee | $2–10 | plus ~$4 one-off brand registration |
| n8n Cloud Starter | $20 | → ~$6 if self-hosted on a VPS |
| Airtable | $0 | free tier holds >1 year at this volume |
| Cal.com | $0 | free tier |
| LLM calls (SMS handler, enrichment) | $2–5 | |
| Google Workspace / Drive | $0 | already have it |
| **Total** | **$66–124/month** | call it **~$95/month** |

**Per lead: ~$1.90. Per booked meeting (at a ~20% booking rate): ~$9.50.** Against a LinkedIn CPL of $50–150 and a fully-loaded ad cost per meeting of $250–750.

### 7.2 Build cost

| | Hours | Notes |
|---|---|---|
| Phase 0 — accounts, numbers, registration, form rewrite | 4–6 | mostly admin + waiting on 10DLC |
| Phase 1 — capture, normalize, dedupe, store, ack SMS | 8–12 | |
| Phase 2 — voice agent build + prompt iteration + testing | 12–20 | prompt iteration is the bulk; budget generously |
| Phase 3 — outbound, retries, hours guard, voicemail | 8–12 | |
| Phase 4 — SMS handler, booking, Conversions API, dashboard | 8–14 | |
| Contingency | 6–10 | something always breaks in telephony |
| **Total** | **46–74 hours** | ~4–6 calendar weeks part-time |

At a €60–100/hr contractor rate that's **€2,800–7,400** one-off. In-house it's roughly one focused month.

### 7.3 How the cost scales

| Leads/month | Voice min | Monthly running cost | Notes |
|---|---|---|---|
| 50 | ~150 | ~$95 | current plan |
| 300 | ~900 | ~$220 | Airtable Team ($24) becomes worthwhile; n8n Pro ($50) |
| 1,000 | ~3,000 | ~$600–800 | negotiate ElevenLabs Business + Twilio committed-use; self-host n8n; real CRM |

The curve is flat — this stack does not have a cliff between 50 and 1,000 leads/month. That's the main argument for building it properly now rather than hand-rolling something disposable.

---

## 8. Risks, honestly stated

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Lead sync latency kills speed-to-lead** | High | §3 — instrument it from day one, landing-page fallback ready |
| **Answer rates for unknown numbers are low (10–25%)** | Certain | This is why SMS runs in parallel, not as a fallback. Expect most conversions to come through SMS + booking link, not through a connected call. Budget accordingly. |
| **Multilingual quality varies** ("global/mixed") | Medium | Test the agent in each target language before pointing spend at that market. Route languages you can't serve well to SMS-only. |
| **Prospect reacts badly to an AI caller** | Medium | Disclose immediately (also legally required), keep it short, offer a human instantly on request. A 45-second qualify-and-book call is welcome; a 6-minute AI interrogation is not. |
| **LinkedIn form leads with junk phone numbers** | Medium | Twilio Lookup validation at intake; route invalid numbers to email-only |
| **Compliance breach in an unfamiliar market** | Low but expensive | §5. Start with 2–3 markets you understand, expand deliberately. "Global" as a targeting setting is not the same as global readiness. |

---

## 9. Recommendation in one paragraph

Build it in the order above, on **n8n + ElevenLabs Agents + Twilio + Airtable + Cal.com**. Ship Phase 1 in week one — instant personalized SMS on every lead — because that alone justifies the project and de-risks everything after it. Start the A2P 10DLC registration today, since it's the only item with an unavoidable multi-week lead time. Expect **~$95/month running** and **~50–70 hours to build**. Ignore per-minute price differences between voice platforms at this volume; they're worth under $10/month and choosing on them will cost you far more in voice quality and build time. The two decisions that actually determine whether this works are **speed-to-lead** (§3) and **whether the agent can book a meeting inside the conversation** (§4.4) — everything else is plumbing.

---

## Sources

Pricing and capability figures are vendor list prices as of August 2026 and should be re-checked before committing spend.

- [ElevenLabs Agents pricing breakdown](https://www.cekura.ai/blogs/elevenlabs-pricing)
- [ElevenLabs plans, overages and usage-based pricing](https://flexprice.io/blog/elevenlabs-pricing-breakdown)
- [Vapi vs ElevenLabs vs Retell vs Bland — true per-minute cost](https://devaland.com/blog/voice-ai-pricing-comparison-2025)
- [Voice AI pricing per minute 2026 comparison](https://caller.digital/voice-ai-pricing-comparison)
- [OpenAI Realtime API pricing 2026](https://www.layer3labs.io/guides/openai-realtime-api-pricing)
- [Twilio voice pricing 2026](https://edesy.in/blog/twilio-voice-pricing-guide-2026)
- [Twilio pricing breakdown — SMS, voice, numbers](https://www.telphiconsulting.com/blog/twilio-cost-2026)
- [ElevenLabs post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
- [ElevenLabs Twilio native integration](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration)
- [ElevenLabs SIP trunking](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking)
- [ElevenLabs batch calling](https://elevenlabs.io/docs/agents-platform/phone-numbers/batch-calls)
- [LinkedIn + Zapier partnership / Lead Gen Form triggers](https://business.linkedin.com/advertise/partners/find-a-partner/zapier)
- [Automating LinkedIn Lead Gen Forms — polling and duplication caveats](https://bind.media/insights/automate-linkedin-lead-gen-forms-with-zapier)
- [n8n vs Make pricing comparison 2026](https://cipherprojects.com/blog/posts/n8n-vs-make-automation-platform-comparison/)
- [Make.com pricing 2026](https://trackstack.tech/en/make-com-pricing-2026/)
- [Airtable pricing 2026](https://www.usecarly.com/blog/airtable-pricing/)
- [HubSpot free plan limits 2026](https://www.usecarly.com/blog/hubspot-free-plan-limits/)
