# Lead enrichment

Sits between **Lead** and **Contact** in the pipeline. Takes a raw LinkedIn lead, looks up the company behind the email domain, and returns two or three facts plus the line the voice agent opens with.

The opener goes from this:

> "Hi, is this Toms? I'm an AI assistant calling about your enquiry —"

to this:

> "Hi Toms — this is an AI assistant from Acme, calling about the form you just filled in. I can see Baltic Freight runs last-mile grocery delivery in Riga and Tallinn, so I'll keep this to two questions."

That difference is whether they stay on the line past ten seconds, which is the only thing the rest of the call depends on.

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...

npm test                                    # 22 tests, no network or API key needed
node src/cli.js --email toms@stripe.com --name "Toms" --caller-name "Acme"
npm start                                   # HTTP server on :8080
```

## Wiring it in

**Make.com** — add an HTTP module between the LinkedIn trigger and the ElevenLabs call:

```
POST https://your-host/enrich
x-enrich-secret: <ENRICH_SHARED_SECRET>

{ "name": "{{1.firstName}} {{1.lastName}}",
  "email": "{{1.email}}",
  "company": "{{1.company}}",
  "caller_name": "Acme" }
```

**ElevenLabs** — pass `opener`, `facts` and `company_name` as dynamic variables on the outbound call, and have the agent prompt open with `{{opener}}` verbatim rather than paraphrasing it. The disclosure and the length cap live in that string.

**Airtable** — store `facts`, `company_name`, `enriched` and `dropped_facts` on the lead row. `dropped_facts` is the count the grounding gate rejected; if it climbs, the model is drifting and the prompt needs a look.

## Response

```json
{
  "enriched": true,
  "reason": null,
  "domain": "stripe.com",
  "company_name": "Stripe",
  "industry": "payments infrastructure",
  "facts": ["helps businesses accept payments and manage money movement"],
  "opener": "Hi Toms — this is an AI assistant from Acme, calling about the form you just filled in. I can see Stripe helps businesses accept payments and manage money movement, so I'll keep this to two questions.",
  "source_url": "https://stripe.com/",
  "dropped_facts": 1,
  "cached": false,
  "ms": 2840
}
```

**It never fails.** Every path — free email address, dead website, model error, malformed input — returns `enriched: false` with a working generic opener and a `reason`. A lead that can't be enriched still has to be called.

## Two things worth understanding

**A wrong fact is worse than no fact.** The agent stating something untrue about the prospect's own company is the "made it up" failure, on the first sentence of the call. The prompt tells the model to stay grounded; `isGrounded()` then *verifies* it did, by checking that a fact's content words actually appear in the fetched page. Anything that fails is dropped silently — a shorter opener is a fine outcome, a confident wrong one isn't. The count of what was dropped comes back as `dropped_facts`.

**The domain comes from an attacker-controlled form field.** Anyone can submit a LinkedIn lead, so `someone@internal-admin.corp` would otherwise turn this step into a request forger against whatever else runs on the box. Every DNS result is checked against loopback, link-local and RFC1918 space, on every redirect hop as well as the first request. Non-HTTP schemes, oversized bodies and slow responses are all bounded.

## Cost and latency

Roughly **$0.02–0.03 per lead** on `claude-opus-5` (~3k input tokens, ~200 output). At 50 leads/month that is under $1.50. Set `ENRICH_MODEL=claude-haiku-4-5` to cut it by 5× if the opener quality holds — worth an A/B once there are enough calls to judge.

Site fetch is bounded at 6s and typically lands in 0.4–1.2s. Results cache by domain for 24h, so repeat leads from the same company skip both the fetch and the model call. Add the model call and budget **2–4s end to end** — comfortably inside the two-minute speed-to-lead target, and it runs before the dial rather than during the call, so it costs nothing against the 600ms turn latency.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required |
| `ENRICH_MODEL` | `claude-opus-5` | |
| `ENRICH_SHARED_SECRET` | unset | required in production — the server warns loudly without it |
| `ENRICH_CACHE_TTL_MS` | 86400000 | 24h |
| `PORT` | 8080 | |

The cache is in-process. That's correct for one instance at this volume; behind more than one, move it to Redis or accept the duplicate lookups (they're cheap).

## Status

Everything except the model call is verified: 22 tests cover domain derivation, the SSRF gate, HTML extraction, the grounding filter, opener construction and every fallback path, and the fetch layer has been run live against real sites (0.4–1.1s). **The Anthropic call itself has not been executed** — no API key was available in the build environment. Run the CLI against a real lead as the first thing you do.
