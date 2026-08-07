import Anthropic from '@anthropic-ai/sdk';
import { deriveDomain, fetchSiteText } from './fetch-site.js';

/**
 * Turns a raw LinkedIn lead into two or three facts the voice agent can open
 * with, plus the opening line itself.
 *
 * Two rules drive every design decision here:
 *   1. A wrong fact is worse than no fact. The agent quoting something untrue
 *      about the prospect's own company is the "made it up" failure from the
 *      taxonomy, on the first sentence of the call.
 *   2. This sits in front of a phone call that should go out inside two
 *      minutes. Every path has a bound and a fallback; nothing here may hang.
 */

const MODEL = process.env.ENRICH_MODEL || 'claude-opus-5';
const CACHE_TTL_MS = Number(process.env.ENRICH_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const OPENER_MAX_CHARS = 260;

const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    company_name: {
      type: 'string',
      description: 'The company name as the website presents it. Empty string if unclear.',
    },
    facts: {
      type: 'array',
      description:
        'Up to 3 short factual statements about the company, each under 15 words, each ' +
        'directly supported by the website text. Empty array if the text supports none.',
      items: { type: 'string' },
    },
    industry: {
      type: 'string',
      description: 'Two or three words naming what the company does. Empty string if unclear.',
    },
  },
  required: ['company_name', 'facts', 'industry'],
  additionalProperties: false,
};

const SYSTEM = `You extract facts about a company from its own website, for a sales caller who has 10 seconds to sound like they did their homework.

Rules, in order of importance:
1. Use ONLY the provided website text. You have no other knowledge of this company.
2. If the text does not clearly state something, leave it out. Returning zero facts is a correct answer and is much better than one plausible guess.
3. Never state employee counts, revenue, funding, customer numbers, or founding dates unless those exact figures appear in the text.
4. Prefer what the company does and who it serves over marketing adjectives. "Runs last-mile delivery for grocery chains" is useful; "industry-leading logistics solutions" is not.
5. Write each fact as a plain clause a person could say out loud.`;

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size > 5000) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'their', 'they', 'have',
  'has', 'are', 'was', 'were', 'its', 'our', 'across', 'into', 'over', 'other',
  'company', 'companies', 'business', 'businesses', 'provides', 'provide',
  'offers', 'offer', 'services', 'service', 'solutions', 'solution',
]);

function contentTokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (t) => t.length >= 4 && !STOPWORDS.has(t)
  );
}

/**
 * Mechanical hallucination check. The prompt tells the model to stay grounded;
 * this verifies it did, because a prompt instruction is a request and this is
 * a gate. A fact whose content words are mostly absent from the source text
 * did not come from the source text.
 */
export function isGrounded(fact, sourceText, threshold = 0.6) {
  const tokens = contentTokens(fact);
  if (tokens.length === 0) return false;
  const source = new Set(contentTokens(sourceText));
  const found = tokens.filter((t) => source.has(t)).length;
  return found / tokens.length >= threshold;
}

/** Cheap sanity filter for the shape of a usable spoken fact. */
function isUsableFact(fact) {
  if (typeof fact !== 'string') return false;
  const trimmed = fact.trim();
  if (trimmed.length < 12 || trimmed.length > 160) return false;
  if (trimmed.split(/\s+/).length > 20) return false;
  return true;
}

