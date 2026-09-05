# PaintBench — can AI paint with code?

AI models recreate the most famous paintings on Earth as **pure SVG**, from memory, with a single text prompt.
The SVG is rasterized and shown to a vision judge (**Claude Fable 5.1**) next to the original. Scores go on a
static leaderboard with a gallery of every attempt.

Live page (once results are committed): `https://xantrans420.github.io/wreckage-clips/bench/`

## The canon

**The most famous painting to mankind is the Mona Lisa.** It is the most visited artwork in the world
(the Louvre alone draws ~9M visitors a year, most of them for one panel), the most parodied, and the one
painting that people on every continent can name from a thumbnail. It is Tier S and the headline score of
the benchmark. The rest of the canon covers the next most recognizable works, all public domain:

| Tier | Painting | Artist |
|---|---|---|
| S | Mona Lisa | Leonardo da Vinci |
| A | The Starry Night | Vincent van Gogh |
| A | The Scream | Edvard Munch |
| A | Girl with a Pearl Earring | Johannes Vermeer |
| A | The Great Wave off Kanagawa | Katsushika Hokusai |
| A | The Last Supper | Leonardo da Vinci |
| A | The Creation of Adam | Michelangelo |
| B | The Birth of Venus | Sandro Botticelli |
| B | American Gothic | Grant Wood |
| B | The Kiss | Gustav Klimt |
| B | Composition II in Red, Blue, and Yellow | Piet Mondrian |
| B | Vitruvian Man | Leonardo da Vinci |

Mondrian is the control: a painting SVG can reproduce almost exactly, so it separates "knows the painting
and can draw" from "can only gesture at it". Reference images are fetched from Wikimedia Commons by exact
file title (`paintings.json`), stored in `refs/` with their license metadata. Guernica, Nighthawks and
The Persistence of Memory are famous but still under copyright, so they are out.

## How it works

```
paintings.json + models.json
        │
        ▼
   generate ─── same prompt to every model ──► results/<model>/<painting>/response.txt
        │        (text only, no reference image)                       art.svg  (sanitized)
        ▼                                                              meta.json
   render ───── SVG → PNG (resvg, 1024px, white bg) ──────────────────► art.png
        │
        ▼
   judge ────── Claude Fable 5.1 sees ORIGINAL + CANDIDATE ───────────► score.json
        │        (never the SVG source, never the model name)
        ▼
   build ────── results/leaderboard.json ◄── index.html reads this
```

**Rules for contestants** (enforced mechanically in `src/svg.mjs`, not by the judge):

- One SVG, `viewBox` in the original's aspect ratio, pure vector: paths, shapes, gradients, patterns, clips, masks, filters.
- `<image>`, `<foreignObject>`, `<script>`, external references, `@import`, event handlers: **disqualified, scores 0**.
- `<text>` in any form is **stripped** before rendering (a caption is not a painting).
- No SVG in the reply, or an SVG cut off by the token budget: **scores 0**.
- Output budget defaults to 24k tokens and the prompt tells the model so.

**Judge rubric** (`src/judge.mjs`, five integers 0–10, weighted to a 0–100 total):

| Criterion | Weight | Question |
|---|---|---|
| Recognizability | 30% | Would an average person identify it as this painting without being told? |
| Composition | 25% | Placement, proportions, scale of main subjects and background structures |
| Color | 20% | Palette, value structure, lighting mood |
| Craft | 15% | Quality of the vector drawing: coherent shapes, no glitches |
| Impression | 10% | Does it carry the feeling and style; does it stand as art |

The judge gets an anchored scale (10 = skilled human vector illustration, 5 = clearly the same painting
with obvious deviations, 0 = no relation), is told text earns nothing and complexity earns nothing, and
returns structured JSON (`output_config.format`), so parsing never fails. It runs at `effort: high` with
server-side refusal fallbacks enabled. `--samples 3` averages three independent judgments per entry to
cut variance.

**Leaderboard:** *Overall* is the mean total across judged paintings (DQ and failures count 0). *Mona Lisa*
is the single-painting headline. Models that were not run on every painting rank below models with full
coverage, whatever their score.

## Quickstart

