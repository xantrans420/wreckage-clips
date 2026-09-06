#!/usr/bin/env node
// PaintBench CLI: refs -> generate -> render -> judge -> build (-> serve)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

// `smoke` writes to a throwaway results dir; set it before config.mjs is evaluated.
const rawArgs = process.argv.slice(2);
if (rawArgs[0] === 'smoke' && !process.env.PAINTBENCH_RESULTS_DIR) {
  process.env.PAINTBENCH_RESULTS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'results-mock');
}

const cfg = await import('./config.mjs');
const { fetchRefs, loadRef, refImagePath } = await import('./refs.mjs');
const { SYSTEM_PROMPT, buildUserPrompt } = await import('./prompt.mjs');
const { generate, providerReady } = await import('./providers.mjs');
const { extractSvg, sanitizeSvg, svgStats } = await import('./svg.mjs');
const { renderSvgToPng, closeRenderer } = await import('./render.mjs');
const { judgeEntry } = await import('./judge.mjs');
const { buildLeaderboard } = await import('./leaderboard.mjs');
const { log, readJSON, writeJSON, entryDir, pLimit, parseArgs, selectPaintings, selectModels } = cfg;

cfg.loadEnv();
const args = parseArgs(rawArgs);
const cmd = args._[0] || 'help';
const allPaintings = cfg.loadPaintings();
const paintings = selectPaintings(allPaintings, args);
// Every result belongs to a dated run so the same painting can be re-benchmarked
// over time without overwriting history.
const runId = () => String(args.run || cfg.todayRunId());

const MOCK_MODELS = [
  { slug: 'mock-plain', label: 'Mock (plain)', provider: 'mock', model: 'mock', mockLatencyMs: 42000 },
  { slug: 'mock-fast', label: 'Mock (fast)', provider: 'mock', model: 'mock', mockLatencyMs: 9000 },
  { slug: 'mock-slow', label: 'Mock (slow)', provider: 'mock', model: 'mock', mockLatencyMs: 310000 },
  { slug: 'mock-text', label: 'Mock (text stripped)', provider: 'mock', model: 'mock', mockVariant: 'text', mockLatencyMs: 70000 },
  { slug: 'mock-image', label: 'Mock (embedded image, DQ)', provider: 'mock', model: 'mock', mockVariant: 'image', mockLatencyMs: 25000 },
  { slug: 'mock-garbage', label: 'Mock (no SVG)', provider: 'mock', model: 'mock', mockVariant: 'garbage', mockLatencyMs: 5000 },
];
const allModels = cmd === 'smoke' ? MOCK_MODELS : cfg.loadModels();
const models = selectModels(allModels, args);

const HELP = `PaintBench: AI models recreate famous paintings as SVG; Claude Fable 5.1 judges.

  paintbench refs      [--force]                      fetch reference images from Wikimedia Commons
  paintbench list                                     show contestants (with key status) and paintings
  paintbench runs                                     list recorded runs
  paintbench generate  [filters] [--force] [--concurrency 3] [--max-tokens ${cfg.DEFAULT_MAX_TOKENS}]
  paintbench render    [filters] [--force] [--renderer resvg|chromium] [--width ${cfg.DEFAULT_RENDER_WIDTH}]
  paintbench judge     [filters] [--rejudge] [--judge-model ${cfg.DEFAULT_JUDGE_MODEL}] [--effort high] [--samples 1] [--concurrency 2]
  paintbench build                                    write results/leaderboard.json
  paintbench run       [filters + all flags above]    generate -> render -> judge -> build
  paintbench smoke                                    full pipeline with mock models + mock judge into results-mock/
  paintbench serve     [--port 8787]                  static server for the leaderboard page

The benchmark subject is ONE painting (${cfg.SUBJECT}), re-run over time so model
progress on a fixed task is visible. Pass --all (or --tier/--paintings) to also run
the wider canon for a one-off comparison.

filters:  --models slug,slug   --paintings slug,slug   --tier S,A,B   --all
run:      --run ${cfg.todayRunId()}   (dated bucket every result is written under)
results:  ${cfg.RESULTS_DIR}
`;

const commands = { refs, list, runs: cmdRuns, generate: cmdGenerate, render: cmdRender, judge: cmdJudge, build: cmdBuild, run: cmdRun, smoke: cmdRun, serve };
if (!commands[cmd]) {
  console.log(HELP);
  process.exit(cmd === 'help' ? 0 : 1);
}
try {
  await commands[cmd]();
} finally {
  await closeRenderer();
}

