#!/usr/bin/env node
import { enrichLead } from './enrich.js';

/** Try it against a real lead: node src/cli.js --email a@b.com --name "Toms" */

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  args[key] = process.argv[i + 1];
}

if (!args.email) {
  console.error('usage: node src/cli.js --email <email> [--name <name>] [--caller-name <company>]');
  process.exit(1);
}

const result = await enrichLead({
  email: args.email,
  name: args.name,
  company: args.company,
  caller_name: args['caller-name'],
});

console.log(JSON.stringify(result, null, 2));
console.log('\n--- what the agent says first ---\n');
console.log(result.opener);
console.log(`\n(${result.opener.length} chars, ~${Math.round(result.opener.split(/\s+/).length / 2.5)}s spoken)`);
