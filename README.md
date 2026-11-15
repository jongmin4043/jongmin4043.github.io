# Jongmin Park — Personal Website

An English-language personal portfolio on GitHub Pages, built with plain HTML, CSS and JavaScript. Dark and light themes share the same layout. No frontend build step is required.

## Public pages

- `index.html`: profile, interests, selected work and contact links.
- `testing-machine.html`: Quant Live Lab, with UPRO, SPXU, TQQQ and SQQQ charts, completed virtual trades, portfolio statistics and authenticated administrator controls.
- `project-footprint.html`: three concise milestones covering data, private research and live paper trading.
- `quant-upcoming.html`: a placeholder for future projects.

The former standalone market-data dashboard has been removed from the site. Data collection and storage remain separate from the public page structure.

## Live Lab

`live-paper.js` presents data from the existing Supabase configuration in `pipeline-config.js`. The private companion publishes records to Supabase; price updates are not GitHub commits. Historical replay is labelled as a retrospective simulation and is separate from observed live paper results. The linked performance index does not merge their cash or position ledgers.

The private engine, fitted models, coefficients, datasets, checkpoints and service credentials do not belong in this public repository. Administrator access is checked by authenticated server functions. Market-data publication remains subject to the existing authorization controls. No broker orders are sent.

See [LIVE_PAPER_SETUP.md](LIVE_PAPER_SETUP.md) for the companion workflow. `cloud-run/`, `supabase/` and [PIPELINE_SETUP.md](PIPELINE_SETUP.md) retain the earlier collector implementation and its archived operational notes; they are not deployment instructions for the current IBKR companion.

## Publish

In the repository's **Settings → Pages**, publish the `main` branch from `/ (root)`. The site is available at https://jongmin4043.github.io.

## Verify

From the repository root:

```bash
python3 tests/validate_site.py
node --check live-paper.js
node tests/live-paper.test.cjs
node tests/live-paper-history.test.cjs
node tests/pipeline-core.test.js
python3 -m unittest discover -s cloud-run/tests
```

The Live Lab tests use a DOM harness. They do not verify an actual browser, broker session or private account.

## Contact

- GitHub: https://github.com/jongmin4043
- Instagram: https://instagram.com/j0nmlnns_
- Email: jongmin4043@snu.ac.kr
