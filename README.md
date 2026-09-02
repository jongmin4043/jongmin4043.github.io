# Jongmin Park — Personal Website

A dark, responsive personal portfolio built for GitHub Pages. The site uses plain
HTML, CSS, and JavaScript, so no front-end build step is required. The Data Pipeline
page now includes a working canvas candlestick dashboard, a serverless collector,
and a Supabase schema for completed 1-minute candles and future paper trades.

The public page starts in deterministic **Demo Mode**. Live public data remains
locked until Korea Investment & Securities confirms redistribution permission.

## Publish with GitHub Pages

1. Sign in to GitHub and create a **public** repository named
   `jongmin4043.github.io`.
2. Upload every file in this folder to the root of the repository.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then click **Save**.
6. Open `https://jongmin4043.github.io`. The first deployment can take several
   minutes.

## Files

- `index.html` — page content and structure
- `data-pipeline.html` — Data Pipeline project detail page
- `data-pipeline-chart.js` — responsive candlestick chart and live REST polling
- `pipeline-core.js` — candle validation, merge, and demo-stream logic
- `pipeline-config.js` — public-only dashboard configuration
- `cloud-run/` — Python/Flask KIS collector for Google Cloud Run
- `supabase/` — database schema, RLS policies, and optional retention function
- `PIPELINE_SETUP.md` — Korean step-by-step deployment and cost-control guide
- `testing-machine.html` — Testing Machine project detail page
- `quant-upcoming.html` — placeholder for upcoming quant projects
- `style.css` — all visual styling and responsive layouts
- `script.js` — reveal animation, navigation state, and pointer glow
- `favicon.svg` — browser tab icon

## Contact links

The contact panel includes public links for:

- GitHub: `https://github.com/jongmin4043`
- Instagram: `https://instagram.com/j0nmlnns_`
- Email: `jongmin4043@snu.ac.kr`

Update these values in `index.html` if any account details change.

## Pipeline verification

From the repository root:

```bash
node --check pipeline-core.js
node --check data-pipeline-chart.js
node tests/pipeline-core.test.js
python3 tests/validate_site.py
python3 -m unittest discover -s cloud-run/tests
```

See [`PIPELINE_SETUP.md`](PIPELINE_SETUP.md) before entering any credentials or
enabling public live data.
