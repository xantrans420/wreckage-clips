import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REFS_DIR = path.join(BENCH_DIR, 'refs');
export const RESULTS_DIR = process.env.PAINTBENCH_RESULTS_DIR
  ? path.resolve(process.env.PAINTBENCH_RESULTS_DIR)
  : path.join(BENCH_DIR, 'results');
export const RUNS_DIR = path.join(RESULTS_DIR, 'runs');

// The benchmark is longitudinal: one painting, re-run over time, so the interesting
// number is how a model's score on the SAME task moves release over release. Every
// result therefore lives under a dated run and old runs are never overwritten.
export const SUBJECT = 'mona-lisa';        // recall track: the fixed painting
export const BRIEF_SUBJECT = 'the-salon';  // brief track: the fixed brief

export const TRACKS = {
  recall: { key: 'recall', label: 'Recall', blurb: 'One famous painting, drawn from memory. Tests whether a model knows the picture and can draw it.' },
  brief:  { key: 'brief',  label: 'Brief',  blurb: 'One written brief, no reference of any kind. Tests whether a model can invent and construct a scene it has never seen.' },
};

// Bump these when the contestant prompt or the judge rubric changes. Results
// produced under a different version are not comparable and the leaderboard
// builder refuses to mix them.
export const PROMPT_VERSION = 2;   // v2: two tracks; system prompt reworded for both
export const RUBRIC_VERSION = 2;   // v2: brief track adds adherence + likeness

export const USER_AGENT = 'paintbench/0.1 (https://github.com/xantrans420/wreckage-clips)';
export const DEFAULT_JUDGE_MODEL = 'claude-fable-5-1';
export const DEFAULT_MAX_TOKENS = 24000;
export const DEFAULT_RENDER_WIDTH = 1024;

export function loadEnv() {
  const file = path.join(BENCH_DIR, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function readJSON(file, fallback = undefined) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function loadPaintings() {
  return readJSON(path.join(BENCH_DIR, 'paintings.json')).paintings.map((p) => ({ ...p, track: 'recall' }));
}

export function loadBriefs() {
  return readJSON(path.join(BENCH_DIR, 'briefs.json')).briefs.map((b) => ({ ...b, track: 'brief' }));
}

// Everything a run can be asked to produce, across both tracks.
export function loadSubjects() {
  return [...loadPaintings(), ...loadBriefs()];
}

export function loadModels() {
  return readJSON(path.join(BENCH_DIR, 'models.json')).models
    .filter((m) => m.enabled !== false)
    .map((m) => ({ ...m, slug: m.slug || slugify(`${m.provider}-${m.model}`) }));
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function entryDir(runId, modelSlug, paintingSlug) {
  return path.join(RUNS_DIR, runId, modelSlug, paintingSlug);
}

export function todayRunId() {
  return new Date().toISOString().slice(0, 10);
}

// Run ids sort lexicographically because they are ISO dates (an optional -2, -3
// suffix keeps a second run on the same day distinct and still ordered).
export function listRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

// Tiny argv parser: `cmd --flag value --bool --k=v positional`
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[a.slice(2)] = argv[++i];
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const csv = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

// By default a run does exactly two things: the one painting and the one brief.
// The rest of the canon is opt-in (--all / --tier / --paintings) and exists for
// one-off comparisons, never for the time series, which needs the task held fixed.
export function selectSubjects(all, flags) {
  const slugs = csv(flags.paintings) || csv(flags.subjects);
  const tiers = csv(flags.tier)?.map((t) => t.toUpperCase());
  const tracks = csv(flags.track);
  let out = all;
  if (tracks) out = out.filter((s) => tracks.includes(s.track));
  if (slugs) return out.filter((s) => slugs.includes(s.slug));
  if (tiers) return out.filter((s) => tiers.includes(s.tier));
  if (flags.all) return out;
  return out.filter((s) => s.slug === SUBJECT || s.slug === BRIEF_SUBJECT);
}

export function selectModels(all, flags) {
  const slugs = csv(flags.models);
  return all.filter((m) => !slugs || slugs.includes(m.slug));
}

// Minimal concurrency limiter (no dependency).
export function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}]`, ...args);
}
