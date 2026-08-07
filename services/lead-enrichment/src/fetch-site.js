import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetches a lead's company website so we have something factual to build an
 * opener from. The domain comes from a LinkedIn form, so it is attacker-
 * controlled: everything here is written on that assumption.
 */

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const PATHS = ['/', '/about', '/about-us', '/company'];

// Personal-mail providers carry no company signal. Baltic and Russian-language
// providers are in here because the ad targeting includes those markets.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'gmx.com', 'gmx.net',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'fastmail.com',
  'zoho.com', 'hey.com', 'mail.com', 'yandex.com', 'yandex.ru',
  'inbox.lv', 'one.lv', 'tvnet.lv', 'apollo.lv', 'delfi.lv',
  'mail.ru', 'bk.ru', 'list.ru', 'rambler.ru', 'tut.by',
]);

export function deriveDomain(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  if (FREE_MAIL.has(domain)) return null;
  return domain;
}

/**
 * Blocks loopback, link-local, and RFC1918 space. Without this, a lead who
 * signs up as someone@localhost turns our enrichment step into a request
 * forger against whatever else is running on the box.
 */
export function isPrivateAddress(ip) {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:10.0.0.1) re-enters the v4 rules above.
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

async function assertPublicHost(hostname) {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`dns_failed:${hostname}`);
  }
  if (!addresses.length) throw new Error(`dns_empty:${hostname}`);
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`private_address:${hostname}`);
  }
}

async function getWithGuards(url, signal) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`bad_scheme:${parsed.protocol}`);
    }
    // Re-checked every hop — a public host can redirect to a private one.
    await assertPublicHost(parsed.hostname);

    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'lead-enrichment/1.0 (+contact via the ad you replied to)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('html')) {
      throw new Error('not_html');
    }
    return await readCapped(res);
  }
  throw new Error('too_many_redirects');
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES);
}

/** Pulls the parts of a page that actually describe the company. */
export function extractText(html) {
  const pick = (re) => (html.match(re)?.[1] || '').trim();

  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);

  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean)
    .slice(0, 12);

  const body = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  ).slice(0, 6000);

  return [
    siteName && `Site: ${siteName}`,
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    headings.length && `Headings: ${headings.join(' | ')}`,
    body && `Body: ${body}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function stripTags(fragment) {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tries a few likely pages and returns the first that yields real text.
 * The whole thing is bounded by one timeout — this sits in front of a phone
 * call, so it must fail fast rather than fail thoroughly.
 */
export async function fetchSiteText(domain, { timeoutMs = 6000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const errors = [];
    for (const path of PATHS) {
      for (const scheme of ['https', 'http']) {
        try {
          const html = await getWithGuards(`${scheme}://${domain}${path}`, controller.signal);
          const text = extractText(html);
          if (text.length > 120) return { text, url: `${scheme}://${domain}${path}` };
        } catch (err) {
          errors.push(`${scheme}${path}:${err.message}`);
          if (controller.signal.aborted) return { text: null, reason: 'timeout' };
          // A private-address or scheme rejection is about the host, not the
          // path — retrying other paths just burns the clock.
          if (/^private_address|^bad_scheme|^dns_/.test(err.message)) {
            return { text: null, reason: err.message };
          }
        }
      }
    }
    return { text: null, reason: errors[0] || 'no_content' };
  } finally {
    clearTimeout(timer);
  }
}
