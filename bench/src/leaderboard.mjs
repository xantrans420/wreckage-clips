// Folds results/<model>/<painting>/{meta,score}.json into results/leaderboard.json,
// the single file the static page reads.
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR, REFS_DIR, PROMPT_VERSION, RUBRIC_VERSION, readJSON, writeJSON, log } from './config.mjs';
import { RUBRIC } from './judge.mjs';
import { loadRef } from './refs.mjs';

const rel = (abs) => path.relative(path.dirname(RESULTS_DIR), abs).split(path.sep).join('/');
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// A model is on the speed/quality frontier when no other model is both at least
// as fast and at least as good (and strictly better on one of the two). These are
// the only defensible picks; everything else is beaten outright on both axes.
function markPareto(rows) {
  for (const a of rows) {
    // A model that produced nothing is never a defensible pick, however fast it was.
    a.pareto = a.overall > 0 && !rows.some((b) =>
      b !== a &&
      b.avgLatencyMs > 0 && a.avgLatencyMs > 0 &&
      b.overall >= a.overall && b.avgLatencyMs <= a.avgLatencyMs &&
      (b.overall > a.overall || b.avgLatencyMs < a.avgLatencyMs));
  }
}

export function buildLeaderboard({ paintings, models }) {
  const judges = new Set();
  const entries = {};
  const rows = [];

  for (const model of models) {
    const perPainting = {};
    for (const p of paintings) {
      const dir = path.join(RESULTS_DIR, model.slug, p.slug);
      const meta = readJSON(path.join(dir, 'meta.json'), null);
      if (!meta) continue;
      if (meta.promptVersion !== PROMPT_VERSION) {
        log(`skip ${model.slug}/${p.slug}: prompt v${meta.promptVersion} != current v${PROMPT_VERSION}`);
        continue;
      }
      const score = readJSON(path.join(dir, 'score.json'), null);
      if (score && score.judge?.rubricVersion !== RUBRIC_VERSION) {
        log(`skip ${model.slug}/${p.slug}: rubric v${score.judge?.rubricVersion} != current v${RUBRIC_VERSION}`);
        continue;
      }
      if (score) judges.add(score.judge.model);
      const failed = meta.disqualified || meta.status !== 'ok';
      perPainting[p.slug] = {
        status: meta.status,
        disqualified: !!meta.disqualified,
        reasons: meta.reasons || [],
        strippedText: meta.strippedText || 0,
        total: failed ? 0 : score ? score.total : null,
        scores: failed ? null : score?.scores ?? null,
        issues: score?.issues ?? [],
        verdict: failed ? `Not judged: ${[meta.status, ...(meta.reasons || [])].filter((x) => x && x !== 'ok').join(', ')}` : score?.verdict ?? null,
        svg: fs.existsSync(path.join(dir, 'art.svg')) ? rel(path.join(dir, 'art.svg')) : null,
        png: fs.existsSync(path.join(dir, 'art.png')) ? rel(path.join(dir, 'art.png')) : null,
        stats: meta.stats || null,
        latencyMs: meta.latencyMs ?? null,
        usage: meta.usage || null,
        servedBy: meta.servedBy || null,
      };
    }
    entries[model.slug] = perPainting;

    const done = Object.values(perPainting).filter((e) => e.total !== null);
    if (done.length === 0) continue;
    const times = done.filter((e) => e.latencyMs != null).map((e) => e.latencyMs);
    const criteria = Object.fromEntries(RUBRIC.map((r) => {
      const vals = done.filter((e) => e.scores).map((e) => e.scores[r.key]);
      return [r.key, vals.length ? round1(mean(vals)) : 0];
    }));
    rows.push({
      slug: model.slug,
      label: model.label || model.model,
      provider: model.provider,
      model: model.model,
      overall: round1(mean(done.map((e) => e.total))),
      monaLisa: perPainting['mona-lisa']?.total ?? null,
      criteria,
      judged: done.length,
      of: paintings.length,
      disqualified: done.filter((e) => e.disqualified).length,
      failed: done.filter((e) => e.status !== 'ok' && !e.disqualified).length,
      avgBytes: Math.round(mean(done.filter((e) => e.stats).map((e) => e.stats.bytes)) || 0),
      avgLatencyMs: Math.round(mean(times) || 0),
      medianLatencyMs: Math.round(median(times) ?? 0),
      minLatencyMs: times.length ? Math.min(...times) : null,
      maxLatencyMs: times.length ? Math.max(...times) : null,
      avgOutputTokens: Math.round(mean(done.filter((e) => e.usage?.output != null).map((e) => e.usage.output)) || 0),
    });
  }

  // Full coverage ranks above partial coverage; within a group, by overall.
  rows.sort((a, b) => (b.judged === b.of) - (a.judged === a.of) || b.overall - a.overall || (b.monaLisa ?? -1) - (a.monaLisa ?? -1));
  rows.forEach((r, i) => (r.rank = i + 1));
  markPareto(rows);

  const board = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    rubricVersion: RUBRIC_VERSION,
    judge: { models: [...judges], rubric: RUBRIC },
    mock: judges.has('mock') || models.some((m) => m.provider === 'mock'),
    paintings: paintings.map((p) => {
      const ref = loadRef(p.slug);
      return {
        slug: p.slug, tier: p.tier, title: p.title, artist: p.artist, year: p.year, medium: p.medium,
        ref: ref ? rel(path.join(REFS_DIR, `${p.slug}.jpg`)) : null,
        commonsUrl: ref?.commonsUrl ?? null,
        license: ref?.license ?? null,
        aspect: ref ? ref.width / ref.height : 1,
      };
    }),
    models: rows,
    entries,
  };
  const out = path.join(RESULTS_DIR, 'leaderboard.json');
  writeJSON(out, board);
  log(`leaderboard: ${rows.length} ranked models, ${Object.values(entries).reduce((n, e) => n + Object.keys(e).length, 0)} entries -> ${rel(out)}`);
  return board;
}
