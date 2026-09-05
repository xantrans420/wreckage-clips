// Extraction, rule enforcement and stats for contestant output.

export function extractSvg(text) {
  if (!text) return null;
  // Take the last complete <svg ...>...</svg>; models sometimes emit a draft first.
  const matches = [...text.matchAll(/<svg[\s>][\s\S]*?<\/svg>/gi)];
  if (matches.length) return matches[matches.length - 1][0];
  // Truncated output: an opening tag without a close.
  const open = text.search(/<svg[\s>]/i);
  if (open > -1) return { truncated: true, partial: text.slice(open) };
  return null;
}

const DISQUALIFIERS = [
  ['embedded_image', /<image[\s>\/]/i],
  ['foreign_object', /<foreignObject[\s>\/]/i],
  ['script', /<script[\s>\/]/i],
  ['css_import', /@import/i],
  ['external_href', /\b(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:)/i],
  ['external_url', /url\(\s*["']?\s*(?:https?:|\/\/|data:)/i],
  ['event_handler', /\son[a-z]+\s*=/i],
];

export function sanitizeSvg(svg) {
  const reasons = [];
  for (const [reason, re] of DISQUALIFIERS) if (re.test(svg)) reasons.push(reason);

  let out = svg;
  // The task forbids text; enforce it mechanically rather than asking the judge to ignore it.
  const textBlocks = out.match(/<text[\s>][\s\S]*?<\/text>/gi) || [];
  out = out.replace(/<text[\s>][\s\S]*?<\/text>/gi, '').replace(/<text\b[^>]*\/>/gi, '');
  if (!/\sxmlns\s*=/.test(out.slice(0, out.indexOf('>') + 1))) {
    out = out.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return { svg: out, disqualified: reasons.length > 0, reasons, strippedText: textBlocks.length };
}

export function svgStats(svg) {
  const count = (re) => (svg.match(re) || []).length;
  return {
    bytes: Buffer.byteLength(svg, 'utf8'),
    elements: count(/<[a-zA-Z][^\s>\/]*/g),
    paths: count(/<path[\s>\/]/gi),
    gradients: count(/<(?:linear|radial)Gradient[\s>\/]/gi),
    filters: count(/<filter[\s>\/]/gi),
  };
}
