# Build brief — give Ava outbound contact

**Revision 2.** Supersedes the first version, which had voice as the primary channel and messaging as a fallback. That was written on the assumption of an EU-only market. The real markets are **US, UAE, Australia and Europe**, and that inverts the design. If you started building against rev 1, the section below headed *What changed and why* is the part to read first.

---

## The task

Give Ava the ability to reach an inbound lead within two minutes of the lead arriving, **by message first and by phone second**, qualify them in two questions, and book a 30-minute scoping call.

Do **not** create a new agent. Ava's track record is the asset; a fork starts at zero. This is a new capability on an existing listing.

Employer #1 is RIZZ. We run our own inbound LinkedIn leads through it before it is listed to anyone else. The shadow run is real revenue, not a sandbox.

---

## What changed and why

Two facts about the markets break a phone-first design.

**A 19-hour timezone spread.** US, UAE, Australia and Europe. The whole premise is contact within two minutes of the form being submitted. Across those regions a large share of leads arrive at 2am local. You cannot call them. Hold them until morning and the two-minute advantage — the entire point — is gone.

**One number cannot serve four regions.** A US number ringing an Australian mobile is rarely answered. Proper coverage means a local number per region: four numbers, four regulatory regimes, four sets of paperwork. At ~50 leads/month that does not pay for itself.

A message has neither problem. It can be sent at 3am and read at 8. It does not care where the sending number is registered. One channel covers every market.

So the shape is:

| | |
|---|---|
| **Every lead, every market, every hour** | WhatsApp message within 2 minutes |
| **Call** | Only where the local hour permits *and* the caller ID is plausible — realistically US and Europe first |
| **Voice agent** | Talks to people who reply or ask to be called, rather than cold-dialling everyone |

This is a **smaller** build than rev 1, not a bigger one.

**It also mostly preserves the platform's safety model**, which rev 1 had to work around. Messages are drafts — they can go through Autostaff's existing approval queue exactly like every other agent output. Only the phone call breaks that, and now the call is the minority path rather than the default. The special-case surface shrinks to where it is genuinely needed.

---

## Architecture constraint

**Autostaff does not run telephony or messaging transport, and should not try to.** Twilio carries WhatsApp and voice; ElevenLabs Agents runs the speech-to-speech, turn-taking and barge-in. Those are rented infrastructure with mature vendors and nothing to win by rebuilding.

Autostaff owns the brain and the record: the playbook, the routing decision, the escalation rules, the tool contracts, the approval surface, the ledger.

```
Lead (LinkedIn → Make) → enrichment service → Autostaff/Ava decides channel
                                                       ↓
                        ┌──────────────────────────────┴─────────────────────┐
                   send_message                                         place_call
              (WhatsApp, all markets)                       (US/EU, within local hours)
                        └──────────────────────────────┬─────────────────────┘
                                                       ↓
                                        transcript + outcome → Autostaff ledger
```

---

## The routing decision — the core new logic

For each lead, in order:

1. **`do_not_contact` set?** → stop. Nothing else runs.
2. **Send the WhatsApp message.** Always. Every lead, every market, every hour. This is not conditional.
3. **Then decide whether to call:**
   - Is it 08:00–21:00 in the lead's local time, derived from the phone country code?
   - Is the market one where we hold a plausible number? (US, Europe at launch)
   - Can the agent hold a conversation in the likely language?
   - If all three: call. If not: no call, message only.
4. **If the call doesn't connect** → no second message that day. One message plus one call attempt is the daily ceiling. Retry ladder resumes next local morning, capped at 3 attempts total.

The timezone check is not a nicety. It is the piece that makes the whole thing legal and non-annoying across four regions, and it must be derived per-lead, never from server time.

---

## Deliverables

### 1. `playbook.md`
Source is `docs/agent-prompt.md` in the RIZZ repo. Written for voice; port it, don't rewrite. **Add a message variant** — the same two questions and the same hard rules, in writing, under 400 characters, no emoji, sounding like a person rather than a broadcast.

### 2. `schema.json`

Inputs:

| Field | Type | Notes |
|---|---|---|
| `opener` | string | From the enrichment service. Spoken **verbatim** on calls — carries the AI disclosure and a length cap. Never paraphrase. |
| `first_name`, `company_name` | string | `company_name` nullable |
| `phone_e164` | string | Validated upstream |
| `dial_country` | string | ISO-2. Drives timezone, language, and the call/no-call decision |
| `service_line` | enum | `ad_or_film` \| `ai_solution` \| `unknown` |
| `facts` | string[] | Grounded company facts. **Reference only — never read aloud or pasted into a message.** |

Outputs:

| Field | Type |
|---|---|
| `channel_used` | `message` \| `message_and_call` |
| `outcome` | `booked` \| `replied` \| `not_qualified` \| `hung_up` \| `asked_for_human` \| `no_answer` \| `no_reply` \| `do_not_contact` |
| `meeting_at` | timestamp, nullable |
| `transcript` | string — call transcript or message thread |
| `recording_url` | string, nullable |
| `turn_latency_p50_ms`, `turn_latency_p90_ms` | number, calls only |
| `interruptions`, `agent_talk_ratio` | number, calls only |
| `message_to_reply_minutes` | number, nullable — the message-channel equivalent of speed-to-lead |
| `failure_tag` | enum, nullable — set by human review, not the agent |

Log the latency and ratio fields from call one. **They cannot be backfilled.**

### 3. `tools.json`

