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
3. **At under 50 leads/month, tooling cost is noise.** LinkedIn B2B cost-per-lead typically runs $50–150, so 50 leads/month means roughly **$3,000–7,500/month in ad spend**. The entire automation stack below costs **~$60–120/month**. You are optimizing the ~2% tail. Optimize for *speed to launch and lead experience*, not for saving $20/month on an orchestrator.

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
│  ORCHESTRATOR   Make.com  (see §4.2 — it owns the LinkedIn hop) │
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

## 3. Getting leads out of LinkedIn — the constraint that drives everything

This is the hardest part of the build, and it's the reason the orchestrator choice is not free. It's worth understanding before picking any tool.

**You cannot simply read your own LinkedIn leads via API.** The `/leadGenFormResponses` endpoint sits behind LinkedIn's Marketing Developer Platform, and you must additionally be approved for the **Lead Gen Forms product** specifically — without it you get 403s on a valid token. Approval is manual: **4–8 weeks best case, 3–4 months typical**, longer or rejected if LinkedIn doesn't like the use case. There is no self-serve path. (Leads are also only retrievable for 90 days.)

So in practice you rent someone else's approved API access:

| Route | Latency | Cost | Verdict |
|---|---|---|---|
| **Make.com — LinkedIn Lead Forms app** | **instant** (true webhook trigger; a polling variant also exists) | $9–16/mo | ✅ **Cheapest and fastest.** Only route that's both instant and inexpensive. |
| **Zapier — LinkedIn Ads triggers** | polling, 1–15 min | ~$49/mo | LinkedIn Ads is a **premium app**, so no free tier. Polling is a known source of duplicate and dropped leads. |
| **n8n** | — | — | ❌ **No LinkedIn Lead Gen Forms node exists.** Open community request since 2025. You'd be back to the raw API and its approval queue. |
| **Direct LinkedIn API** | instant | $0 | Blocked on 4-week-to-4-month approval. Revisit at scale, not now. |
| **Your own landing page instead of the native form** | < 5 sec | $0 | Sidesteps LinkedIn's API entirely — your form posts wherever you want. But native Lead Gen Forms convert substantially better (they pre-fill from the profile; the lead types nothing). You'd trade CPL for control. |

**Why latency matters at all:** the entire value of an AI voice agent is dialing while the lead still has the tab open. A 15-minute delay turns a warm callback into a cold call.

**Recommendation:** Make.com's instant trigger. Still instrument the real latency from day one — log `linkedin_submitted_at` vs `first_dial_at` on every row — and keep the landing-page option (row 5) in your back pocket for retargeting and high-intent audiences once you know your CPL on each.

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

### 4.2 Orchestration — and whether you need it at all

An orchestrator here does exactly three jobs. It's worth being explicit, because two of them you could write yourself:

| Job | Could you build it? |
|---|---|
| 1. **Pull leads out of LinkedIn** | ❌ Not without partner API approval — see §3. This is the one genuinely hard dependency. |
| 2. **Durable delayed retries** (+5 min → +1 h → next business day, with a calling-hours guard) | ✅ Cron + a queue table. Not hard, but it must survive restarts — naive `setTimeout` loses calls. |
| 3. **Always-on public webhook endpoints** for ElevenLabs post-call and Twilio inbound SMS | ✅ ~250 lines on a Cloudflare Worker or a $6 VPS. |

So the honest framing: **jobs 2 and 3 do not require a no-code platform.** If you only had those, you'd write a small service and skip the $16/month. Job 1 is what you're actually paying for — pre-approved LinkedIn API access you can't get yourself inside a quarter.

| | **Make.com** ✅ | n8n Cloud | n8n self-hosted |
|---|---|---|---|
| LinkedIn Lead Forms trigger | ✅ **instant webhook** | ❌ none | ❌ none |
| Price | $9–16/mo (10k credits) | $20/mo (2,500 executions) | ~$6–12/mo VPS |
| Billing unit | **per operation** — a 3-step scenario easily burns 8–15 ops per run | per full workflow execution, regardless of node count | unlimited |
| Custom code | limited | full JS/Python nodes | full |
| Self-host | ❌ impossible | ❌ | ✅ |

**Make.com, on the strength of the LinkedIn connector alone.** n8n has the better billing model and far better code support — at 500+ leads/month a 12-step Make scenario costs meaningfully more than it looks like on the canvas — but none of that matters if it can't receive the lead. At 50 leads/month you're nowhere near Make's operation limits anyway.

**Two escape hatches if Make's per-operation billing bothers you later:**

- **Thin-adapter pattern (recommended at scale).** Make does one job — LinkedIn trigger → POST the raw lead to your own endpoint. That's 2 operations per lead instead of 12. All logic lives in your code or in self-hosted n8n. You keep Make's API access on its cheapest tier and cap the bill.
- **Drop LinkedIn's native form** for your own landing page (§3, row 5) and you need no orchestrator at all — at the cost of form conversion rate.

