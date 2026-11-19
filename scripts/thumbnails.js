#!/usr/bin/env node
/*
 * Generate experiments/<slug>/thumb.jpg (1200x750) for every experiment in experiments.json.
 *
 *   node scripts/thumbnails.js                 # only experiments that have no thumb.jpg yet
 *   node scripts/thumbnails.js --all           # regenerate every thumbnail
 *   node scripts/thumbnails.js plasma-drift    # (re)generate specific slugs
 *   node scripts/thumbnails.js --delay 5000    # wait longer before the screenshot (default 3000ms)
 *   node scripts/thumbnails.js --headed        # watch it happen in a real window
 *
 * Optional per-experiment settings in experiments.json:
 *   "thumbnail": {
 *     "delay": 6000,                 // ms to wait for this experiment
 *     "hide": ["#my-panel", ".hud"], // extra selectors to hide before the shot
 *     "keepOverlays": true           // don't auto-hide floating DOM overlays
 *   }
 * Any element with a data-hide-in-thumbnail attribute is always hidden.
 */
const fs = require('fs');
const path = require('path');
const { startServer } = require('./lib/server');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'experiments.json');
const WIDTH = 1200;
const HEIGHT = 750;

// Common control panels / overlays from popular libraries.
const KNOWN_UI = [
  '.lil-gui', '.dg.ac', '.dg.main',            // lil-gui / dat.gui
  '.tp-dfwv', '.tp-rotv',                      // Tweakpane
  '[class^="leva-"]',                          // Leva
  '#stats', '.stats', '#gui', '#info', '#ui', '#controls', '#overlay', '#hud',
  '[data-hide-in-thumbnail]',
];

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

async function generateThumbnails({ slugs = [], all = false, delay = 3000, headed = false, setupPage } = {}) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    console.error('Playwright is not installed. Run:  npm install && npx playwright install chromium');
    process.exitCode = 1;
    return [];
  }

  const manifest = loadManifest();
  let todo = manifest;
  if (slugs.length) {
    const unknown = slugs.filter((s) => !manifest.some((e) => e.slug === s));
    if (unknown.length) console.warn(`Not in experiments.json: ${unknown.join(', ')}`);
    todo = manifest.filter((e) => slugs.includes(e.slug));
  } else if (!all) {
    todo = manifest.filter((e) => !fs.existsSync(path.join(ROOT, 'experiments', e.slug, 'thumb.jpg')));
  }
  if (!todo.length) { console.log('All thumbnails exist. Use --all to regenerate.'); return []; }

  const { server, url } = await startServer(ROOT);
  const browser = await chromium.launch({
    headless: !headed,
    // Software WebGL (SwiftShader) works on every machine, including CI and machines without a GPU.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const done = [];
  try {
    for (const exp of todo) {
      const opts = exp.thumbnail || {};
      const out = path.join(ROOT, 'experiments', exp.slug, 'thumb.jpg');
      const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      if (setupPage) await setupPage(page);
      process.stdout.write(`• ${exp.slug} … `);
      try {
        await page.goto(`${url}/experiments/${encodeURIComponent(exp.slug)}/`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.mouse.move(WIDTH / 2, HEIGHT / 2); // some sketches react to the pointer
        await page.waitForTimeout(opts.delay ?? delay);

        await page.evaluate(({ known, extra, keepOverlays }) => {
          const hide = (el) => el.style.setProperty('visibility', 'hidden', 'important');
          for (const sel of [...known, ...extra]) {
            try { document.querySelectorAll(sel).forEach(hide); } catch {}
          }
          document.documentElement.style.cursor = 'none';
          if (keepOverlays) return;
          // Heuristic: hide floating DOM (fixed/absolute) that isn't the artwork itself,
          // i.e. doesn't contain a big canvas/video. Catches info text, buttons, stats.js, etc.
          const isBig = (el) => el.getBoundingClientRect().width > 300 && el.getBoundingClientRect().height > 200;
          for (const el of document.body.querySelectorAll('*')) {
            const pos = getComputedStyle(el).position;
            if (pos !== 'fixed' && pos !== 'absolute') continue;
            if (/^(CANVAS|VIDEO|SCRIPT|STYLE)$/.test(el.tagName)) continue;
            const media = el.querySelectorAll('canvas, video, img, svg');
            if ([...media].some(isBig)) continue;
            hide(el);
          }
        }, { known: KNOWN_UI, extra: opts.hide || [], keepOverlays: !!opts.keepOverlays });
        await page.waitForTimeout(100);

        await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
        console.log('ok');
        if (errors.length) console.log(`  (page reported errors: ${errors.slice(0, 3).join(' | ')})`);
        done.push(exp.slug);
      } catch (err) {
        console.log('FAILED');
        console.error(`  ${err.message.split('\n')[0]}`);
        process.exitCode = 1;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return done;
}

module.exports = { generateThumbnails };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { slugs: [], all: false, delay: 3000, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--headed') opts.headed = true;
    else if (a === '--delay') opts.delay = Number(argv[++i]);
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/thumbnails.js [--all] [--delay ms] [--headed] [slug ...]');
      process.exit(0);
    } else if (a.startsWith('--')) { console.error(`Unknown option ${a}`); process.exit(1); }
    else opts.slugs.push(a);
  }
  generateThumbnails(opts).then((done) => {
    if (done.length) console.log(`\nWrote ${done.length} thumbnail(s).`);
  });
}
