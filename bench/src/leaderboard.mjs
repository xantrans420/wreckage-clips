// Folds every recorded run into results/leaderboard.json, the single file the
// static page reads.
//
// The benchmark is longitudinal: one painting, re-run over time. So the file
// carries three things, not one - the standings from the latest run, a per-model
// score history across all runs, and a timeline of the subject painting itself so
// the gallery can show a model's attempts side by side, oldest to newest.
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR, RUNS_DIR, REFS_DIR, SUBJECT, BRIEF_SUBJECT, TRACKS, PROMPT_VERSION, RUBRIC_VERSION, readJSON, writeJSON, listRuns, log } from './config.mjs';
import { rubricFor } from './judge.mjs';
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

// A model is on the speed/quality frontier when no other model is both at least as
// fast and at least as good (and strictly better on one). A model that produced
// nothing is never a defensible pick, however fast it was.
function markPareto(rows) {
  for (const a of rows) {
    a.pareto = a.overall > 0 && !rows.some((b) =>
      b !== a && b.avgLatencyMs > 0 && a.avgLatencyMs > 0 &&
      b.overall >= a.overall && b.avgLatencyMs <= a.avgLatencyMs &&
      (b.overall > a.overall || b.avgLatencyMs < a.avgLatencyMs));
  }
}

// One model/subject cell, or null when nothing was recorded or the result was
// produced under a prompt or rubric version that is no longer comparable.
function readEntry(runId, modelSlug, subjectSlug) {
  const dir = path.join(RUNS_DIR, runId, modelSlug, subjectSlug);
  const meta = readJSON(path.join(dir, 'meta.json'), null);
  if (!meta) return null;
  if (meta.promptVersion !== PROMPT_VERSION) {
    log(`skip ${runId}/${modelSlug}/${subjectSlug}: prompt v${meta.promptVersion} != v${PROMPT_VERSION}`);
    return null;
  }
  const score = readJSON(path.join(dir, 'score.json'), null);
  if (score && score.judge?.rubricVersion !== RUBRIC_VERSION) {
    log(`skip ${runId}/${modelSlug}/${subjectSlug}: rubric v${score.judge?.rubricVersion} != v${RUBRIC_VERSION}`);
    return null;
  }
  const failed = meta.disqualified || meta.status !== 'ok';
  const svg = path.join(dir, 'art.svg');
  const png = path.join(dir, 'art.png');
  return {
    run: runId,
    subject: subjectSlug,
    track: meta.track || 'recall',
    status: meta.status,
    disqualified: !!meta.disqualified,
    reasons: meta.reasons || [],
    strippedText: meta.strippedText || 0,
    total: failed ? 0 : score ? score.total : null,
    scores: failed ? null : score?.scores ?? null,
    issues: score?.issues ?? [],
    verdict: failed
      ? `Not judged: ${[meta.status, ...(meta.reasons || [])].filter((x) => x && x !== 'ok').join(', ')}`
      : score?.verdict ?? null,
    svg: fs.existsSync(svg) ? rel(svg) : null,
    png: fs.existsSync(png) ? rel(png) : null,
    stats: meta.stats || null,
    latencyMs: meta.latencyMs ?? null,
    usage: meta.usage || null,
    servedBy: meta.servedBy || null,
    judgeModel: score?.judge?.model ?? null,
  };
}

// Everything one model did in one run on one track, aggregated. Tracks are scored
// on different rubrics, so their numbers are never pooled.
function summarise(entries, rubric, of) {
  const done = entries.filter((e) => e.total !== null);
  if (!done.length) return null;
  const times = done.filter((e) => e.latencyMs != null).map((e) => e.latencyMs);
  return {
    overall: round1(mean(done.map((e) => e.total))),
    criteria: Object.fromEntries(rubric.map((r) => {
      const vals = done.filter((e) => e.scores).map((e) => e.scores[r.key]);
      return [r.key, vals.length ? round1(mean(vals)) : 0];
    })),
    judged: done.length,
    of,
    disqualified: done.filter((e) => e.disqualified).length,
    failed: done.filter((e) => e.status !== 'ok' && !e.disqualified).length,
    avgBytes: Math.round(mean(done.filter((e) => e.stats).map((e) => e.stats.bytes)) || 0),
    avgLatencyMs: Math.round(mean(times) || 0),
    medianLatencyMs: Math.round(median(times) ?? 0),
    minLatencyMs: times.length ? Math.min(...times) : null,
    maxLatencyMs: times.length ? Math.max(...times) : null,
    avgOutputTokens: Math.round(mean(done.filter((e) => e.usage?.output != null).map((e) => e.usage.output)) || 0),
  };
}

