# WebGL Experiments

A personal gallery of WebGL experiments, built from plain static files (no build step) and hosted on GitHub Pages.

```
index.html                  the gallery page
experiments.json            manifest: slug, title, date, tags, description
experiments/<slug>/
  index.html                the experiment, unchanged
  thumb.jpg                 1200×750 screenshot
scripts/
  add.js                    add a new experiment
  thumbnails.js             generate missing thumbnails with Playwright
  serve.js                  local preview server
```

## One-time setup

```bash
npm install
npx playwright install chromium
```

## Add an experiment

```bash
npm run add -- path/to/my-sketch.html --tags glass,lighting
```

This will:

1. Take the title from the file's `<title>` tag (use `--title "..."` to override it).
2. Create `experiments/<slug>/index.html` (use `--slug` to choose the folder name).
3. Add an entry to `experiments.json`, dated today (use `--date YYYY-MM-DD` for another date). The description comes from `<meta name="description">` if the file has one, or from `--description "..."`.
4. Take the thumbnail.

Then preview the gallery and commit:

```bash
npm run serve        # http://localhost:8080
git add . && git commit -m "Add my-sketch" && git push
```

Pushing to `main` deploys the site.

**Experiments that use extra files.** Only the HTML file is copied. If it loads textures, models, etc. by relative path, `add.js` lists them. Copy those files into the experiment's folder yourself.

**Editing later.** `experiments.json` is plain JSON, so you can edit titles, tags and descriptions by hand. The tag chips in the gallery come from the tags you use.

## Thumbnails

```bash
npm run thumbs                      # only experiments without a thumb.jpg
npm run thumbs -- --all             # regenerate everything
npm run thumbs -- plasma-drift      # specific experiments
npm run thumbs -- --delay 6000      # wait longer before the screenshot (default 3000 ms)
npm run thumbs -- --headed          # watch it in a visible browser
```

Before each screenshot, the script hides control panels (lil-gui, dat.gui, Tweakpane, Leva, stats.js) and any floating DOM overlays that aren't the canvas. If a thumbnail still looks wrong, add settings for that experiment in `experiments.json`:

```json
{
  "slug": "my-sketch",
  "...": "...",
  "thumbnail": { "delay": 8000, "hide": ["#title-card"], "keepOverlays": true },
  "preview": false
}
```

- `delay`: how long to wait before the screenshot, in ms.
- `hide`: extra CSS selectors to hide.
- `keepOverlays`: turns off the automatic overlay hiding (use it when DOM elements are part of the artwork).
- `preview: false`: turns off the live hover preview in the gallery (useful for heavy or noisy pieces).

You can also put a `data-hide-in-thumbnail` attribute on any element.

Rendering uses software WebGL (SwiftShader), so it works on any machine, but heavy scenes may render slowly. If a scene hasn't finished loading, increase `delay`.

## Gallery features

- Search covers titles, descriptions and tags. Press `/` to focus the search box.
- Tag chips filter the grid; selecting several tags shows experiments with any of them. You can sort by newest, oldest or title.
- Filters are saved in the URL, so a filtered view can be shared.
- Clicking a card opens the experiment full screen at `#/<slug>`. That link can be shared directly. To return to the gallery, use the "← back to gallery" button, press Esc, or use the browser's back button.
- Cmd/Ctrl-click opens the experiment on its own in a new tab.
- On desktop, hovering over a card for about half a second shows the experiment running live in the card.

## Deployment

`.github/workflows/pages.yml` deploys the site on every push to `main`. It publishes only `index.html`, `experiments.json` and `experiments/`. If you add other root-level files (a favicon, an `about.html`), add them to the `cp` line in that workflow.

To turn it on: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
