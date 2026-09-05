// The judge: Claude Fable 5.1 looks at the ORIGINAL painting and one CANDIDATE
// render and scores five criteria. It never sees the SVG source or the model
// name, so it grades the picture, not the code or the brand.
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_JUDGE_MODEL, RUBRIC_VERSION } from './config.mjs';

export const RUBRIC = [
  { key: 'recognizability', weight: 0.30, question: 'Would an average person, shown only the candidate, identify it as this specific painting without being told?' },
  { key: 'composition', weight: 0.25, question: 'Placement, proportions and scale of the main subject(s) and the background structures, compared with the original.' },
  { key: 'color', weight: 0.20, question: 'Palette, light/dark value structure and lighting mood, compared with the original.' },
  { key: 'craft', weight: 0.15, question: 'Quality of the vector drawing itself: confident coherent shapes, forms that read as intended, no glitches or broken geometry.' },
  { key: 'impression', weight: 0.10, question: 'Does it carry the feeling and style of the original and stand up as a piece of art in its own right?' },
];

export const ISSUE_TAGS = [
  'blank_or_near_blank', 'wrong_subject', 'abstract_blobs', 'mirrored_or_flipped', 'wrong_palette',
  'major_element_missing', 'proportions_off', 'rendering_glitches', 'too_simple', 'cropped_wrong', 'none',
];

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...RUBRIC.map((r) => r.key), 'issues', 'verdict'],
  properties: Object.fromEntries([
    ...RUBRIC.map((r) => [r.key, { type: 'integer', description: `${r.question} Integer 0-10.` }]),
    ['issues', { type: 'array', items: { type: 'string', enum: ISSUE_TAGS }, description: 'Problems present in the candidate. Use "none" only when nothing applies.' }],
    ['verdict', { type: 'string', description: 'One or two plain-language sentences: what works, what fails. No score numbers.' }],
  ]),
};

export const JUDGE_SYSTEM = [
  'You are the judge of PaintBench. Contestants (AI models) recreate famous paintings as SVG code from memory; you see the ORIGINAL painting and one CANDIDATE rendering and score how well the candidate recreates the original.',
  'You do not know which model made the candidate. Judge only what is visible.',
  'Scale, applied per criterion: 10 = as good as a skilled human vector illustration of this painting; 7 = unmistakably this painting with minor deviations; 5 = clearly the same painting but with obvious deviations; 3 = recognizable only with the title given; 0 = no relation.',
  'Be strict and consistent across candidates. Reward likeness, not effort or complexity. Text, labels or signatures never earn credit. Blank, near-blank or abstract-blob renderings score 0-2 on recognizability whatever their other qualities.',
  'Respond with the required JSON only.',
].join(' ');

export function weightedTotal(scores) {
  let total = 0;
  for (const r of RUBRIC) total += clamp10(scores[r.key]) * r.weight;
  return Math.round(total * 100) / 10; // 0-100 with one decimal
}
const clamp10 = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

let client;
export async function judgeEntry({ painting, refImagePath, pngBuffer, judgeModel = DEFAULT_JUDGE_MODEL, effort = 'high', samples = 1 }) {
  if (judgeModel === 'mock') return mockJudge({ pngBuffer, samples });
  client ??= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  const refB64 = fs.readFileSync(refImagePath).toString('base64');
  const candB64 = pngBuffer.toString('base64');

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: `ORIGINAL: "${painting.title}" by ${painting.artist} (${painting.year}).` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refB64 } },
      { type: 'text', text: 'CANDIDATE rendering:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: candB64 } },
      { type: 'text', text: `Score the candidate against the original on: ${RUBRIC.map((r) => `${r.key} (${r.question})`).join('; ')}.` },
    ],
  }];

  const runs = [];
  let usage = { input: 0, output: 0 };
  for (let i = 0; i < samples; i++) {
    const msg = await client.beta.messages.create({
      model: judgeModel,
      max_tokens: 8000, // thinking tokens count toward this on Fable; leave room for reasoning + JSON
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: JUDGE_SYSTEM,
      messages,
      output_config: { effort, format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
    });
    if (msg.stop_reason === 'refusal') {
      throw new Error(`judge refused (${msg.stop_details?.category ?? 'no category'})`);
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text);
    const scores = Object.fromEntries(RUBRIC.map((r) => [r.key, clamp10(parsed[r.key])]));
    runs.push({ scores, total: weightedTotal(scores), issues: parsed.issues || [], verdict: parsed.verdict || '', servedBy: msg.model });
    usage = { input: usage.input + (msg.usage?.input_tokens || 0), output: usage.output + (msg.usage?.output_tokens || 0) };
  }
  return aggregate(runs, { model: judgeModel, effort, samples, usage });
}

function aggregate(runs, judge) {
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const scores = Object.fromEntries(RUBRIC.map((r) => [r.key, Math.round(mean(runs.map((x) => x.scores[r.key])) * 10) / 10]));
  const total = Math.round(mean(runs.map((x) => x.total)) * 10) / 10;
  const issues = [...new Set(runs.flatMap((x) => x.issues))].filter((t) => t !== 'none' || runs.length === 1);
  return {
    total,
    scores,
    issues,
    verdict: runs[runs.length - 1].verdict, // last sample's prose; all samples kept below
    samples: runs,
    judge: { ...judge, rubricVersion: RUBRIC_VERSION, judgedAt: new Date().toISOString() },
  };
}

// Pipeline-test stand-in: deterministic pseudo-scores from the PNG bytes.
function mockJudge({ pngBuffer, samples }) {
  let h = 2166136261;
  for (let i = 0; i < pngBuffer.length; i += 97) h = ((h ^ pngBuffer[i]) * 16777619) >>> 0;
  const runs = [];
  for (let i = 0; i < samples; i++) {
    const scores = Object.fromEntries(RUBRIC.map((r, k) => [r.key, ((h >>> (k * 4 + i)) % 11)]));
    runs.push({ scores, total: weightedTotal(scores), issues: ['too_simple'], verdict: 'Mock judge: pipeline test only, not a real evaluation.', servedBy: 'mock' });
  }
  return aggregate(runs, { model: 'mock', effort: null, samples, usage: { input: 0, output: 0 } });
}