export function buildLeaderboard({ subjects, models }) {
  const runIds = listRuns();
  const judges = new Set();

  // run -> model -> subject -> entry
  const byRun = {};
  for (const runId of runIds) {
    byRun[runId] = {};
    for (const model of models) {
      const cells = {};
      for (const sub of subjects) {
        const e = readEntry(runId, model.slug, sub.slug);
        if (!e) continue;
        e.track = sub.track;            // the manifest is authoritative, not the stored meta
        cells[sub.slug] = e;
        if (e.judgeModel) judges.add(e.judgeModel);
      }
      if (Object.keys(cells).length) byRun[runId][model.slug] = cells;
    }
  }
  const runsWithData = runIds.filter((id) => Object.keys(byRun[id]).length);
  const latest = runsWithData[runsWithData.length - 1] ?? null;

  const paintingMeta = (p) => {
    if (p.track === 'brief') {
      return { slug: p.slug, track: 'brief', title: p.title, format: p.format, subject: p.subject,
               brief: p.brief, checklist: p.checklist || [], ref: null,
               aspect: p.canvas[0] / p.canvas[1] };
    }
    const ref = loadRef(p.slug);
    return {
      slug: p.slug, track: 'recall', tier: p.tier, title: p.title, artist: p.artist, year: p.year, medium: p.medium,
      ref: ref ? rel(path.join(REFS_DIR, `${p.slug}.jpg`)) : null,
      commonsUrl: ref?.commonsUrl ?? null,
      license: ref?.license ?? null,
      aspect: ref ? ref.width / ref.height : 1,
    };
  };

  const tracks = {};
  for (const key of ['recall', 'brief']) {
    const trackSubjects = subjects.filter((s) => s.track === key);
    if (!trackSubjects.length) continue;
    const rubric = rubricFor(key);
    const fixed = trackSubjects.find((s) => s.slug === (key === 'brief' ? BRIEF_SUBJECT : SUBJECT)) ?? trackSubjects[0];
    const cellsFor = (runId, modelSlug) =>
      trackSubjects.map((s) => byRun[runId]?.[modelSlug]?.[s.slug]).filter(Boolean);

    const rows = [];
    for (const [order, model] of models.entries()) {
      const summary = latest ? summarise(cellsFor(latest, model.slug), rubric, trackSubjects.length) : null;
      // History is the point of the exercise: the same task, scored again each run.
      const history = runsWithData.map((id) => {
        const sm = summarise(cellsFor(id, model.slug), rubric, trackSubjects.length);
        return sm ? { run: id, total: sm.overall, avgLatencyMs: sm.avgLatencyMs, judged: sm.judged } : null;
      }).filter(Boolean);
      if (!summary && !history.length) continue;
      rows.push({
        slug: model.slug, label: model.label || model.model, provider: model.provider, model: model.model,
        order, // stable roster position; the page keys chart colour off this
        ...(summary || { overall: 0, criteria: {}, judged: 0, of: trackSubjects.length, disqualified: 0, failed: 0, avgBytes: 0, avgLatencyMs: 0, medianLatencyMs: 0 }),
        history,
        firstSeen: history[0]?.run ?? null,
        delta: history.length > 1 ? round1(history[history.length - 1].total - history[0].total) : null,
      });
    }
    rows.sort((a, b) => (b.judged === b.of) - (a.judged === a.of) || b.overall - a.overall);
    rows.forEach((r, i) => (r.rank = i + 1));
    markPareto(rows);

    // Every attempt at the fixed subject, per model, oldest run first.
    const timeline = {};
    for (const model of models) {
      const shots = runsWithData.map((id) => byRun[id][model.slug]?.[fixed.slug]).filter(Boolean);
      if (shots.length) timeline[model.slug] = shots;
    }

    tracks[key] = {
      ...TRACKS[key],
      subject: paintingMeta(fixed),
      subjects: trackSubjects.map(paintingMeta),
      rubric,
      models: rows,
      timeline,
      entries: latest ? Object.fromEntries(models.map((m) => [m.slug,
        Object.fromEntries(trackSubjects.map((s) => [s.slug, byRun[latest]?.[m.slug]?.[s.slug]]).filter(([, v]) => v))])) : {},
    };
  }

  const board = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    rubricVersion: RUBRIC_VERSION,
    judge: { models: [...judges] },
    mock: judges.has('mock') || models.some((m) => m.provider === 'mock'),
    runs: runsWithData.map((id) => ({
      id,
      models: Object.keys(byRun[id]).length,
      scored: Object.values(byRun[id]).reduce((n, cells) => n + Object.values(cells).filter((e) => e.total !== null).length, 0),
    })),
    latestRun: latest,
    tracks,
  };
  const out = path.join(RESULTS_DIR, 'leaderboard.json');
  writeJSON(out, board);
  log(`leaderboard: ${runsWithData.length} run(s), tracks ${Object.keys(tracks).join(' + ')}, latest ${latest ?? 'none'} -> ${rel(out)}`);
  return board;
}