Given the hybrid brief, start with Make doing everything (fastest to a working system), and refactor to the thin-adapter pattern when volume or complexity justifies it. The refactor is cheap because the lead payload shape doesn't change.

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
- [ ] Create ElevenLabs, Make.com, Airtable, Cal.com accounts
- [ ] Rewrite the LinkedIn Lead Gen Form: add **phone (required)**, the **call-or-text choice**, and the **consent checkbox**
- [ ] Write the qualification criteria as plain English — what makes a lead worth a meeting? Everything downstream encodes this, so it has to exist before anything is built.

### Phase 1 — Capture + instant acknowledgement (week 1) 🎯 *ships alone, delivers most of the value*
- [ ] LinkedIn Lead Forms (instant trigger) → Make scenario → your webhook
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
- [ ] Revisit the landing-page option (§3) if measured lead-to-dial latency is poor
- [ ] Refactor Make to the thin-adapter pattern (§4.2) once operation count justifies it

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
| Make.com Core | $9–16 | needed for LinkedIn API access; see §4.2 |
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
| 300 | ~900 | ~$215 | Airtable Team ($24); Make Pro, or switch to the thin-adapter pattern |
| 1,000 | ~3,000 | ~$600–800 | negotiate ElevenLabs Business + Twilio committed-use; Make as thin adapter into self-hosted n8n; real CRM |

The curve is flat — this stack does not have a cliff between 50 and 1,000 leads/month. That's the main argument for building it properly now rather than hand-rolling something disposable.

---

## 8. Risks, honestly stated

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Locked into Make for LinkedIn API access** | Certain | §4.2 thin-adapter pattern keeps the dependency to 2 operations per lead. Apply for LinkedIn Marketing Developer Platform access in parallel if this matters long-term — it takes 4 weeks to 4 months, so start early or not at all. |
| **Lead sync latency kills speed-to-lead** | Medium | Make's instant trigger largely solves this; instrument it from day one anyway, landing-page fallback ready (§3) |
| **Answer rates for unknown numbers are low (10–25%)** | Certain | This is why SMS runs in parallel, not as a fallback. Expect most conversions to come through SMS + booking link, not through a connected call. Budget accordingly. |
| **Multilingual quality varies** ("global/mixed") | Medium | Test the agent in each target language before pointing spend at that market. Route languages you can't serve well to SMS-only. |
| **Prospect reacts badly to an AI caller** | Medium | Disclose immediately (also legally required), keep it short, offer a human instantly on request. A 45-second qualify-and-book call is welcome; a 6-minute AI interrogation is not. |
| **LinkedIn form leads with junk phone numbers** | Medium | Twilio Lookup validation at intake; route invalid numbers to email-only |
| **Compliance breach in an unfamiliar market** | Low but expensive | §5. Start with 2–3 markets you understand, expand deliberately. "Global" as a targeting setting is not the same as global readiness. |

---

## 9. Recommendation in one paragraph

Build it in the order above, on **Make.com + ElevenLabs Agents + Twilio + Airtable + Cal.com**. Make is in there for one reason — it is the only cheap route to an instant LinkedIn Lead Gen Forms trigger, and LinkedIn's own API is behind a 4-week-to-4-month approval queue (§3). Everything Make does *after* that hop, you could write yourself in about 250 lines; if its per-operation billing starts to bite, refactor to the thin-adapter pattern (§4.2) rather than switching platforms. Ship Phase 1 in week one — instant personalized SMS on every lead — because that alone justifies the project and de-risks everything after it. Start the A2P 10DLC registration today, since it's the only item with an unavoidable multi-week lead time. Expect **~$90/month running** and **~50–70 hours to build**. Ignore per-minute price differences between voice platforms at this volume; they're worth under $10/month and choosing on them will cost you far more in voice quality and build time. The two decisions that actually determine whether this works are **how fast the lead reaches you** (§3) and **whether the agent can book a meeting inside the conversation** (§4.4) — everything else is plumbing.

---

## 10. Rev 2 — the feedback loops

The architecture in §2 is a pipeline, and a pipeline cannot discover that the agent's answer was poor or that it replied a second and a half late. Rev 2 adds four feedback paths, all returning from **Outcome**, nested by scope of change:

| | Loop | Clock | Changes |
|---|---|---|---|
| **L1** | the turn | 300–1500 ms, ~20× per call | Turn-taking inside one conversation. Where "laggy" lives. |
| **L2** | the contact | hours | The retry ladder from §6 Phase 3. A loop, but a dumb one — it persists, it doesn't learn. |
| **L3** | the tuning | weekly | **The missing one.** Transcripts → prompt, voice, model tier, script. |
| **L4** | the targeting | weekly | Booked meetings → LinkedIn Conversions API → who ever becomes a lead. |

**Latency (L1).** Response delay is five stacked components, not one. An untuned setup lands near **1000 ms** of silence after the caller stops speaking; tuned, ~600 ms. Under 800 ms feels conversational, over 1200 ms feels broken — but under 500 ms stops sounding human and starts sounding like an IVR. Two thirds of the recoverable time is endpointing (~300 ms typical; drop the silence threshold to 300–500 ms and enable barge-in) and model reply (~350 ms; shorten the system prompt, which is reprocessed every turn, enable prompt caching, and move lookups into tools).

