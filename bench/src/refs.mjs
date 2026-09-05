// Reference images come from Wikimedia Commons, resolved through the MediaWiki
// API by exact file title (direct thumb URLs are brittle and reject generic
// clients). Every painting in the canon is public domain; the license string
// returned by Commons is stored next to the image so that is verifiable.
import fs from 'node:fs';
import path from 'node:path';
import { REFS_DIR, USER_AGENT, log, writeJSON, readJSON } from './config.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH = 1200; // plenty for a vision judge; Claude downsamples past ~1568px anyway

export function refImagePath(slug) {
  return path.join(REFS_DIR, `${slug}.jpg`);
}
export function refMetaPath(slug) {
  return path.join(REFS_DIR, `${slug}.json`);
}
export function loadRef(slug) {
  const meta = readJSON(refMetaPath(slug), null);
  if (!meta || !fs.existsSync(refImagePath(slug))) return null;
  return meta;
}

// viewBox handed to contestants: original aspect ratio, long edge = 1000.
export function canvasFor(ref) {
  const { width, height } = ref;
  if (width >= height) return { w: 1000, h: Math.round((1000 * height) / width) };
  return { w: Math.round((1000 * width) / height), h: 1000 };
}

export async function fetchRefs(paintings, { force = false } = {}) {
  fs.mkdirSync(REFS_DIR, { recursive: true });
  const todo = paintings.filter((p) => force || !loadRef(p.slug));
  if (todo.length === 0) {
    log(`refs: all ${paintings.length} reference images already present`);
    return;
  }
  // One batched API call for every title (MediaWiki allows up to 50).
  const params = new URLSearchParams({
    action: 'query',
    titles: todo.map((p) => `File:${p.commons}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
    format: 'json',
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  const data = await res.json();

  // Commons normalizes underscores to spaces; map both spellings back to the painting.
  const normalized = new Map();
  for (const n of data.query?.normalized || []) normalized.set(n.to, n.from);
  const bySpelling = new Map(todo.map((p) => [`File:${p.commons}`, p]));
  const bySpaces = new Map(todo.map((p) => [`File:${p.commons.replace(/_/g, ' ')}`, p]));

  for (const page of Object.values(data.query?.pages || {})) {
    const original = normalized.get(page.title) || page.title;
    const painting = bySpelling.get(original) || bySpaces.get(page.title);
    if (!painting) {
      log(`refs: unexpected page ${page.title}`);
      continue;
    }
    if (page.missing !== undefined || !page.imageinfo?.[0]) {
      log(`refs: MISSING on Commons: ${painting.commons} (${painting.title})`);
      continue;
    }
    const ii = page.imageinfo[0];
    const img = await fetch(ii.thumburl, { headers: { 'User-Agent': USER_AGENT } });
    if (!img.ok) {
      log(`refs: download failed ${img.status} for ${painting.slug}`);
      continue;
    }
    fs.writeFileSync(refImagePath(painting.slug), Buffer.from(await img.arrayBuffer()));
    const strip = (s) => (s ? String(s).replace(/<[^>]+>/g, '').trim() : undefined);
    writeJSON(refMetaPath(painting.slug), {
      slug: painting.slug,
      title: painting.title,
      artist: painting.artist,
      year: painting.year,
      commons: painting.commons,
      commonsUrl: ii.descriptionurl,
      sourceUrl: ii.url,
      width: ii.width,
      height: ii.height,
      thumbWidth: ii.thumbwidth,
      thumbHeight: ii.thumbheight,
      license: strip(ii.extmetadata?.LicenseShortName?.value),
      fetchedAt: new Date().toISOString(),
    });
    log(`refs: ${painting.slug} <- ${ii.thumbwidth}x${ii.thumbheight} (${strip(ii.extmetadata?.LicenseShortName?.value) || 'license unknown'})`);
  }
}
