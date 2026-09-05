// SVG -> PNG. Default renderer is resvg (deterministic, no browser). `chromium`
// uses Playwright and matches what a visitor's browser shows; it needs
// `npm i playwright` (a Chromium download) so it is opt-in.
import { DEFAULT_RENDER_WIDTH } from './config.mjs';

export async function renderSvgToPng(svg, { width = DEFAULT_RENDER_WIDTH, renderer = 'resvg' } = {}) {
  if (renderer === 'chromium') return renderWithChromium(svg, width);
  return renderWithResvg(svg, width);
}

async function renderWithResvg(svg, width) {
  const { Resvg } = await import('@resvg/resvg-js');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: '#ffffff', // unpainted canvas reads as paper, not as black
    font: { loadSystemFonts: false }, // text is stripped before render; no fonts needed
  });
  return r.render().asPng();
}

let browserPromise;
async function renderWithChromium(svg, width) {
  const { chromium } = await import('playwright');
  browserPromise ??= chromium.launch();
  const browser = await browserPromise;
  const page = await browser.newPage({ viewport: { width, height: width }, deviceScaleFactor: 1 });
  try {
    const html = `<!doctype html><html><body style="margin:0;background:#fff"><div id="w" style="width:${width}px;display:inline-block;line-height:0">${svg}</div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => {
      const s = document.querySelector('#w svg');
      if (s) { s.setAttribute('width', '100%'); s.removeAttribute('height'); }
    });
    return await page.locator('#w').screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

export async function closeRenderer() {
  if (browserPromise) (await browserPromise).close().catch(() => {});
}
