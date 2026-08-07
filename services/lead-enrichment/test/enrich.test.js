import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deriveDomain, isPrivateAddress, extractText, fetchSiteText } from '../src/fetch-site.js';
import { isGrounded, buildOpener, enrichLead } from '../src/enrich.js';

describe('deriveDomain', () => {
  test('takes the domain from a work address', () => {
    assert.equal(deriveDomain('toms@zarans.com'), 'zarans.com');
    assert.equal(deriveDomain('  Toms.Z@Sub.Example.CO.UK  '.trim()), 'sub.example.co.uk');
  });

  test('rejects personal mail providers — no company signal there', () => {
    for (const email of ['a@gmail.com', 'a@outlook.com', 'a@inbox.lv', 'a@proton.me', 'a@mail.ru']) {
      assert.equal(deriveDomain(email), null, email);
    }
  });

  test('rejects malformed input rather than guessing', () => {
    for (const bad of ['', 'nope', '@nope.com', 'a@', 'a@localhost', 'a@-x.com', null, undefined, 42]) {
      assert.equal(deriveDomain(bad), null, String(bad));
    }
  });
});

describe('isPrivateAddress — the SSRF gate', () => {
  test('refuses internal space', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '172.31.255.255',
      '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fd00::1',
      'fe80::1', '::ffff:10.0.0.1',
    ]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
  });

  test('allows public space', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });

  test('refuses anything it cannot parse', () => {
    for (const junk of ['', 'not-an-ip', '999.1.1.1', 'localhost']) {
      assert.equal(isPrivateAddress(junk), true, junk);
    }
  });
});

describe('extractText', () => {
  const html = `
    <html><head>
      <title>Baltic Freight — last-mile delivery</title>
      <meta name="description" content="We run last-mile grocery delivery in Riga and Tallinn.">
      <script>var tracking = "should not appear";</script>
      <style>.x { color: red }</style>
    </head><body>
      <nav>Home About Contact</nav>
      <h1>Groceries, delivered in ninety minutes</h1>
      <p>Founded in Riga, we operate a fleet of 40 vans.</p>
      <footer>copyright nonsense</footer>
    </body></html>`;

  test('pulls the parts that describe the company', () => {
    const text = extractText(html);
    assert.match(text, /Baltic Freight/);
    assert.match(text, /last-mile grocery delivery/);
    assert.match(text, /ninety minutes/);
    assert.match(text, /fleet of 40 vans/);
  });

  test('drops scripts, styles, nav and footer', () => {
    const text = extractText(html);
    assert.doesNotMatch(text, /should not appear/);
    assert.doesNotMatch(text, /color: red/);
    assert.doesNotMatch(text, /copyright nonsense/);
  });

  test('survives malformed html without throwing', () => {
    assert.doesNotThrow(() => extractText('<html><title>unclosed'));
    assert.equal(typeof extractText(''), 'string');
  });
});

describe('isGrounded — the hallucination gate', () => {
  const source =
    'Title: Baltic Freight. Description: We run last-mile grocery delivery in Riga and Tallinn. ' +
    'Body: Founded in Riga, we operate a fleet of 40 vans for supermarket chains.';

  test('passes a fact the page actually supports', () => {
    assert.equal(isGrounded('runs last-mile grocery delivery in Riga and Tallinn', source), true);
    assert.equal(isGrounded('operates a fleet of 40 vans for supermarket chains', source), true);
  });

  test('blocks the plausible invention — the one that would burn the call', () => {
    assert.equal(isGrounded('raised a Series B from Nordic investors last year', source), false);
    assert.equal(isGrounded('employs around 300 people across the Baltics', source), false);
    assert.equal(isGrounded('is the market leader in Estonian pharmaceutical logistics', source), false);
  });

  test('blocks empty and contentless facts', () => {
    assert.equal(isGrounded('', source), false);
    assert.equal(isGrounded('the and for with', source), false);
  });
});

describe('buildOpener', () => {
  const facts = ['runs last-mile grocery delivery in Riga and Tallinn'];

  test('always discloses that it is an AI — this is not optional', () => {
    const cases = [
      buildOpener({ name: 'Toms', facts, callerName: 'Acme', companyName: 'Baltic Freight' }),
      buildOpener({ name: 'Toms', facts: [], callerName: 'Acme' }),
      buildOpener({ facts: [], callerName: null }),
      buildOpener({ name: null, facts: [] }),
    ];
    for (const opener of cases) {
      assert.match(opener, /AI assistant/i, opener);
    }
  });

  test('uses the first name when it has one', () => {
    assert.match(buildOpener({ name: 'Toms Zarans', facts }), /^Hi Toms —/);
    assert.match(buildOpener({ name: '', facts }), /^Hi there —/);
    assert.match(buildOpener({ name: '<script>x</script>', facts }), /^Hi there —/);
  });

  test('weaves in the fact when there is one', () => {
    const opener = buildOpener({ name: 'Toms', facts, companyName: 'Baltic Freight' });
    assert.match(opener, /Baltic Freight/);
    assert.match(opener, /last-mile grocery delivery/);
  });

  test('falls back to a clean generic line when there are no facts', () => {
    const opener = buildOpener({ name: 'Toms', facts: [] });
    assert.match(opener, /Hi Toms/);
    assert.doesNotMatch(opener, /undefined|null|\[object/);
  });

  test('stays short enough to speak — a long opener gets talked over', () => {
    const longFact = 'operates ' + 'an extensively documented logistics network '.repeat(6);
    const opener = buildOpener({ name: 'Toms', facts: [longFact], companyName: 'Baltic Freight' });
    assert.ok(opener.length <= 260, `opener was ${opener.length} chars`);
    assert.match(opener, /AI assistant/i);
  });
});

describe('enrichLead — degrades instead of failing', () => {
  test('a personal email still yields a usable opener', async () => {
    const result = await enrichLead({ name: 'Toms', email: 'toms@gmail.com' });
    assert.equal(result.enriched, false);
    assert.equal(result.reason, 'free_or_invalid_email_domain');
    assert.deepEqual(result.facts, []);
    assert.match(result.opener, /Hi Toms/);
    assert.match(result.opener, /AI assistant/i);
  });

  test('no email at all still yields a usable opener', async () => {
    const result = await enrichLead({ name: 'Toms' });
    assert.equal(result.enriched, false);
    assert.equal(result.reason, 'no_email');
    assert.match(result.opener, /AI assistant/i);
  });

  test('garbage input does not throw', async () => {
    for (const junk of [null, undefined, 'string', 42, []]) {
      const result = await enrichLead(junk);
      assert.equal(result.enriched, false);
      assert.equal(typeof result.opener, 'string');
    }
  });

  test('reports how long it took, for the latency budget', async () => {
    const result = await enrichLead({ name: 'Toms', email: 'toms@gmail.com' });
    assert.equal(typeof result.ms, 'number');
    assert.ok(result.ms >= 0);
  });
});

describe('fetchSiteText', () => {
  test('gives up cleanly on a domain that does not resolve', async () => {
    const result = await fetchSiteText('nx-does-not-exist-9f3a2b.invalid', { timeoutMs: 3000 });
    assert.equal(result.text, null);
    assert.match(result.reason, /^dns_/);
  });
});
