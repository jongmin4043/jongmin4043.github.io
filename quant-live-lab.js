(function initializeQuantLiveLab() {
  "use strict";

  const config = window.PIPELINE_CONFIG || {};
  const canvas = document.getElementById("quant-equity-chart");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const wrapper = canvas.parentElement;
  const select = document.getElementById("quant-run-select");
  const elements = {
    metaStatus: document.getElementById("quant-meta-status"),
    status: document.getElementById("quant-status"),
    statusDot: document.getElementById("quant-status-dot"),
    updated: document.getElementById("quant-updated"),
    returnValue: document.getElementById("quant-return"),
    benchmark: document.getElementById("quant-benchmark"),
    benchmarkLabel: document.getElementById("quant-benchmark-label"),
    excess: document.getElementById("quant-excess"),
    drawdown: document.getElementById("quant-drawdown"),
    sharpe: document.getElementById("quant-sharpe"),
    sortino: document.getElementById("quant-sortino"),
    edge: document.getElementById("quant-edge"),
    edgeSample: document.getElementById("quant-edge-sample"),
    winRate: document.getElementById("quant-win-rate"),
    annualReturn: document.getElementById("stat-annual-return"),
    volatility: document.getElementById("stat-volatility"),
    downside: document.getElementById("stat-downside"),
    profitFactor: document.getElementById("stat-profit-factor"),
    turnover: document.getElementById("stat-turnover"),
    tradesCount: document.getElementById("stat-trades"),
    costs: document.getElementById("stat-costs"),
    edgeCi: document.getElementById("stat-edge-ci"),
    equityEmpty: document.getElementById("quant-equity-empty"),
    positions: document.getElementById("quant-positions-body"),
    trades: document.getElementById("quant-trades-body"),
  };

  const state = { runs: [], runId: null, summary: null, equity: [], currency: "USD", loading: false };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const number = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const percent = (value) => {
    const parsed = number(value);
    if (parsed === null) return "—";
    const sign = parsed > 0 ? "+" : "";
    return `${sign}${(parsed * 100).toFixed(2)}%`;
  };
  const ratio = (value) => {
    const parsed = number(value);
    return parsed === null ? "—" : parsed.toFixed(2);
  };
  const bps = (value) => {
    const parsed = number(value);
    if (parsed === null) return "—";
    const sign = parsed > 0 ? "+" : "";
    return `${sign}${parsed.toFixed(1)} bps`;
  };
  const compact = (value, digits = 2) => {
    const parsed = number(value);
    if (parsed === null) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, notation: "compact" }).format(parsed);
  };
  const currency = (value) => {
    const parsed = number(value);
    if (parsed === null) return "—";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: state.currency,
        maximumFractionDigits: state.currency === "KRW" ? 0 : 2,
      }).format(parsed);
    } catch (_) {
      return `${compact(parsed)} ${state.currency}`;
    }
  };
  const dateTime = (value) => value
    ? new Intl.DateTimeFormat("en-GB", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(value))
    : "—";
  const isPublicConfigValid = () => {
    const key = String(config.supabasePublishableKey || "");
    return /^https:\/\//.test(config.supabaseUrl || "")
      && key.length > 20
      && !key.includes("PASTE_")
      && !key.toLowerCase().includes("secret");
  };

  const setStatus = (message, kind = "waiting") => {
    elements.status.textContent = message;
    elements.statusDot.classList.toggle("is-live", kind === "live");
    elements.statusDot.classList.toggle("is-error", kind === "error");
  };
  const supabaseRpc = async (functionName, payload = {}) => {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Public results API returned ${response.status}`);
    return response.json();
  };

  const clearMetrics = () => {
    [
      elements.returnValue, elements.benchmark, elements.excess, elements.drawdown,
      elements.sharpe, elements.sortino, elements.edge, elements.winRate,
      elements.annualReturn, elements.volatility, elements.downside,
      elements.profitFactor, elements.turnover, elements.tradesCount,
      elements.costs, elements.edgeCi,
    ].forEach((element) => { element.textContent = "—"; });
    elements.edgeSample.textContent = "After-cost sample";
  };

  const renderSummary = (summary) => {
    if (!summary) {
      clearMetrics();
      return;
    }
    state.currency = summary.base_currency || "USD";
    elements.returnValue.textContent = percent(summary.cumulative_return);
    elements.benchmark.textContent = percent(summary.benchmark_return);
    elements.excess.textContent = percent(summary.excess_return);
    elements.drawdown.textContent = percent(summary.max_drawdown);
    elements.sharpe.textContent = ratio(summary.sharpe_ratio);
    elements.sortino.textContent = ratio(summary.sortino_ratio);
    elements.edge.textContent = bps(summary.realized_edge_bps);
    elements.winRate.textContent = percent(summary.win_rate);
    elements.benchmarkLabel.textContent = summary.benchmark_instrument_id || "Published benchmark";
    elements.edgeSample.textContent = summary.edge_sample_size === null
      ? "After-cost sample"
      : `${Number(summary.edge_sample_size).toLocaleString("en-US")} closed observations`;
    elements.annualReturn.textContent = percent(summary.annualized_return);
    elements.volatility.textContent = percent(summary.annualized_volatility);
    elements.downside.textContent = percent(summary.downside_volatility);
    elements.profitFactor.textContent = ratio(summary.profit_factor);
    elements.turnover.textContent = ratio(summary.turnover);
    elements.tradesCount.textContent = summary.total_round_trips === null
      ? "—"
      : Number(summary.total_round_trips).toLocaleString("en-US");
    elements.costs.textContent = currency(summary.total_costs);
    const ciLow = number(summary.edge_confidence_low_bps);
    const ciHigh = number(summary.edge_confidence_high_bps);
    elements.edgeCi.textContent = ciLow === null || ciHigh === null
      ? "—"
      : `${ciLow.toFixed(1)} to ${ciHigh.toFixed(1)} bps`;
  };

  const renderPositions = (rows) => {
    if (!rows.length) {
      elements.positions.innerHTML = '<tr class="pipeline-empty-row"><td colspan="5">No published positions yet.</td></tr>';
      return;
    }
    elements.positions.innerHTML = rows.map((row) => `<tr>
      <td>${escapeHtml(row.instrument_id)}</td>
      <td>${compact(row.quantity, 6)}</td>
      <td>${currency(row.market_value)}</td>
      <td>${percent(row.portfolio_weight)}</td>
      <td class="${number(row.unrealized_pnl) >= 0 ? "trade-buy" : "trade-sell"}">${currency(row.unrealized_pnl)}</td>
    </tr>`).join("");
  };

  const renderTrades = (rows) => {
    if (!rows.length) {
      elements.trades.innerHTML = '<tr class="pipeline-empty-row"><td colspan="7">No completed public paper trades yet.</td></tr>';
      return;
    }
    elements.trades.innerHTML = rows.map((row) => {
      const side = String(row.side || "").toUpperCase();
      const costs = (number(row.fees) || 0) + (number(row.taxes) || 0);
      const pnl = number(row.realized_pnl);
      return `<tr>
        <td>${dateTime(row.filled_at)}</td>
        <td>${escapeHtml(row.instrument_id)}</td>
        <td class="${side === "BUY" ? "trade-buy" : "trade-sell"}">${escapeHtml(side)}</td>
        <td>${compact(row.quantity, 6)}</td>
        <td>${currency(row.price)}</td>
        <td>${currency(costs)}</td>
        <td class="${pnl !== null && pnl >= 0 ? "trade-buy" : "trade-sell"}">${currency(pnl)}</td>
      </tr>`;
    }).join("");
  };

  const drawEquity = () => {
    const ratioValue = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, wrapper.clientWidth);
    const height = Math.max(1, wrapper.clientHeight);
    canvas.width = Math.round(width * ratioValue);
    canvas.height = Math.round(height * ratioValue);
    context.setTransform(ratioValue, 0, 0, ratioValue, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!state.equity.length) {
      elements.equityEmpty.hidden = false;
      return;
    }
    elements.equityEmpty.hidden = true;
    const left = 18;
    const right = 64;
    const top = 22;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const portfolio = state.equity.map((row) => number(row.cumulative_return)).filter((value) => value !== null);
    const benchmark = state.equity.map((row) => number(row.benchmark_return)).filter((value) => value !== null);
    const values = [...portfolio, ...benchmark, 0];
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    const padding = Math.max(0.005, (maxValue - minValue) * 0.12);
    minValue -= padding;
    maxValue += padding;
    const x = (index) => left + (state.equity.length === 1 ? plotWidth : (index / (state.equity.length - 1)) * plotWidth);
    const y = (value) => top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

    context.font = '10px "DM Mono", monospace';
    context.textBaseline = "middle";
    for (let index = 0; index <= 4; index += 1) {
      const value = maxValue - ((maxValue - minValue) / 4) * index;
      const yPos = top + (plotHeight / 4) * index;
      context.strokeStyle = "rgba(255,255,255,.07)";
      context.beginPath();
      context.moveTo(left, yPos + 0.5);
      context.lineTo(width - right, yPos + 0.5);
      context.stroke();
      context.fillStyle = "rgba(148,151,161,.78)";
      context.textAlign = "left";
      context.fillText(`${(value * 100).toFixed(1)}%`, width - right + 9, yPos);
    }

    const line = (field, color) => {
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      let started = false;
      state.equity.forEach((row, index) => {
        const value = number(row[field]);
        if (value === null) return;
        if (!started) context.moveTo(x(index), y(value));
        else context.lineTo(x(index), y(value));
        started = true;
      });
      if (started) context.stroke();
    };
    line("benchmark_return", "rgba(148,151,161,.75)");
    line("cumulative_return", "#42e8bd");
  };

  const populateRuns = () => {
    select.replaceChildren();
    state.runs.forEach((run) => {
      const option = document.createElement("option");
      option.value = run.run_id;
      option.textContent = `${run.public_name} · ${run.public_version}`;
      select.appendChild(option);
    });
    select.disabled = state.runs.length < 2;
    if (state.runId) select.value = state.runId;
  };

  const loadRun = async (runId) => {
    if (!runId || state.loading) return;
    state.loading = true;
    state.runId = runId;
    setStatus("Refreshing public paper results", "waiting");
    try {
      const [summaryRows, equityRows, tradeRows, positionRows] = await Promise.all([
        supabaseRpc("get_public_quant_summary", { p_run_id: runId }),
        supabaseRpc("get_public_equity_curve", { p_run_id: runId, p_before: null, p_limit: 500 }),
        supabaseRpc("get_public_paper_trades", { p_run_id: runId, p_before: null, p_limit: 100 }),
        supabaseRpc("get_public_positions", { p_run_id: runId }),
      ]);
      state.summary = summaryRows[0] || null;
      state.equity = equityRows;
      renderSummary(state.summary);
      renderPositions(positionRows);
      renderTrades(tradeRows);
      drawEquity();
      setStatus(state.summary ? "Published paper results are current" : "Run published · waiting for observations", "live");
      elements.metaStatus.textContent = state.summary?.run_status || "Published · awaiting data";
      elements.updated.textContent = state.summary?.calculated_at
        ? `Calculated ${dateTime(state.summary.calculated_at)}`
        : `Checked ${dateTime(Date.now())}`;
    } catch (error) {
      setStatus("Public performance feed unavailable", "error");
      elements.updated.textContent = error.message;
      elements.metaStatus.textContent = "Unavailable";
    } finally {
      state.loading = false;
    }
  };

  const initialize = async () => {
    clearMetrics();
    drawEquity();
    if (!isPublicConfigValid()) {
      setStatus("Add the Supabase publishable key to pipeline-config.js", "error");
      elements.updated.textContent = "Never use a secret or service-role key in GitHub Pages";
      elements.metaStatus.textContent = "Configuration needed";
      return;
    }
    try {
      state.runs = await supabaseRpc("get_public_quant_runs", {});
      if (!state.runs.length) {
        select.replaceChildren(new Option("No published runs", ""));
        select.disabled = true;
        setStatus("Public schema ready · paper engine has not published a run", "waiting");
        elements.updated.textContent = `Checked ${dateTime(Date.now())}`;
        elements.metaStatus.textContent = "Awaiting first paper run";
        return;
      }
      state.runId = state.runs[0].run_id;
      populateRuns();
      await loadRun(state.runId);
    } catch (error) {
      setStatus("Install the public Quant Live Lab schema", "error");
      elements.updated.textContent = error.message;
      elements.metaStatus.textContent = "Schema needed";
    }
  };

  select.addEventListener("change", () => loadRun(select.value));
  if ("ResizeObserver" in window) new ResizeObserver(drawEquity).observe(wrapper);
  else window.addEventListener("resize", drawEquity);
  initialize();
  window.setInterval(() => {
    if (state.runId && !document.hidden) loadRun(state.runId);
  }, 30000);
})();
