// The contestant prompt is part of the benchmark definition. Changing anything
// here changes the task; bump PROMPT_VERSION in config.mjs when you do.
import { canvasFor } from './refs.mjs';

const OUTPUT_RULE = 'Reply with one complete SVG document and nothing else: no markdown fences, no explanation before or after it.';

export const SYSTEM_PROMPT = [
  'You are a contestant in PaintBench, a benchmark where AI models paint using only SVG code.',
  'Your SVG is rasterized and judged visually for composition, colour, craftsmanship and artistic impression.',
  OUTPUT_RULE,
].join(' ');

export const BRIEF_SYSTEM_PROMPT = [
  'You are a contestant in PaintBench, a benchmark where AI models paint using only SVG code.',
  'You are given a written brief and no reference image of any kind. Build the picture it describes.',
  'Your SVG is rasterized and judged against the brief for how completely it realises what was asked, how convincing the likeness is, and for composition, colour and craftsmanship.',
  OUTPUT_RULE,
].join(' ');

export function buildUserPrompt(painting, ref, { maxTokens }) {
  const { w, h } = canvasFor(ref);
  return [
    `Recreate "${painting.title}" by ${painting.artist} (${painting.year}, ${painting.medium}) as an SVG, from your own knowledge of the painting.`,
    '',
    'Requirements:',
    `- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"> (this is the original's aspect ratio). Paint the whole canvas; leave nothing transparent.`,
    '- Pure vector only. Paths, basic shapes, gradients, patterns, clipPath, mask, filter and opacity are all allowed.',
    '- Not allowed: <image>, <foreignObject>, <script>, any external reference or @import (these disqualify the entry), and <text> in any form: no titles, captions or signatures (text elements are stripped before judging).',
    '- A viewer should recognize the painting instantly. Get the composition and the major masses right first, then color and light, then detail.',
    `- Output budget is about ${maxTokens} tokens. An SVG cut off before </svg> scores zero, so size your detail to fit.`,
    '',
    'Output only the SVG.',
  ].join('\n');
}


export function buildBriefUserPrompt(brief, { maxTokens }) {
  const [w, h] = brief.canvas;
  return [
    `Paint this scene as an SVG. There is no reference image; the brief is all you get.`,
    '',
    `BRIEF - "${brief.title}" (${brief.format})`,
    brief.brief,
    '',
    'Requirements:',
    `- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">. Paint the whole canvas; leave nothing transparent.`,
    '- Pure vector only. Paths, basic shapes, gradients, patterns, clipPath, mask, filter and opacity are all allowed.',
    '- Not allowed: <image>, <foreignObject>, <script>, any external reference or @import (these disqualify the entry), and <text> in any form: no titles, captions or signatures (text elements are stripped before judging).',
    '- Every element named in the brief must be present and placed as described. The named figure should be recognisable as that person.',
    '- Get the staging and the major masses right first, then light and palette, then detail.',
    `- Output budget is about ${maxTokens} tokens. An SVG cut off before </svg> scores zero, so size your detail to fit.`,
    '',
    'Output only the SVG.',
  ].join('\n');
}
