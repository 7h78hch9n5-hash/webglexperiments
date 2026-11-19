#!/usr/bin/env node
/*
 * Add an experiment to the gallery.
 *
 *   node scripts/add.js path/to/sketch.html
 *   node scripts/add.js sketch.html --title "Glass Orbs" --tags glass,lighting --description "Refraction study"
 *
 * Options:
 *   --title "..."        override the title (default: the file's <title>, else the file name)
 *   --slug  my-slug      override the folder name (default: derived from the title)
 *   --tags  a,b,c        comma-separated tags
 *   --description "..."  short description (default: <meta name="description"> if present)
 *   --date  2026-01-31   date (default: today)
 *   --force              overwrite an existing experiment with the same slug
 *   --no-thumb           skip thumbnail generation
 */
const fs = require('fs');
const path = require('path');
const { generateThumbnails } = require('./thumbnails');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'experiments.json');

function parseArgs(argv) {
  const opts = { tags: [], thumb: true, force: false };
  const takesValue = ['title', 'slug', 'tags', 'description', 'date'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (a === '--no-thumb') opts.thumb = false;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split(/=(.*)/s);
      if (!takesValue.includes(key)) die(`Unknown option --${key}`);
      const val = inline ?? argv[++i];
      if (val === undefined) die(`--${key} needs a value`);
      opts[key] = val;
    } else if (!opts.file) opts.file = a;
    else die(`Unexpected argument: ${a}`);
  }
  if (typeof opts.tags === 'string') opts.tags = opts.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return opts;
}

function die(msg) { console.error(`Error: ${msg}`); process.exit(1); }

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function titleFromFilename(file) {
  const base = path.basename(file, path.extname(file));
  const name = base.toLowerCase() === 'index' ? path.basename(path.dirname(path.resolve(file))) : base;
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Warn about relative asset references, since only the HTML file is copied.
function relativeRefs(html) {
  const refs = new Set();
  const re = /\b(?:src|href)\s*=\s*["']([^"'#]+)["']|\burl\(\s*["']?([^"')]+)["']?\s*\)|\bfrom\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const ref = m[1] || m[2] || m[3] || m[4];
    if (!ref || /^(?:[a-z]+:|\/\/|data:|blob:|#)/i.test(ref)) continue;
    refs.add(ref);
  }
  return [...refs];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.file) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
    process.exit(opts.file ? 0 : 1);
  }
  const src = path.resolve(opts.file);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) die(`File not found: ${opts.file}`);
  const html = fs.readFileSync(src, 'utf8');

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = html.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i);
  const title = opts.title || (titleTag && decode(titleTag[1])) || titleFromFilename(src);
  const description = opts.description ??
    (metaDesc && decode((metaDesc[0].match(/content=["']([^"']*)["']/i) || [])[1] || '')) ?? '';
  const slug = slugify(opts.slug || title) || slugify(titleFromFilename(src));
  if (!slug) die('Could not derive a slug; pass --slug');
  const date = opts.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die('--date must look like YYYY-MM-DD');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const dir = path.join(ROOT, 'experiments', slug);
  const existing = manifest.findIndex((e) => e.slug === slug);
  if ((existing !== -1 || fs.existsSync(dir)) && !opts.force) {
    die(`"${slug}" already exists. Use --slug to pick another name, or --force to overwrite.`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, 'index.html'));
  // a re-added experiment should get a fresh thumbnail
  if (opts.force) fs.rmSync(path.join(dir, 'thumb.jpg'), { force: true });

  const entry = { slug, title, date, tags: opts.tags, description };
  if (existing !== -1) {
    // keep any extra fields (e.g. "thumbnail" settings) from the previous entry
    manifest[existing] = { ...manifest[existing], ...entry };
  } else manifest.push(entry);
  manifest.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`Added "${title}"`);
  console.log(`  folder: experiments/${slug}/index.html`);
  console.log(`  date:   ${date}`);
  console.log(`  tags:   ${opts.tags.length ? opts.tags.join(', ') : '(none — edit experiments.json to add some)'}`);

  const refs = relativeRefs(html);
  if (refs.length) {
    console.warn(`\n  Heads-up: the file references local assets that were NOT copied:\n    ${refs.join('\n    ')}`);
    console.warn(`  Copy them into experiments/${slug}/ yourself.`);
  }

  if (opts.thumb) {
    console.log('\nGenerating thumbnail…');
    await generateThumbnails({ slugs: [slug] });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
