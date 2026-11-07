# Quant Live Lab

The portfolio page is `testing-machine.html`. It displays UPRO, SPXU, TQQQ and SQQQ, completed virtual fills and portfolio summaries. The private companion publishes to Supabase; market updates are not GitHub commits.

Only website presentation and tests belong in this public repository. Do not add models, fitted coefficients, private engine source, research datasets, checkpoints, Supabase secret keys or IBKR credentials.

Initial setup is required once using the separately supplied private Live Paper Trader package:

1. Run `Setup-Live-Paper.cmd` with the official TWS API SDK, a validated REAL1m/5m warm-up Dataset and private Supabase credentials. It installs the authenticated RPCs and registers the dashboard owner.
2. Login to IB Gateway with Read-Only API enabled. Run `Start-Live-Paper.cmd` on the same always-on computer.
3. Login to the page's admin panel, select an already evaluated Fitted model, confirm simulation assumptions and start the virtual portfolio.

The page is intentionally empty when the backend/schema is unconfigured. It does not invent prices or investment performance. A stale heartbeat is labelled offline. Starting a daemon alone never installs or trades an untrained starter model. No real or IBKR Paper broker orders are sent.

Private/admin price display is separate from public market-data display. Confirm the supplier's external display and redistribution rights before enabling public price publication. An ordinary individual IBKR subscription should not be assumed to grant those rights. Admin controls are authenticated on the server; hiding controls in the browser is not the access check.

The daily research job uses a bounded existing Adaptive Backtester, chronological paired comparisons, costs, delay and drawdown gates. A passing candidate is queued for a future trading-day boundary and applied only when the account has no positions or pending orders. Cash, P&L and cumulative Score are preserved. Failed/incomplete comparisons keep the incumbent. Model internals are never part of public responses.

Tests: `python tests/validate_site.py`, `node --test tests/pipeline-core.test.js`, `node tests/live-paper.test.cjs`. The last test is a DOM harness and does not claim real browser or broker verification.