**Quality (L3).** A bad reply is five distinct failures with different fixes: *doesn't know* (knowledge base), *made it up* (constrain hard — the trust-destroying one), *missed the objection* (prompt, highest yield), *wrong language* (route by country code before dialling), *talked too much* (also inflates the bill, since billing is wall-clock). Tag ten transcripts a week, change **one** thing per cycle, version the prompt in git, and replay saved failures against the candidate before it meets a real lead.

**At 50 leads/month you cannot A/B test.** ~30 calls means a booking-rate difference must be enormous to beat noise. Judge changes by reading transcripts. Statistical testing becomes real north of 300 leads/month.

**Consequences for §6:** the post-call webhook must log the full instrument panel from day one (`turn_latency_p50/p90`, `interruptions`, `agent_talk_ratio`, `failure_tag`, `prompt_version`, `detected_language` vs `dial_country`, and a multi-valued `outcome`) — latency data cannot be backfilled. Add ~4 hours for a replay harness. Move the Conversions API push from Phase 4 to Phase 2, since L4 needs weeks of data before it influences anything.

---

## 11. Considered and rejected: voice emotion analysis

Cogito (MIT Media Lab, 2007, now Verint), Beyond Verbal, Behavioral Signals and — currently — Hume AI's EVI all read vocal prosody and adapt the conversation. Rejected on three counts:

1. **Legal weight class.** Under the EU AI Act, emotion recognition systems are **Annex III high-risk** (the outright Article 5 ban covers workplace and education only). That means conformity assessment, risk management system, data governance, logging, human oversight and EU database registration — plus an Article 50(3) obligation to tell the person. That is a certification regime, not the one-sentence disclosure in §5. Illinois BIPA and equivalents also treat voiceprints as biometric identifiers, an active litigation area for call-centre voice analytics.
2. **It degrades in the wrong direction.** Cross-cultural meta-analysis finds vocal emotion recognised above chance, but with a consistent **in-group advantage** — accuracy falls as cultural distance from the training data grows. For global/mixed targeting that means highest confidence on the people it already understands, quietly wrong on everyone else, with no signal telling you which.
3. **Volume.** ~30 calls/month. Emotion analytics needs thousands of calls to find a pattern; a person reading transcripts outperforms it here.

**Instead, measure behaviour, not inferred inner state** — objective, legally unremarkable, and answering the same question: interruption count and who interrupted, agent talk ratio, dead-air length, speech-rate change, the actual objections raised, and **where in the call they hung up**. Hang-up timestamp is the single strongest signal at this volume: if eight of thirty calls die at the same beat, rewrite that line.

**One piece worth testing:** Hume EVI as the *voice layer* in place of ElevenLabs — prosody internal to the model rather than a scored output acted upon, which is a materially different legal posture, at comparable cost (~$0.06/min past the included minutes). Twenty test calls in Phase 2, judged by ear.

---

## 12. Presentation versions

- `docs/roadmap.html` — showable build plan: architecture, stack with costs, six-week timeline, compliance, rejected options.
- `docs/loops.html` — technical rev 2 note: the four loops, the latency breakdown, the weekly tuning procedure.

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
- [Make — LinkedIn Lead Forms app (instant + polling triggers)](https://www.make.com/en/help/apps/marketing/linkedin-lead-gen-forms)
- [Zapier — LinkedIn Ads is a premium app, paid plan required](https://help.zapier.com/hc/en-us/articles/8496049749133-How-to-get-started-with-LinkedIn-Ads-on-Zapier)
- [LinkedIn Marketing Developer Platform — increasing access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-07)
- [LinkedIn API access tiers and approval timelines 2026](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)
- [n8n community: LinkedIn Lead Gen Forms trigger feature request](https://community.n8n.io/t/linkedin-lead-gen-forms-submission-api-n8n/131315)
- [Make.com pricing 2026](https://trackstack.tech/en/make-com-pricing-2026/)
- [Airtable pricing 2026](https://www.usecarly.com/blog/airtable-pricing/)
- [HubSpot free plan limits 2026](https://www.usecarly.com/blog/hubspot-free-plan-limits/)
- [Cogito — real-time voice analysis for contact centres](https://www.builtinboston.com/articles/cogito-using-real-time-emotional-intelligence-improve-call-centers)
- [Hume AI Empathic Voice Interface](https://www.hume.ai/empathic-voice-interface)
- [Hume AI pricing 2026](https://autogpt.net/hume-ai-pricing-every-plan-explained/)
- [EU AI Act Annex III — high-risk systems](https://artificialintelligenceact.eu/annex/3/)
- [Emotion recognition under the EU AI Act](https://fpf.org/blog/red-lines-under-eu-ai-act-unpacking-the-prohibition-of-emotion-recognition-in-the-workplace-and-education-institutions/)
- [Cross-cultural emotion recognition in vocal expression — meta-analysis](https://journals.sagepub.com/doi/10.1177/1754073919897295)
