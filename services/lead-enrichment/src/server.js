import { createServer } from 'node:http';
import { enrichLead } from './enrich.js';

/**
 * The endpoint Make.com POSTs each new LinkedIn lead to, between capturing it
 * and placing the call.
 */

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = process.env.ENRICH_SHARED_SECRET || null;
const MAX_BODY = 64 * 1024;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST' || !req.url.startsWith('/enrich')) {
    return json(res, 404, { error: 'not_found' });
  }

  if (SHARED_SECRET && req.headers['x-enrich-secret'] !== SHARED_SECRET) {
    return json(res, 401, { error: 'unauthorized' });
  }

  let lead;
  try {
    lead = JSON.parse(await readBody(req));
  } catch (err) {
    return json(res, 400, { error: 'invalid_json', detail: err.message });
  }

  try {
    const result = await enrichLead(lead);
    // Log the shape of the outcome, never the lead's contact details.
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        domain: result.domain,
        enriched: result.enriched,
        reason: result.reason,
        facts: result.facts.length,
        dropped: result.dropped_facts ?? 0,
        cached: result.cached ?? false,
        ms: result.ms,
      })
    );
    return json(res, 200, result);
  } catch (err) {
    console.error(JSON.stringify({ at: new Date().toISOString(), error: err.message }));
    // Never fail the caller: a lead with no enrichment still needs to be dialled.
    return json(res, 200, {
      enriched: false,
      reason: `server_error:${err.message}`,
      facts: [],
      opener: null,
    });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`lead-enrichment listening on :${PORT}`);
    if (!SHARED_SECRET) console.warn('ENRICH_SHARED_SECRET unset — endpoint is unauthenticated');
  });
}