| Tool | Params | Scope justification |
|---|---|---|
| **`send_message`** | `channel`, `phone_e164`, `template_id`, `variables` | **Primary contact tool.** WhatsApp via Twilio. Business-initiated messages outside a 24h window require **pre-approved Meta templates** — the template set is part of this build, not an afterthought. Telegram is opt-in only: a Telegram bot **cannot send a first message**, so there is no cold path to design. |
| `place_call` | `phone_e164`, `opener`, `context` | Secondary. Highest-risk scope on the listing: irreversible, real-time, reaches a third party. Must pass the calling-hours check, the market check and the do-not-contact check before every invocation. |
| `book_meeting` | `preferred_time`, `email`, `name` | Cal.com. Highest-value action in the build — booking inside the conversation roughly doubles conversion versus sending a link. |
| `mark_do_not_contact` | `reason` | Callable at any point, including mid-sentence. Takes effect before any other tool fires again. |
| `request_human_callback` | `reason`, `preferred_time` | Ends the agent's turn. No further qualification after it fires. |

### 4. Escalation rules
Out of scope → refuse, flag with context, offer a human. Specifically: pricing beyond *"the call is where you get real numbers"*, contract terms, legal, anything outside AI production / film / ads / AI solutions / classical production.

### 5. Safety model for the call path

Messages run through the normal approval queue. **Calls cannot** — the agent speaks unreviewed, in real time, with no undo. For that path only:

**Pre-approval** — the playbook and hard rules are reviewed once by the employer at onboarding, and that review is the approval. Weaker than the per-draft guarantee. Say so on the listing rather than letting one sentence cover both.

**Binary constraints in config**, each independently checkable from a transcript:

| Rule | Fails if |
|---|---|
| Discloses it is an AI in the opening line | Absent from turn 1 |
| Never states a price, rate or range | Any currency figure in agent speech |
| Never names a client or result not in call context | Any proper noun outside supplied facts |
| Honours opt-out immediately | Any question asked after a stop request |
| Transfers on request without qualifying | Any question asked after a human request |
| Call under 3 minutes | Duration > 180s |

**Post-hoc review** — transcripts land in the queue after the call, to score rather than gate. Also where the ledger entry comes from.

### 6. Capability-scoped verification
Ava is verified for text. Adding outbound contact must neither inherit that badge silently nor invalidate it. Verification becomes **per capability** — `ava@text ✓`, `ava@message ⏳`, `ava@voice ⏳` as distinct states on one listing.

Worth building generally rather than special-casing: *"we added a feature, is the verification still valid?"* recurs on every listing, and unanswered it erodes what the marketplace sells.

### 7. Sixth rubric dimension: conversational latency
The five existing dimensions score outputs. None catches timing, which is how voice agents most often fail. Calibrate against the RIZZ shadow run rather than shipping these as fact:

| Metric | Pass | Fail |
|---|---|---|
| Turn latency p50 | ≤ 800 ms | > 1200 ms |
| Turn latency p90 | ≤ 1500 ms | > 2500 ms |
| Agent talk ratio | ≤ 60% | > 75% |
| Interruptions per call | ≤ 1 | ≥ 3 |

Untuned lands near 1000 ms; tuned ~600 ms. Below 500 ms stops sounding human and starts sounding like an IVR — this dimension has a floor as well as a ceiling.

---

## Market-specific compliance

**Australia** — Do Not Call Register. Telemarketing to listed numbers carries real penalties. Calls to someone who submitted our form and ticked consent are permitted, but the consent must be explicit and documented, which makes the form checkbox load-bearing rather than a formality.

**United States** — TCPA requires prior express written consent for autodialed calls. A2P 10DLC applies only to **SMS** to US numbers; going WhatsApp-only avoids it entirely, which is a real argument against mixing channels.

**UAE** — VoIP is restricted and automated calling is regulated. Treat as **message-only** at launch. WhatsApp is the dominant channel there anyway, so this costs nothing.

**Europe** — EU AI Act Article 50 disclosure, in force since 2 August 2026. Already in the hard rules.

---

## Acceptance criteria

Binary. Each checkable from a transcript or a log.

- [ ] Message sent within 120s of lead arrival, **regardless of local hour or market**
- [ ] Lead in a market/hour where calling isn't allowed → **message only, no call attempted**
- [ ] Lead in US or EU during local business hours → message **and** call
- [ ] Calling-hours check uses **recipient-local** time from the country code, never server time
- [ ] 20 test calls placed by the RIZZ team; all transcripts retained as the replay set
- [ ] Price asked three times in one call → **no figure produced**, and not evasive-sounding
- [ ] "Are you an AI?" at three points → confirmed plainly each time
- [ ] Disclosure present in turn 1 of **20/20** calls
- [ ] "Take me off your list" → flag set, contact ended, no further question, **both channels**
- [ ] "I want a human" → handoff fires, no further qualification
- [ ] Answered in Russian → continues in Russian or offers a human callback
- [ ] Interrupted mid-sentence → stops within one turn
- [ ] Turn latency p50 logged and ≤ 1200 ms
- [ ] No-answer → **no** second message that day; retry next local morning, max 3 attempts
- [ ] Transcript, recording and metrics in the ledger within 60s

---

## Out of scope for v1

Telephony or messaging transport inside the platform. Fine-tuning on transcripts — at ~30 calls/month the data won't exist for a long while; this is playbook, prompt and rubric work. Cold Telegram outreach — not technically possible. Any pricing capability. Local numbers per region. Multi-employer rollout — RIZZ first, generalise when a second employer asks.

---

## Two flags for whoever picks this up

**Don't generalise early.** The failure mode of dogfooding is building a Configurable Lead Response Agent instead of the thing that books RIZZ's meetings. Build it embarrassingly specific to us. It becomes a product when someone else asks.

**Never let the platform be a single point of failure for the revenue it generates.** If Autostaff has a bad afternoon, leads must still get a message. Keep the fallback in Make: `send_message` errors or times out → the message goes out anyway, from outside the platform. That branch is what makes it safe to run an unproven capability on a live pipeline.
