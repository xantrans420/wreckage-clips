#!/usr/bin/env node
/**
 * Creates the Twilio compliance profile and buys a number, from the command
 * line, so nobody has to fill in the console forms.
 *
 * Your credentials are read from your own environment and are never written to
 * disk, never logged, and never leave your machine.
 *
 *   export TWILIO_ACCOUNT_SID=AC...
 *   export TWILIO_AUTH_TOKEN=...
 *
 *   node scripts/twilio-setup.mjs check          # are the credentials good
 *   node scripts/twilio-setup.mjs profile        # build + submit the compliance profile
 *   node scripts/twilio-setup.mjs numbers LV mobile
 *   node scripts/twilio-setup.mjs buy +371XXXXXXXX --confirm
 *
 * Everything is idempotent-ish and nothing costs money without --confirm.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Twilio's published policy for a primary business customer profile.
const PRIMARY_POLICY_SID = 'RNdfbf3fae0e1107f8aded0e7cead80bf5';

const API = `https://api.twilio.com/2010-04-01/Accounts/${SID}`;
const TRUSTHUB = 'https://trusthub.twilio.com/v1';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function die(msg) {
  console.error(`\n${c.red('✗')} ${msg}\n`);
  process.exit(1);
}

if (!SID || !TOKEN) {
  die(
    'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set.\n' +
      '  Find both on the Twilio Console home page, then:\n' +
      '    export TWILIO_ACCOUNT_SID=AC...\n' +
      '    export TWILIO_AUTH_TOKEN=...'
  );
}
if (!SID.startsWith('AC')) die('TWILIO_ACCOUNT_SID should start with "AC".');

const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');

async function call(method, url, params) {
  const opts = { method, headers: { Authorization: auth } };
  if (params) {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const detail = body.message || body.detail || body.raw || res.statusText;
    const err = new Error(`${res.status} ${detail}`);
    err.twilio = body;
    throw err;
  }
  return body;
}

function loadConfig() {
  const path = join(HERE, 'rizz.config.json');
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    die(`Could not read ${path}: ${e.message}`);
  }
  const missing = [];
  for (const [k, v] of Object.entries(cfg.representative)) {
    if (k.startsWith('_')) continue;
    if (!v) missing.push(`representative.${k}`);
  }
  if (!cfg.profile.notificationEmail) missing.push('profile.notificationEmail');
  if (missing.length) {
    die(
      `Fill these into scripts/rizz.config.json first — only you have them:\n` +
        missing.map((m) => `    ${m}`).join('\n')
    );
  }
  return cfg;
}

// ── check ────────────────────────────────────────────────────────────────────

async function check() {
  const acct = await call('GET', `${API}.json`);
  console.log(`\n${c.green('✓')} credentials work`);
  console.log(`  account   ${acct.friendly_name}`);
  console.log(`  status    ${acct.status}`);
  console.log(`  type      ${acct.type}`);

  if (acct.type === 'Trial') {
    console.log(
      `\n${c.yellow('!')} This is a ${c.bold('trial')} account. Trial numbers can only call ` +
        `numbers you have\n  verified in the console — useless the moment you dial a real ` +
        `prospect.\n  Add a card in Billing before going further.`
    );
  }

  const profiles = await call('GET', `${TRUSTHUB}/CustomerProfiles?PageSize=20`);
  const list = profiles.results || [];
  console.log(`\n  compliance profiles: ${list.length}`);
  for (const p of list) {
    const mark = p.status === 'twilio-approved' ? c.green('✓') : c.yellow('…');
    console.log(`   ${mark} ${p.sid}  ${p.status}  ${p.friendly_name}`);
  }
  if (!list.length) console.log(c.dim('    none yet — run: node scripts/twilio-setup.mjs profile'));
  console.log();
}

// ── profile ──────────────────────────────────────────────────────────────────

async function profile() {
  const cfg = loadConfig();
  const { business, address, representative } = cfg;

  console.log(`\n${c.bold('Building compliance profile for')} ${business.legalName}\n`);

  // 1. Address on the account, referenced by the supporting document.
  process.stdout.write('  address ............... ');
  const addr = await call('POST', `${API}/Addresses.json`, {
    CustomerName: address.customerName,
    Street: address.street,
    City: address.city,
    Region: address.region,
    PostalCode: address.postalCode,
    IsoCountry: address.isoCountry,
    FriendlyName: `${business.legalName} registered address`,
  });
  console.log(c.green(addr.sid));

  // 2. Supporting document wrapping that address.
  process.stdout.write('  address document ...... ');
  const doc = await call('POST', `${TRUSTHUB}/SupportingDocuments`, {
    FriendlyName: `${business.legalName} address`,
    Type: 'customer_profile_address',
    Attributes: JSON.stringify({ address_sids: [addr.sid] }),
  });
  console.log(c.green(doc.sid));

  // 3. Business information.
  process.stdout.write('  business info ......... ');
  const biz = await call('POST', `${TRUSTHUB}/EndUsers`, {
    FriendlyName: `${business.legalName} business information`,
    Type: 'customer_profile_business_information',
    Attributes: JSON.stringify({
      business_name: business.legalName,
      business_type: business.businessType,
      business_registration_identifier: business.registrationIdentifier,
      business_registration_number: business.registrationNumber,
      business_identity: business.businessIdentity,
      business_industry: business.businessIndustry,
      business_regions_of_operation: business.businessRegionsOfOperation,
      website_url: business.websiteUrl,
      social_media_profile_urls: business.socialMediaProfileUrls || '',
    }),
  });
  console.log(c.green(biz.sid));

  // 4. The named human who attests to it.
  process.stdout.write('  representative ........ ');
  const rep = await call('POST', `${TRUSTHUB}/EndUsers`, {
    FriendlyName: `${representative.firstName} ${representative.lastName}`,
    Type: 'authorized_representative_1',
    Attributes: JSON.stringify({
      first_name: representative.firstName,
      last_name: representative.lastName,
      email: representative.email,
      phone_number: representative.phoneNumber,
      business_title: representative.businessTitle,
      job_position: representative.jobPosition,
    }),
  });
  console.log(c.green(rep.sid));

  // 5. The profile itself.
  process.stdout.write('  profile ............... ');
  const prof = await call('POST', `${TRUSTHUB}/CustomerProfiles`, {
    FriendlyName: cfg.profile.friendlyName,
    Email: cfg.profile.notificationEmail,
    PolicySid: PRIMARY_POLICY_SID,
  });
  console.log(c.green(prof.sid));

  // 6. Attach everything.
  process.stdout.write('  attaching ............. ');
  for (const objectSid of [doc.sid, biz.sid, rep.sid]) {
    await call('POST', `${TRUSTHUB}/CustomerProfiles/${prof.sid}/EntityAssignments`, {
      ObjectSid: objectSid,
    });
  }
  console.log(c.green('done'));

  // 7. Ask Twilio what's still wrong BEFORE submitting. Submitting an
  //    incomplete profile costs days of review turnaround.
  process.stdout.write('  validating ............ ');
  const evaluation = await call('POST', `${TRUSTHUB}/CustomerProfiles/${prof.sid}/Evaluations`, {
    PolicySid: PRIMARY_POLICY_SID,
  });

  if (evaluation.status !== 'compliant') {
    console.log(c.red('failed'));
    console.log(`\n${c.red('✗')} Twilio says the profile is incomplete:\n`);
    for (const r of evaluation.results || []) {
      for (const f of r.fields || []) {
        if (f.passed) continue;
        console.log(`    ${c.red('•')} ${f.friendly_name}: ${f.failure_reason}`);
      }
    }
    console.log(
      `\n  Nothing was submitted. Fix scripts/rizz.config.json and re-run.\n` +
        `  Profile SID (if you want to inspect it in the console): ${prof.sid}\n`
    );
    process.exit(1);
  }
  console.log(c.green('compliant'));

  // 8. Submit.
  process.stdout.write('  submitting ............ ');
  const submitted = await call('POST', `${TRUSTHUB}/CustomerProfiles/${prof.sid}`, {
    Status: 'pending-review',
  });
  console.log(c.green(submitted.status));

  console.log(
    `\n${c.green('✓')} Submitted. ${c.bold(prof.sid)}\n\n` +
      `  Twilio reviews it — usually minutes to a couple of days. You'll get an\n` +
      `  email at ${cfg.profile.notificationEmail}.\n\n` +
      `  Check status any time:  node scripts/twilio-setup.mjs check\n` +
      `  Once approved:          node scripts/twilio-setup.mjs numbers LV mobile\n`
  );
}

// ── numbers ──────────────────────────────────────────────────────────────────

const TYPES = { local: 'Local', mobile: 'Mobile', national: 'National', tollfree: 'TollFree' };

async function numbers(country = 'LV', type = 'mobile') {
  const kind = TYPES[type.toLowerCase()];
  if (!kind) die(`Unknown type "${type}". One of: ${Object.keys(TYPES).join(', ')}`);

  const url = `${API}/AvailablePhoneNumbers/${country.toUpperCase()}/${kind}.json?VoiceEnabled=true&PageSize=20`;
  let res;
  try {
    res = await call('GET', url);
  } catch (e) {
    if (String(e.message).includes('404')) {
      die(`Twilio has no ${kind} numbers for ${country.toUpperCase()}. Try another type or country.`);
    }
    throw e;
  }

  const found = res.available_phone_numbers || [];
  if (!found.length) {
    console.log(`\n  No ${kind} numbers available in ${country.toUpperCase()} right now.\n`);
    return;
  }

  console.log(`\n  ${found.length} ${kind} number(s) in ${country.toUpperCase()}:\n`);
  for (const n of found) {
    const needs = n.address_requirements;
    const flag =
      needs && needs !== 'none' ? c.yellow(`needs ${needs} address`) : c.green('no extra docs');
    console.log(`   ${c.bold(n.phone_number)}  ${n.friendly_name.padEnd(20)}  ${flag}`);
  }
  console.log(`\n  Buy one:  node scripts/twilio-setup.mjs buy ${found[0].phone_number} --confirm\n`);
}

// ── buy ──────────────────────────────────────────────────────────────────────

async function buy(number, ...flags) {
  if (!number) die('Which number? e.g. node scripts/twilio-setup.mjs buy +371XXXXXXXX --confirm');
  if (!flags.includes('--confirm')) {
    console.log(
      `\n  This ${c.bold('purchases')} ${number} and starts a recurring monthly charge.\n` +
        `  Re-run with --confirm if that's what you want.\n`
    );
    return;
  }
  const bought = await call('POST', `${API}/IncomingPhoneNumbers.json`, { PhoneNumber: number });
  console.log(
    `\n${c.green('✓')} Bought ${c.bold(bought.phone_number)}  (${bought.sid})\n\n` +
      `  Next: ElevenLabs → Phone Numbers → Import from Twilio.\n` +
      `  It asks for the Account SID, the Auth Token, and this number.\n`
  );
}

// ── dispatch ─────────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);
const commands = { check, profile, numbers, buy };

if (!commands[cmd]) {
  console.log(`
  ${c.bold('twilio-setup')}

    node scripts/twilio-setup.mjs check                     verify credentials, list profiles
    node scripts/twilio-setup.mjs profile                   build + submit the compliance profile
    node scripts/twilio-setup.mjs numbers [country] [type]  search  (default: LV mobile)
    node scripts/twilio-setup.mjs buy <number> --confirm    purchase

  Credentials come from TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your
  environment. They are never written to disk or printed.
`);
  process.exit(commands[cmd] ? 0 : 1);
}

commands[cmd](...args).catch((e) => {
  console.error(`\n${c.red('✗')} ${e.message}`);
  if (e.twilio?.more_info) console.error(c.dim(`  ${e.twilio.more_info}`));
  console.error();
  process.exit(1);
});
