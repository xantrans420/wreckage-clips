# THE BENCH

Five benchmarks for whether AI can actually do creative work, published on one page
(`index.html`, tab per bench, defined in `benches.json`). One is live; the rest are specified.

| Bench | Question | Status |
|---|---|---|
| **PaintBench** | Can a model paint with code? | **Live** (this repo) |
| **CutBench** | Can a model speak film grammar? Cut a 15 second ad. | Specified — [`CUTBENCH.md`](CUTBENCH.md) |
| **TasteBench** | Does a model know what is good? | Planned |
| **FidelityBench** | Does the product survive the pipeline? | Planned |
| **RangeBench** | How many ideas before it repeats itself? | Planned |

## PaintBench — can AI paint with code?

Models paint using **nothing but SVG code**. Two things are measured on every entry: **how good the output
is** and **how long it took**. Two tracks, deliberately testing opposite abilities:

| Track | Input | What it tests | Judge sees |
|---|---|---|---|
| **Recall** | The name of a painting | Does the model *know* the picture, and can it draw | The original beside the candidate |
| **Brief** | A written brief, nothing else | Can the model *invent* a scene it has never seen | The brief text beside the candidate |

The recall track leans on memorisation: every model has the Mona Lisa in its weights, so the score separates
knowing it from being able to draw it. The brief track removes that shortcut entirely — no reference image
exists, so every element has to be constructed from a description.

Both tracks are **fixed and re-run over time**. Because the task never changes, re-running is how you watch
models improve: the only thing that differs between runs is the models themselves. Every result is written
under a dated run and old runs are never overwritten, so each track carries a per-model score history
alongside its current standings.

The two tracks are scored on different rubrics and their numbers are never pooled.

Live page (once results are committed): `https://xantrans420.github.io/wreckage-clips/bench/`

### Recall subject

**The most famous painting to mankind is the Mona Lisa.** It is the most visited artwork in the world
(the Louvre alone draws ~9M visitors a year, most of them for one panel), the most parodied, and the one
painting that people on every continent can name from a thumbnail. It is the fixed subject of every run.

The rest of the canon below is **opt-in** (`--all`, `--tier`, `--paintings`) and exists for one-off
comparisons. It is deliberately not part of the time series, which needs the task held constant:

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
   generate ─── same prompt to every model ──► results/runs/<date>/<model>/<painting>/
        │        (text only, no reference image)        response.txt · art.svg · meta.json
        ▼
   render ───── SVG → PNG (resvg, 1024px, white bg) ──────────────────► art.png
        │
        ▼
   judge ────── Claude Fable 5.1 sees ORIGINAL + CANDIDATE ───────────► score.json
        │        (never the SVG source, never the model name)
        ▼
   build ────── every run folded into results/leaderboard.json ◄── index.html reads this
                (current standings + per-model score history + subject timeline)
