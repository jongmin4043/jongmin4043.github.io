# Archived: public dashboard v10

This historical note describes the former dual-view market-data dashboard. That standalone public page and its chart controller have been removed. Do not re-upload the old dashboard to restore the current site. The current paper-trading interface is [Quant Live Lab](testing-machine.html).

## Former design

- A collected-data view read Supabase's `get_public_chart_page` and `get_public_chart_tail_v4` functions.
- Samsung Electronics and SK hynix candles came from a Cloud Run collector and historical backfill.
- A separate TradingView view provided intervals, indicators and drawing tools.
- Instrument selection applied to both views.
- Light mode and the mobile layout were preserved.

The original frontend update replaced its page, dedicated controller, shared chart utilities and styling. It deliberately preserved `pipeline-config.js` to avoid overwriting the project's existing publishable key.

## Configuration boundary

`pipeline-config.js` remains a public configuration file used by Live Lab. It may contain a publishable client key, never a secret or service-role key. Public access is governed by the server's row-level security and authenticated command functions.

For current setup, see [LIVE_PAPER_SETUP.md](LIVE_PAPER_SETUP.md). This archived note is not a current deployment checklist.