function firstName(name) {
  if (typeof name !== 'string') return null;
  const first = name.trim().split(/\s+/)[0];
  if (!first || first.length > 30 || !/^[\p{L}'-]+$/u.test(first)) return null;
  return first;
}

/**
 * The opener is assembled here rather than generated, so the AI disclosure and
 * the length cap cannot be prompted away. The model supplies facts; the shape
 * of the sentence is ours.
 */
export function buildOpener({ name, facts, callerName, companyName }) {
  const who = firstName(name);
  const greeting = who ? `Hi ${who}` : 'Hi there';
  const from = callerName ? ` from ${callerName}` : '';
  // Legally required in the EU from 2 Aug 2026, and in several US states.
  const disclosure = `this is an AI assistant${from}, calling about the form you just filled in`;

  const fact = facts?.[0];
  if (!fact) {
    return `${greeting} — ${disclosure}. Have I caught you at an OK moment for two quick questions?`;
  }

  const subject = companyName ? `${companyName}` : 'you';
  let opener = `${greeting} — ${disclosure}. I can see ${subject} ${lowerFirst(fact)}, so I'll keep this to two questions.`;

  if (opener.length > OPENER_MAX_CHARS) {
    opener = `${greeting} — ${disclosure}. I'll keep this to two quick questions.`;
  }
  return opener;
}

function lowerFirst(s) {
  const t = s.trim().replace(/\.$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function fallback(lead, reason, startedAt) {
  return {
    enriched: false,
    reason,
    domain: null,
    company_name: null,
    industry: null,
    facts: [],
    opener: buildOpener({ name: lead.name, facts: [], callerName: lead.caller_name }),
    source_url: null,
    ms: Date.now() - startedAt,
  };
}

/**
 * @param {{name?: string, email?: string, company?: string, caller_name?: string}} lead
 * @param {{client?: Anthropic, timeoutMs?: number, skipCache?: boolean}} [opts]
 */
export async function enrichLead(lead, opts = {}) {
  const startedAt = Date.now();
  if (!lead || typeof lead !== 'object') return fallback({}, 'no_lead', startedAt);

  const domain = deriveDomain(lead.email);
  if (!domain) {
    const why = lead.email ? 'free_or_invalid_email_domain' : 'no_email';
    return { ...fallback(lead, why, startedAt) };
  }

  if (!opts.skipCache) {
    const cached = cacheGet(domain);
    if (cached) {
      return {
        ...cached,
        cached: true,
        opener: buildOpener({
          name: lead.name,
          facts: cached.facts,
          callerName: lead.caller_name,
          companyName: cached.company_name,
        }),
        ms: Date.now() - startedAt,
      };
    }
  }

  const site = await fetchSiteText(domain, { timeoutMs: opts.timeoutMs ?? 6000 });
  if (!site.text) {
    return { ...fallback(lead, `site_unavailable:${site.reason}`, startedAt), domain };
  }

  let extracted;
  try {
    extracted = await extractFacts(site.text, lead, opts.client);
  } catch (err) {
    return { ...fallback(lead, `model_error:${err.message}`, startedAt), domain };
  }

  // The grounding gate. Anything the source text doesn't support is dropped
  // silently — a shorter opener is a fine outcome, a confident wrong one isn't.
  const facts = (extracted.facts || [])
    .filter(isUsableFact)
    .filter((f) => isGrounded(f, site.text))
    .slice(0, 3);

  const companyName =
    extracted.company_name && isGrounded(extracted.company_name, site.text, 0.5)
      ? extracted.company_name
      : lead.company || null;

  const result = {
    enriched: facts.length > 0,
    reason: facts.length > 0 ? null : 'no_grounded_facts',
    domain,
    company_name: companyName || null,
    industry: extracted.industry || null,
    facts,
    source_url: site.url,
    dropped_facts: (extracted.facts || []).length - facts.length,
  };

  cacheSet(domain, result);

  return {
    ...result,
    cached: false,
    opener: buildOpener({
      name: lead.name,
      facts,
      callerName: lead.caller_name,
      companyName,
    }),
    ms: Date.now() - startedAt,
  };
}

async function extractFacts(siteText, lead, injectedClient) {
  const client = injectedClient || new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: FACTS_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Website text for the company at ${lead.email?.split('@')[1] || 'this domain'}:

<website>
${siteText}
</website>

Extract what this company does.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error('refusal');

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('empty_response');
  return JSON.parse(text);
}