```

**Rules for contestants** (enforced mechanically in `src/svg.mjs`, not by the judge):

- One SVG, `viewBox` in the original's aspect ratio, pure vector: paths, shapes, gradients, patterns, clips, masks, filters.
- `<image>`, `<foreignObject>`, `<script>`, external references, `@import`, event handlers: **disqualified, scores 0**.
- `<text>` in any form is **stripped** before rendering (a caption is not a painting).
- No SVG in the reply, or an SVG cut off by the token budget: **scores 0**.
- Output budget defaults to 24k tokens and the prompt tells the model so.

### Brief subject

**THE SALON** — portrait 3:5. One paragraph describing a ruined 18th-century salon: a gilt-framed portrait
over a marble fireplace, arched windows with light from the right, white drapery buried across the floor,
a black dog in the foreground, **Kanye West** walking through it in profile in an oversized cream hoodie,
a chestnut horse and a figure in a green coat deeper in the room. Eleven named elements, listed in
`briefs.json` as the checklist the judge scores against.

Naming a real, extremely well-known person is deliberate: it adds a second measurable axis. A model can
build the room correctly and still fail the likeness, or land the likeness in an empty room. Those are
scored separately.

**Judge rubrics** (`src/judge.mjs`, five integers 0–10 each, weighted to a 0–100 total). Different tracks
ask different questions, so they have different rubrics:

| Recall | Weight | Question |
|---|---|---|
| Recognizability | 30% | Would an average person identify it as this painting without being told? |
| Composition | 25% | Placement, proportions, scale of main subjects and background structures |
| Color | 20% | Palette, value structure, lighting mood |
| Craft | 15% | Quality of the vector drawing: coherent shapes, no glitches |
| Impression | 10% | Does it carry the feeling and style; does it stand as art |

| Brief | Weight | Question |
|---|---|---|
| Adherence | 30% | Is every element the brief names present, and placed as described? |
| Likeness | 15% | Is the named person recognisable as that person, allowing for flat vector art? |
| Composition | 20% | Does it read as a staged picture with depth and a clear focal subject? |
| Color | 20% | Palette, values, and the direction and quality of light, against the brief |
| Craft | 15% | Quality of the vector drawing: coherent shapes, no glitches |

The judge gets an anchored scale (10 = skilled human vector illustration, 5 = clearly the same painting
with obvious deviations, 0 = no relation), is told text earns nothing and complexity earns nothing, and
returns structured JSON (`output_config.format`), so parsing never fails. It runs at `effort: high` with
server-side refusal fallbacks enabled. `--samples 3` averages three independent judgments per entry to
cut variance.

**Leaderboard:** standings come from the **latest run only** — mixing runs would compare one model's new
release against another's old one. Alongside them the page plots each model's score across every run, which
is the point of holding the subject fixed. DQ and failures count 0.

**Speed is a first-class axis.** Wall-clock time is recorded for every generation (average, median and range
per model) and plotted against score. The page marks the **speed/quality frontier**: models where no other
model is both faster *and* better. Everything off the frontier is beaten outright on both axes, which is the
only ranking that survives the tradeoff. Models that scored 0 are excluded from the frontier however fast
they were.

## Quickstart

```bash
cd bench
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY (judge) + keys for the contestants you want
npm run refs                # fetch the 12 reference images from Wikimedia Commons (once)
node src/cli.mjs list       # shows which contestants have keys

node src/cli.mjs run                      # both tracks, every enabled model
node src/cli.mjs run --track brief        # one track only
node src/cli.mjs run --samples 3          # lower-variance judging
node src/cli.mjs run --all                # the wider canon too, for a one-off comparison
node src/cli.mjs runs                     # list recorded runs

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

## Other benches

[`CUTBENCH.md`](CUTBENCH.md) specifies **CutBench**, the follow-up: give a model a brief and a clip library and
make it cut a 15 second ad, then score the seams against film grammar. Track B of that spec (edit only, no
video generation) runs for the price of a text completion and reuses the `clips/` library in this repository.
It is specified but not running.

## Layout

```
bench/
  benches.json         the five-bench suite definition the page renders its tabs from
  paintings.json       the recall canon; the first entry is the fixed subject
  briefs.json          the brief track: the brief text and the checklist the judge scores
  models.json          contestants
  refs/                reference JPGs + metadata (public domain, from Commons)
  results/runs/<date>/ one folder per run, then per model/painting
  results/leaderboard.json   every run folded into the file the page reads
  index.html           the suite page: leaderboard, history, gallery (GitHub Pages)
  src/
    cli.mjs            commands
    prompt.mjs         the contestant prompts, one per track (versioned)
    providers.mjs      anthropic | openai-compatible | google | mock
    svg.mjs            extraction, disqualification rules, text stripping, stats
    render.mjs         SVG → PNG (resvg default, chromium optional)
    judge.mjs          Fable 5.1 rubric judge (one rubric per track), structured output
    leaderboard.mjs    per-track cross-run aggregation, history, speed/quality frontier
    refs.mjs           Wikimedia Commons fetcher
    config.mjs         paths, versions, arg parsing
```
