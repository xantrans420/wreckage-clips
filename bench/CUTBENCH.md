# CutBench (spec, parked)

**Status: specified, not running.** Video generation across several models is the
one bench in this suite with a real budget requirement. The spec is written so it
can start the day the budget exists. **Track B below runs for almost nothing and is
the recommended starting point.**

## The question

Every video benchmark that exists scores a single clip in isolation: pretty,
coherent, prompt-adherent, one shot. Films are not made of clips, they are made of
cuts. Nobody measures the cut.

That gap is why AI video is still B-roll. Place two AI clips end to end and
characters swap sides of frame, a hand reaching for a door is already holding it,
eyelines point nowhere.

**The brief:** cut a 15 second ad.

## Two tracks

### Track A: generate the ad (expensive, parked)

The model gets a brief and must produce every shot, then order them into a 15
second cut. Measures generation and editorial judgment together. Costs roughly
$300 to $800 per full run across a model roster, because a 15 second ad needs four
to seven generated shots per model per brief.

### Track B: edit the ad (near zero cost, start here)

The model gets a brief plus **a clip library it did not generate** and must return
an **edit decision list**: which clips, in what order, in-point and out-point for
each, to total 15 seconds. No video generation happens at all. The model outputs
text. `ffmpeg` renders the cut. The judge watches it.

This isolates editorial judgment from generation quality, which is the more
interesting variable anyway, and it costs the price of a text completion.

**The clip library already exists.** `clips/` in this repository holds 58 single
effect reference clips, 4 seconds each, 21:9, one per camera move. That is a
usable first library. A purpose shot library with narrative coverage (product,
hands, faces, environment, detail) makes the bench considerably better and is the
main asset investment Track B needs.

## What gets scored

Objective gates first, computed from the rendered cut with no model in the loop:

- Total duration is 15 seconds within a tolerance.
- Every referenced clip and timecode exists and is in range.
- Shot count is within a plausible band; a single 15 second held shot is not a cut.
- No clip reused unless the EDL declares it deliberate.

Then the film grammar checks, computed from the rendered frames either side of each
splice:

| Rule | What breaks | Measured from |
|---|---|---|
| 180 degree line | Subjects swap sides across the cut | Detected subject positions before and after |
| Eyeline match | The reverse shot is not where they were looking | Gaze vector, then subject placement |
| Match on action | Motion jumps or rewinds across the seam | Optical flow continuity at the splice |
| Screen direction | Exits frame right, re-enters frame right | Motion vector sign |
| 30 degree rule | Angle change too small, reads as a jump cut | Estimated camera pose delta |
| State continuity | Props, light, time of day drift across the cut | Frame embedding delta on static regions |

Then, and only then, the judge. It watches the rendered 15 seconds and answers a
small number of questions a human editor would ask: does this cut work, does it
hold attention through the first 3 seconds, does the ad land a point, is the pacing
right for the brief.

Pacing is worth scoring separately because it is measurable and it is where most
AI edits fail: shot length variance, whether cuts fall on the music, and whether
the shortest shot lands near the hook rather than the tail.

## Briefs

Six to ten, each one paragraph, each with a different editorial demand. The
demand is the variable, not the product:

1. Fast hook, product reveal at 2 seconds, hard cut rhythm.
2. Slow build, single reveal at 12 seconds, long takes.
3. Problem then solution, requires a turn in the middle.
4. Three benefits, three beats, parallel structure.
5. One continuous illusion assembled from separate shots.
6. Comedy timing, the cut itself is the joke.

## What this needs before it can run

1. A shot library with narrative coverage, not just camera move demos.
2. Six to ten briefs written to the shapes above.
3. An `ffmpeg` EDL renderer and the grammar checkers.
4. A human editor baseline: the same briefs and library, cut by a person, scored
   blind alongside the models. Without it the numbers have no ceiling.

## Why it is worth the wait

The finding is quotable and probably true today: **six frontier models, not one can
cut.** You can watch it fail, which is what makes it spread. And when it stops
being true, this bench is the record of the moment it changed.

It also converts to product directly. Every failing row is a feature specification
for a multi-shot sequencer.