// ------------------------------------------------------------------ commands
async function refs() {
  await fetchRefs(allPaintings, { force: !!args.force });
}

function list() {
  console.log('Contestants:');
  for (const m of allModels) {
    const r = providerReady(m);
    console.log(`  ${r.ok ? 'ready  ' : 'NO KEY '} ${m.slug.padEnd(22)} ${m.provider.padEnd(10)} ${m.model}${r.ok ? '' : `   (${r.why})`}`);
  }
  console.log('\nPaintings:');
  for (const p of allPaintings) {
    console.log(`  [${p.tier}] ${p.slug.padEnd(28)} ${p.title} - ${p.artist}, ${p.year}${loadRef(p.slug) ? '' : '   (no ref yet: run `refs`)'}`);
  }
}

function cmdRuns() {
  const runs = cfg.listRuns();
  if (!runs.length) return console.log('No runs recorded yet.');
  for (const id of runs) {
    const models = fs.readdirSync(path.join(cfg.RUNS_DIR, id)).filter((d) => !d.startsWith('.'));
    const scored = models.reduce((n, m) => n + fs.readdirSync(path.join(cfg.RUNS_DIR, id, m))
      .filter((p) => fs.existsSync(path.join(cfg.RUNS_DIR, id, m, p, 'score.json'))).length, 0);
    console.log(`  ${id}   ${String(models.length).padStart(2)} models   ${String(scored).padStart(3)} scored entries`);
  }
}

async function cmdGenerate() {
  const maxTokens = Number(args['max-tokens'] || cfg.DEFAULT_MAX_TOKENS);
  const limit = pLimit(Number(args.concurrency || 3));
  const jobs = [];
  for (const model of models) {
    const ready = providerReady(model);
    if (!ready.ok) {
      log(`generate: skipping ${model.slug}: ${ready.why}`);
      continue;
    }
    for (const p of paintings) {
      const ref = loadRef(p.slug);
      if (!ref) throw new Error(`no reference for ${p.slug}; run \`paintbench refs\` first`);
      const dir = entryDir(runId(), model.slug, p.slug);
      if (!args.force && fs.existsSync(path.join(dir, 'meta.json'))) continue;
      jobs.push(limit(() => generateOne(model, p, ref, dir, maxTokens)));
    }
  }
  log(`generate: ${jobs.length} entries into run ${runId()}`);
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  for (const f of failed) log(`generate: ERROR ${f.reason?.message || f.reason}`);
  log(`generate: done, ${results.length - failed.length} written, ${failed.length} errored (re-run to retry)`);
}

async function generateOne(model, painting, ref, dir, maxTokens) {
  const user = buildUserPrompt(painting, ref, { maxTokens });
  log(`generate: ${model.slug} / ${painting.slug} ...`);
  const res = await generate(model, { system: SYSTEM_PROMPT, user, maxTokens, run: runId() });
  fs.mkdirSync(dir, { recursive: true });
  for (const stale of ['art.svg', 'art.png', 'art.partial.svg', 'score.json']) fs.rmSync(path.join(dir, stale), { force: true });
  fs.writeFileSync(path.join(dir, 'response.txt'), res.text || '');

  const meta = {
    run: runId(),
    model: model.slug, provider: model.provider, modelId: model.model, servedBy: res.servedBy,
    painting: painting.slug, promptVersion: cfg.PROMPT_VERSION, maxTokens,
    status: 'ok', disqualified: false, reasons: [], strippedText: 0, stats: null,
    latencyMs: res.latencyMs, usage: res.usage, stopReason: res.stopReason, stopDetails: res.stopDetails,
    generatedAt: new Date().toISOString(),
  };
  const ext = res.stopReason === 'refusal' ? null : extractSvg(res.text);
  if (res.stopReason === 'refusal') {
    meta.status = 'refusal';
  } else if (!ext) {
    meta.status = 'no_svg';
  } else if (ext.truncated) {
    meta.status = 'truncated';
    fs.writeFileSync(path.join(dir, 'art.partial.svg'), ext.partial);
  } else {
    const clean = sanitizeSvg(ext);
    fs.writeFileSync(path.join(dir, 'art.svg'), clean.svg);
    meta.disqualified = clean.disqualified;
    meta.reasons = clean.reasons;
    meta.strippedText = clean.strippedText;
    meta.stats = svgStats(clean.svg);
  }
  writeJSON(path.join(dir, 'meta.json'), meta);
  log(`generate: ${model.slug} / ${painting.slug} -> ${meta.status}${meta.disqualified ? ' DQ ' + meta.reasons.join(',') : ''} (${(res.latencyMs / 1000).toFixed(1)}s, ${meta.stats?.bytes ?? 0} bytes)`);
}

