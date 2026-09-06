// Contestant adapters. Every provider returns the same shape:
//   { text, stopReason, usage: { input, output }, latencyMs, servedBy }
// Anthropic models go through the official SDK. OpenAI-compatible endpoints
// (OpenAI, xAI, OpenRouter, DeepSeek, Mistral, Groq, ...) and Gemini use plain
// fetch against their own REST APIs.
import Anthropic from '@anthropic-ai/sdk';
import { sleep, log } from './config.mjs';

const REQUEST_TIMEOUT_MS = 15 * 60 * 1000; // strong models spend minutes on a detailed SVG

export function providerReady(model) {
  if (model.provider === 'mock') return { ok: true };
  if (model.provider === 'anthropic') {
    // The SDK also resolves `ant auth login` profiles, so an unset key is not fatal.
    return { ok: true };
  }
  const envName = model.apiKeyEnv || DEFAULT_KEY_ENV[model.provider];
  if (!envName) return { ok: false, why: `unknown provider "${model.provider}"` };
  if (!process.env[envName]) return { ok: false, why: `${envName} is not set` };
  return { ok: true };
}

const DEFAULT_KEY_ENV = { openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' };

export async function generate(model, { system, user, maxTokens, run }) {
  const t0 = Date.now();
  let out;
  switch (model.provider) {
    case 'anthropic': out = await viaAnthropic(model, { system, user, maxTokens }); break;
    case 'openai': out = await viaOpenAICompatible(model, { system, user, maxTokens }); break;
    case 'google': out = await viaGemini(model, { system, user, maxTokens }); break;
    case 'mock': out = await viaMock(model, { user, run }); break;
    default: throw new Error(`unknown provider "${model.provider}"`);
  }
  // The mock provider reports a simulated duration so pipeline tests exercise the
  // speed axis without actually waiting; every real provider is timed for real.
  return { ...out, latencyMs: out.fakeLatencyMs ?? Date.now() - t0, fakeLatencyMs: undefined };
}

// ---------------------------------------------------------------- Anthropic
let anthropicClient;
async function viaAnthropic(model, { system, user, maxTokens }) {
  anthropicClient ??= new Anthropic({ maxRetries: 3, timeout: REQUEST_TIMEOUT_MS });
  const params = {
    model: model.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    ...(model.params || {}), // e.g. { thinking: {type:'adaptive'}, output_config: {effort:'high'} }
  };
  // Fable / Opus 5 run safety classifiers; server-side fallbacks re-run a false
  // positive on another model in the same call instead of returning a refusal.
  const useFallbacks = model.fallbacks !== false && /^claude-(fable|mythos|opus-5)/.test(model.model);
  let msg;
  if (useFallbacks) {
    msg = await anthropicClient.beta.messages
      .stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      .finalMessage();
  } else {
    msg = await anthropicClient.messages.stream(params).finalMessage();
  }
  const text = msg.stop_reason === 'refusal'
    ? ''
    : msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return {
    text,
    stopReason: msg.stop_reason,
    stopDetails: msg.stop_reason === 'refusal' ? msg.stop_details : undefined,
    usage: { input: msg.usage?.input_tokens ?? null, output: msg.usage?.output_tokens ?? null },
    servedBy: msg.model,
  };
}

// ------------------------------------------------------- OpenAI-compatible
async function viaOpenAICompatible(model, { system, user, maxTokens }) {
  const baseUrl = (model.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const key = process.env[model.apiKeyEnv || 'OPENAI_API_KEY'];
  const isOpenAI = /api\.openai\.com/.test(baseUrl);
  const body = {
    model: model.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // OpenAI's current models reject `max_tokens`; everyone else still expects it.
    ...(isOpenAI ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    ...(model.params || {}),
  };
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
    ...(/openrouter\.ai/.test(baseUrl)
      ? { 'HTTP-Referer': 'https://github.com/xantrans420/wreckage-clips', 'X-Title': 'PaintBench' }
      : {}),
    ...(model.headers || {}),
  };
  const data = await fetchJSON(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content) ? content.map((c) => c.text || '').join('') : content || '';
  return {
    text,
    stopReason: choice?.finish_reason ?? null,
    usage: { input: data.usage?.prompt_tokens ?? null, output: data.usage?.completion_tokens ?? null },
    servedBy: data.model || model.model,
  };
}

// ------------------------------------------------------------------ Gemini
async function viaGemini(model, { system, user, maxTokens }) {
  const key = process.env[model.apiKeyEnv || 'GEMINI_API_KEY'];
  const base = (model.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens, ...(model.params?.generationConfig || {}) },
    ...(model.params?.body || {}),
  };
  const data = await fetchJSON(`${base}/models/${model.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  return {
    text,
    stopReason: cand?.finishReason ?? null,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? null,
      output: data.usageMetadata?.candidatesTokenCount ?? null,
    },
    servedBy: data.modelVersion || model.model,
  };
}

// -------------------------------------------------------------------- Mock
// Deterministic stand-in for pipeline tests (`paintbench smoke`). Never appears
// on a real leaderboard: the builder tags mock runs and the page shows a banner.
async function viaMock(model, { user, run }) {
  const vb = user.match(/viewBox="0 0 (\d+) (\d+)"/);
  const w = vb ? +vb[1] : 1000;
  const h = vb ? +vb[2] : 1000;
  // Seeded by the run too, so a pipeline test produces a plausible time series
  // rather than the same picture at every date.
  const seed = [...(user + (run || '') + model.slug)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hue = seed % 360;
  const variant = model.mockVariant || 'plain';
  const extra = variant === 'text' ? `<text x="20" y="40" font-size="40">${user.match(/"([^"]+)"/)?.[1] || ''}</text>` : '';
  const dq = variant === 'image' ? `<image href="https://example.com/x.jpg" width="${w}" height="${h}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},40%,25%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,55%)"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>
<ellipse cx="${w / 2}" cy="${h * 0.55}" rx="${w * 0.22}" ry="${h * 0.3}" fill="hsl(${(hue + 180) % 360},35%,45%)"/>
<circle cx="${w / 2}" cy="${h * 0.32}" r="${Math.min(w, h) * 0.11}" fill="hsl(${(hue + 200) % 360},30%,70%)"/>
${extra}${dq}
</svg>`;
  await sleep(20);
  return {
    text: variant === 'garbage' ? 'I cannot draw.' : '```svg\n' + svg + '\n```',
    stopReason: 'stop',
    usage: { input: 300, output: 220 },
    servedBy: 'mock',
    fakeLatencyMs: (model.mockLatencyMs ?? 30000) + (seed % 7000),
  };
}

// ------------------------------------------------------------------ helpers
async function fetchJSON(url, init, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 3) {
        const wait = 2000 * 2 ** attempt;
        log(`HTTP ${res.status} from ${new URL(url).host}; retry in ${wait}ms`);
        await sleep(wait);
        return fetchJSON(url, init, attempt + 1);
      }
      throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