```bash
cd bench
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY (judge) + keys for the contestants you want
npm run refs                # fetch the 12 reference images from Wikimedia Commons (once)
node src/cli.mjs list       # shows which contestants have keys

node src/cli.mjs run --tier S             # Mona Lisa only: quick, cheap first run
node src/cli.mjs run                      # full canon, every enabled model
node src/cli.mjs run --judge-model claude-fable-5-1 --samples 3   # lower-variance judging

node src/cli.mjs serve                    # http://localhost:8787/
```

Publish: commit `bench/results/` and push. GitHub Pages serves `bench/index.html`, which reads
`results/leaderboard.json`, the PNGs and the SVGs relative to itself.

Every step is resumable: existing entries are skipped unless `--force` (generate/render) or `--rejudge`
(judge). Errors from a provider are logged and retried on the next run; model-side failures (no SVG,
truncation, refusal) are recorded as results.

`npm run smoke` runs the whole pipeline with mock models and a mock judge into `results-mock/` so you can
check the plumbing and the page (`?results=results-mock`) without spending a cent.

### Adding a contestant

Edit `models.json`. Providers:

- `anthropic`: official SDK. `params` is merged into the request (`output_config.effort`, `thinking`).
  Fable and Opus 5 entries automatically get `fallbacks: "default"`.
- `openai`: any OpenAI-compatible `chat/completions` endpoint. Set `baseUrl` and `apiKeyEnv`
  (OpenAI, xAI, OpenRouter, DeepSeek, Mistral, Groq). Uses `max_completion_tokens` for api.openai.com,
  `max_tokens` elsewhere; override anything via `params`.
- `google`: Gemini `generateContent` REST. `params.generationConfig` for thinking budgets etc.

Model IDs go stale fast. Check each vendor's current list before a run; the shipped entries are a starting
point, not a verified roster.

### Cost, roughly

Judging: two images plus rubric is about 3.5k input tokens and a few hundred output tokens on Fable 5.1
($10 / $50 per MTok), so about $0.05 per judgment, $0.15 with `--samples 3`. A full run of 12 paintings ×
8 models is under $5 of judging. Generation cost is the contestants' own pricing; a 24k-token SVG from a
frontier model is the expensive part ($0.20–$1.20 per entry).

## Honest caveats

- **One judge, absolute scores.** LLM judges compress scores toward the middle and drift between sessions.
  Pairwise comparison with an Elo/Bradley-Terry fit is more robust; it is the obvious v2 if this gets
  traction. Until then, compare models within one run, not across runs.
- **Self-preference.** Claude judges Claude. The judge is blind to model identity and never sees the SVG
  source, which removes the cheap leaks, but style-level bias cannot be ruled out. The judge model is a
  flag (`--judge-model`); running a second judge and reporting both is the honest fix.
- **Memory mode only.** Contestants get no reference image, so this measures "knows the painting" +
  "can draw with code". A reference-image mode (vision models trace the original) is a different, easier
  benchmark and is deliberately not in v1.
- **Rendering.** resvg is deterministic and browser-independent but does not support every SVG 2 feature.
  `--renderer chromium` (needs `npm i playwright`) matches what a browser shows.
- **Versioning.** `PROMPT_VERSION` and `RUBRIC_VERSION` in `src/config.mjs` are stamped on every result.
  Change the prompt or rubric, bump the version, and the leaderboard builder ignores stale entries.

## Layout

```
bench/
  paintings.json       the canon (title, artist, Commons file title, tier)
  models.json          contestants
  refs/                reference JPGs + metadata (public domain, from Commons)
  results/             one folder per model/painting; leaderboard.json at the root
  index.html           static leaderboard + gallery (GitHub Pages)
  src/
    cli.mjs            commands
    prompt.mjs         the contestant prompt (versioned)
    providers.mjs      anthropic | openai-compatible | google | mock
    svg.mjs            extraction, disqualification rules, text stripping, stats
    render.mjs         SVG → PNG (resvg default, chromium optional)
    judge.mjs          Fable 5.1 rubric judge, structured output
    leaderboard.mjs    aggregation
    refs.mjs           Wikimedia Commons fetcher
    config.mjs         paths, versions, arg parsing
```