async function cmdRender() {
  const renderer = args.renderer || 'resvg';
  const width = Number(args.width || cfg.DEFAULT_RENDER_WIDTH);
  let n = 0, errs = 0;
  for (const model of models) {
    for (const p of paintings) {
      const dir = entryDir(runId(), model.slug, p.slug);
      const metaFile = path.join(dir, 'meta.json');
      const meta = readJSON(metaFile, null);
      if (!meta || meta.status !== 'ok') continue;
      const png = path.join(dir, 'art.png');
      if (!args.force && fs.existsSync(png)) continue;
      try {
        const buf = await renderSvgToPng(fs.readFileSync(path.join(dir, 'art.svg'), 'utf8'), { width, renderer });
        fs.writeFileSync(png, buf);
        meta.renderer = renderer;
        meta.renderedAt = new Date().toISOString();
        n++;
      } catch (e) {
        meta.status = 'render_error';
        meta.reasons = [...(meta.reasons || []), `render: ${String(e.message || e).slice(0, 200)}`];
        errs++;
        log(`render: ${model.slug}/${p.slug} FAILED: ${e.message}`);
      }
      writeJSON(metaFile, meta);
    }
  }
  log(`render: ${n} rendered, ${errs} failed (${renderer})`);
}

async function cmdJudge() {
  const judgeModel = args['judge-model'] || cfg.DEFAULT_JUDGE_MODEL;
  const effort = args.effort || 'high';
  const samples = Number(args.samples || 1);
  const limit = pLimit(Number(args.concurrency || 2));
  const jobs = [];
  for (const model of models) {
    for (const p of paintings) {
      const dir = entryDir(runId(), model.slug, p.slug);
      const meta = readJSON(path.join(dir, 'meta.json'), null);
      if (!meta || meta.status !== 'ok' || meta.disqualified) continue;
      const png = path.join(dir, 'art.png');
      if (!fs.existsSync(png)) continue;
      if (!args.rejudge && fs.existsSync(path.join(dir, 'score.json'))) continue;
      jobs.push(limit(async () => {
        log(`judge: ${model.slug} / ${p.slug} ...`);
        const score = await judgeEntry({ painting: p, refImagePath: refImagePath(p.slug), pngBuffer: fs.readFileSync(png), judgeModel, effort, samples });
        writeJSON(path.join(dir, 'score.json'), score);
        log(`judge: ${model.slug} / ${p.slug} = ${score.total}  ${Object.entries(score.scores).map(([k, v]) => `${k.slice(0, 5)}:${v}`).join(' ')}`);
      }));
    }
  }
  log(`judge: run ${runId()}, ${jobs.length} entries with ${judgeModel} (effort ${effort}, ${samples} sample${samples > 1 ? 's' : ''})`);
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  for (const f of failed) log(`judge: ERROR ${f.reason?.message || f.reason}`);
  log(`judge: done, ${results.length - failed.length} scored, ${failed.length} errored (re-run to retry)`);
}

async function cmdBuild() {
  buildLeaderboard({ paintings: allPaintings, models: allModels });
}

async function cmdRun() {
  if (cmd === 'smoke') {
    args['judge-model'] = 'mock';
    log(`smoke: mock models + mock judge -> ${cfg.RESULTS_DIR}`);
    if (!args.run) {
      // A single run shows no trend, so seed a handful of dated ones.
      const today = new Date();
      for (let back = 5; back >= 0; back--) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - back * 2);
        args.run = d.toISOString().slice(0, 10);
        await oneRun();
      }
      return cmdBuild();
    }
  }
  await oneRun();
  await cmdBuild();
}

async function oneRun() {
  await cmdGenerate();
  await cmdRender();
  await cmdJudge();
}

function serve() {
  const port = Number(args.port || 8787);
  const root = cfg.BENCH_DIR;
  const types = { '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => log(`serve: http://localhost:${port}/  (mock data: http://localhost:${port}/?results=results-mock)`));
  return new Promise(() => {}); // run until killed
}
