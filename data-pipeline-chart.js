(function initializePipelineDashboard() {
  "use strict";

  const config = window.PIPELINE_CONFIG || {};
  const core = window.PipelineCore;
  const canvas = document.getElementById("pipeline-chart");
  if (!canvas || !core) return;

  const context = canvas.getContext("2d");
  const wrapper = document.getElementById("pipeline-canvas-wrap");
  const tooltip = document.getElementById("pipeline-tooltip");
  const followButton = document.getElementById("pipeline-follow");
  const symbolButtons = [...document.querySelectorAll("[data-instrument-id]")];
  const timeframeButtons = [...document.querySelectorAll("[data-timeframe]")];
  const elements = {
    mode: document.getElementById("pipeline-mode"),
    price: document.getElementById("metric-price"),
    change: document.getElementById("metric-change"),
    volume: document.getElementById("metric-volume"),
    time: document.getElementById("metric-time"),
    candleLabel: document.getElementById("metric-candle-label"),
    timezone: document.getElementById("metric-timezone"),
    lag: document.getElementById("metric-lag"),
    lagLabel: document.getElementById("metric-lag-label"),
    status: document.getElementById("stream-status"),
    updated: document.getElementById("stream-updated"),
    dot: document.getElementById("stream-dot"),
    healthMode: document.getElementById("health-mode"),
    healthPublic: document.getElementById("health-public"),
    healthInterval: document.getElementById("health-interval"),
    notice: document.getElementById("pipeline-notice-copy"),
    trades: document.getElementById("paper-trades-body"),
    symbolOverline: document.getElementById("pipeline-symbol-overline"),
    symbolName: document.getElementById("pipeline-symbol-name"),
    timeframeNote: document.getElementById("pipeline-timeframe-note"),
    adminForm: document.getElementById("pipeline-admin-form"),
    adminEmail: document.getElementById("pipeline-admin-email"),
    adminPassword: document.getElementById("pipeline-admin-password"),
    adminSubmit: document.getElementById("pipeline-admin-submit"),
    adminSession: document.getElementById("pipeline-admin-session"),
    adminIdentity: document.getElementById("pipeline-admin-identity"),
    adminSignOut: document.getElementById("pipeline-admin-signout"),
    adminStatus: document.getElementById("pipeline-admin-status"),
  };

  const TIMEFRAMES = Object.freeze({
    "5m": { label: "5m", minutes: 5, health: "5 minutes" },
    "120m": { label: "120m", minutes: 120, health: "120 minutes" },
    "1d": { label: "1D", minutes: 1440, health: "1 trading day" },
  });
  const instruments = Array.isArray(config.instruments) && config.instruments.length
    ? config.instruments
    : [{
      instrumentId: "KRX:005930",
      symbol: "005930",
      symbolName: "Samsung Electronics",
      market: "KRX",
      mark: "SE",
      currency: "KRW",
      timeZone: "Asia/Seoul",
      priceDecimals: 0,
    }];
  const instrumentsById = new Map(instruments.map((item) => [item.instrumentId, item]));
  const requestedDefault = String(config.defaultTimeframe || "5m");

  const state = {
    candles: [],
    trades: [],
    mode: "locked",
    autoFollow: true,
    viewOffset: 0,
    hoverIndex: null,
    activeInstrumentId: instruments[0].instrumentId,
    activeTimeframe: TIMEFRAMES[requestedDefault] ? requestedDefault : "5m",
    historyLoaded: false,
    hasOlder: true,
    loading: false,
    loadingOlder: false,
    drag: null,
    accessMode: "none",
    authSession: null,
  };

  let resizeFrame = null;
  let canvasPixelWidth = 0;
  let canvasPixelHeight = 0;
  let demoTimer = null;
  let refreshTimer = null;
  const adminAuth = config.adminChartEnabled !== false && window.PipelineAdminAuth
    ? window.PipelineAdminAuth.create({
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
    })
    : null;

  const readChartColors = () => {
    const styles = window.getComputedStyle(document.documentElement);
    const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    return {
      muted: color("--chart-muted", "rgba(148, 151, 161, .78)"),
      grid: color("--chart-grid", "rgba(255, 255, 255, .065)"),
      up: color("--chart-up", "#42e8bd"),
      down: color("--chart-down", "#ff7187"),
      crosshair: color("--chart-crosshair", "rgba(255, 255, 255, .24)"),
    };
  };
  let colors = readChartColors();
  const compactFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const formatterCache = new Map();

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const isSupabaseConfigurationValid = () => {
    const publishableKey = String(config.supabasePublishableKey || "").trim();
    return config.mode === "live"
      && /^https:\/\//.test(config.supabaseUrl || "")
      && publishableKey.length > 20
      && !publishableKey.includes("PASTE_")
      && !publishableKey.startsWith("sb_secret_");
  };

  const hasChartAccess = () => isSupabaseConfigurationValid();

  const chartRpcName = (operation) => operation === "page"
    ? "get_public_chart_page"
    : "get_public_chart_tail_v4";

  const activeInstrument = () => instrumentsById.get(state.activeInstrumentId)
    || instruments[0];
  const timeframe = () => TIMEFRAMES[state.activeTimeframe];
  const maxHistory = () => Math.max(500, Number(config.maxHistoryCandles) || 5000);
  const pageSize = () => Math.min(500, Math.max(50, Number(config.pageSize) || 300));

  const cachedFormatter = (type, options) => {
    const instrument = activeInstrument();
    const key = `${type}:${instrument.timeZone}:${instrument.priceDecimals}`;
    if (!formatterCache.has(key)) {
      formatterCache.set(
        key,
        type === "number"
          ? new Intl.NumberFormat("en-US", options)
          : new Intl.DateTimeFormat("en-GB", { timeZone: instrument.timeZone, ...options }),
      );
    }
    return formatterCache.get(key);
  };

  const formatPrice = (value) => cachedFormatter("number", {
    minimumFractionDigits: activeInstrument().priceDecimals || 0,
    maximumFractionDigits: activeInstrument().priceDecimals || 0,
  }).format(value);
  const formatTime = (value) => cachedFormatter("time", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  const formatDateTime = (value) => cachedFormatter("datetime", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  const formatDate = (value) => cachedFormatter("date", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
  const sessionDate = (value) => cachedFormatter("session", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

  const updateSelectionUi = () => {
    const instrument = activeInstrument();
    elements.symbolOverline.textContent = `${instrument.market} · ${instrument.symbol}`;
    elements.symbolName.textContent = instrument.symbolName;
    elements.candleLabel.textContent = `${timeframe().label} candle`;
    elements.timezone.textContent = instrument.timeZone;
    elements.healthInterval.textContent = timeframe().health;
    elements.timeframeNote.textContent = state.loadingOlder
      ? "Loading older bars…"
      : "Drag horizontally to explore history";
    const mark = document.querySelector(".pipeline-symbol-mark");
    if (mark) mark.textContent = instrument.mark || instrument.symbol.slice(-2);
    symbolButtons.forEach((button) => {
      const selected = button.dataset.instrumentId === state.activeInstrumentId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    timeframeButtons.forEach((button) => {
      const selected = button.dataset.timeframe === state.activeTimeframe;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };

  const capacity = () => {
    const width = Math.max(wrapper.clientWidth, 320);
    return Math.max(26, Math.floor((width - 94) / 9));
  };

  const visibleWindow = () => core.candleWindow(
    state.candles,
    capacity(),
    state.autoFollow ? 0 : state.viewOffset,
  );

  const resizeCanvas = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, wrapper.clientWidth);
    const height = Math.max(1, wrapper.clientHeight);
    const nextPixelWidth = Math.round(width * ratio);
    const nextPixelHeight = Math.round(height * ratio);
    if (nextPixelWidth !== canvasPixelWidth || nextPixelHeight !== canvasPixelHeight) {
      canvas.width = nextPixelWidth;
      canvas.height = nextPixelHeight;
      canvasPixelWidth = nextPixelWidth;
      canvasPixelHeight = nextPixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawChart();
  };

  const scheduleCanvasResize = () => {
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      resizeCanvas();
    });
  };

  const drawText = (text, x, y, align = "left", color = colors.muted) => {
    context.fillStyle = color;
    context.font = '10px "DM Mono", monospace';
    context.textAlign = align;
    context.textBaseline = "middle";
    context.fillText(text, x, y);
  };

  const xAxisLabel = (candle) => state.activeTimeframe === "1d"
    ? formatDate(candle.time).replace(/\s\d{4}$/, "")
    : formatDateTime(candle.time);

  function drawChart() {
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    context.clearRect(0, 0, width, height);
    const candles = visibleWindow().candles;
    if (!candles.length) {
      const message = state.mode === "locked"
        ? "PUBLIC MARKET FEED LOCKED"
        : state.loading
          ? "LOADING MARKET HISTORY"
          : "WAITING FOR MARKET DATA";
      drawText(message, width / 2, height / 2, "center");
      return;
    }

    const left = 14;
    const right = 76;
    const top = 18;
    const bottom = 31;
    const volumeHeight = Math.max(54, height * 0.17);
    const gap = 18;
    const priceBottom = height - bottom - volumeHeight - gap;
    const volumeTop = priceBottom + gap;
    const plotWidth = Math.max(10, width - left - right);
    const priceValues = candles.flatMap((candle) => [candle.low, candle.high]);
    let minPrice = Math.min(...priceValues);
    let maxPrice = Math.max(...priceValues);
    const priceRange = Math.max(0.0001, maxPrice - minPrice);
    minPrice -= priceRange * 0.08;
    maxPrice += priceRange * 0.08;
    const yForPrice = (price) => top
      + ((maxPrice - price) / (maxPrice - minPrice)) * (priceBottom - top);
    const candleWidth = plotWidth / candles.length;
    const bodyWidth = Math.max(2, Math.min(7, candleWidth * 0.58));
    const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume));

    for (let index = 0; index <= 4; index += 1) {
      const y = top + ((priceBottom - top) / 4) * index;
      context.strokeStyle = colors.grid;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(left, y + 0.5);
      context.lineTo(width - right, y + 0.5);
      context.stroke();
      drawText(formatPrice(maxPrice - ((maxPrice - minPrice) / 4) * index), width - right + 10, y);
    }

    [0, Math.floor((candles.length - 1) / 2), candles.length - 1].forEach((index) => {
      if (index < 0) return;
      const x = left + candleWidth * index + candleWidth / 2;
      context.strokeStyle = colors.grid;
      context.beginPath();
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, height - bottom);
      context.stroke();
      drawText(xAxisLabel(candles[index]), x, height - 13, "center");
    });

    candles.forEach((candle, index) => {
      const x = left + candleWidth * index + candleWidth / 2;
      const color = candle.close >= candle.open ? colors.up : colors.down;
      const openY = yForPrice(candle.open);
      const closeY = yForPrice(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + 0.5, yForPrice(candle.high));
      context.lineTo(x + 0.5, yForPrice(candle.low));
      context.stroke();
      context.fillStyle = color;
      context.globalAlpha = candle.isComplete ? 1 : 0.68;
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      if (!candle.isComplete) {
        context.globalAlpha = 1;
        context.strokeStyle = color;
        context.strokeRect(x - bodyWidth / 2 - 1, bodyTop - 1, bodyWidth + 2, bodyHeight + 2);
      }
      const volumeHeightPx = (candle.volume / maxVolume) * volumeHeight;
      context.globalAlpha = 0.34;
      context.fillRect(
        x - bodyWidth / 2,
        volumeTop + volumeHeight - volumeHeightPx,
        bodyWidth,
        volumeHeightPx,
      );
      context.globalAlpha = 1;
    });

    const last = candles[candles.length - 1];
    const lastY = yForPrice(last.close);
    context.strokeStyle = last.close >= last.open ? colors.up : colors.down;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(left, lastY + 0.5);
    context.lineTo(width - right, lastY + 0.5);
    context.stroke();
    context.setLineDash([]);

    if (state.hoverIndex !== null && candles[state.hoverIndex] && !state.drag) {
      const hovered = candles[state.hoverIndex];
      const x = left + candleWidth * state.hoverIndex + candleWidth / 2;
      context.strokeStyle = colors.crosshair;
      context.beginPath();
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, height - bottom);
      context.stroke();
      const candleState = hovered.isComplete ? "CLOSED" : "FORMING";
      const stamp = state.activeTimeframe === "1d" ? formatDate(hovered.time) : formatDateTime(hovered.time);
      tooltip.textContent = `${timeframe().label} ${candleState} · ${stamp}  O ${formatPrice(hovered.open)}  H ${formatPrice(hovered.high)}  L ${formatPrice(hovered.low)}  C ${formatPrice(hovered.close)}  V ${compactFormatter.format(hovered.volume)}`;
      tooltip.classList.add("is-visible");
    } else {
      tooltip.classList.remove("is-visible");
    }
  }

  const updateMetrics = (requestDuration = null) => {
    if (!state.candles.length) return;
    const latest = state.candles[state.candles.length - 1];
    const latestSessionDate = sessionDate(latest.time);
    const sessionCandles = state.candles.filter(
      (candle) => sessionDate(candle.time) === latestSessionDate,
    );
    const first = sessionCandles[0] || latest;
    const change = latest.close - first.open;
    const percent = core.percentChange(first.open, latest.close);
    const sessionVolume = state.activeTimeframe === "1d"
      ? latest.volume
      : sessionCandles.reduce((sum, candle) => sum + candle.volume, 0);
    const sign = change >= 0 ? "+" : "";
    elements.price.textContent = formatPrice(latest.close);
    elements.change.textContent = `${sign}${formatPrice(change)}  ${sign}${percent.toFixed(2)}%`;
    elements.change.className = change >= 0 ? "is-up" : "is-down";
    elements.volume.textContent = compactFormatter.format(sessionVolume);
    elements.time.textContent = state.activeTimeframe === "1d"
      ? formatDate(latest.time)
      : formatTime(latest.time);

    if (state.mode === "demo") {
      elements.lag.textContent = "SIM";
      elements.lagLabel.textContent = "accelerated";
    } else {
      const collectedAt = latest.collectedAt || Date.now();
      const lagSeconds = Math.max(0, Math.round((Date.now() - collectedAt) / 1000));
      elements.lag.textContent = lagSeconds < 3600
        ? `${lagSeconds}s`
        : `${Math.floor(lagSeconds / 3600)}h`;
      elements.lagLabel.textContent = requestDuration === null ? "data age" : `${requestDuration}ms API`;
    }
  };

  const renderTradesTable = () => {
    if (!elements.trades) return;
    if (!state.trades.length) {
      elements.trades.innerHTML = '<tr class="pipeline-empty-row"><td colspan="5">No paper trades recorded yet.</td></tr>';
      return;
    }
    elements.trades.innerHTML = state.trades.slice(-5).reverse().map((trade) => {
      const side = String(trade.side).toUpperCase();
      return `<tr>
        <td>${formatTime(Number(trade.time))}</td>
        <td class="${side === "BUY" ? "trade-buy" : "trade-sell"}">${escapeHtml(side)}</td>
        <td>${formatPrice(Number(trade.price))}</td>
        <td>${formatPrice(Number(trade.quantity || 0))}</td>
        <td>${escapeHtml(trade.strategy || "paper_demo")}</td>
      </tr>`;
    }).join("");
  };

  const setStatus = (message, kind = "stale") => {
    elements.status.textContent = message;
    elements.dot.classList.toggle("is-live", kind === "live");
    elements.updated.textContent = `Updated ${formatTime(Date.now())} ${activeInstrument().timeZone}`;
  };

  const setFollow = (enabled) => {
    state.autoFollow = enabled;
    if (enabled) state.viewOffset = 0;
    followButton.classList.toggle("is-active", enabled);
    followButton.setAttribute("aria-pressed", String(enabled));
  };

  const supabaseRpc = async (functionName, payload, retry = true) => {
    const authenticated = state.accessMode === "admin";
    const accessToken = authenticated ? await adminAuth?.getAccessToken() : "";
    if (authenticated && !accessToken) throw new Error("Administrator session expired.");
    const headers = {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (response.status === 401 && authenticated && retry) {
      state.authSession = await adminAuth.refresh(true);
      return supabaseRpc(functionName, payload, false);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Administrator access denied.");
      }
      throw new Error(`Market data API returned ${response.status}`);
    }
    return response.json();
  };

  const setAuthStatus = (message, kind = "") => {
    if (!elements.adminStatus) return;
    elements.adminStatus.textContent = message;
    elements.adminStatus.classList.toggle("is-error", kind === "error");
    elements.adminStatus.classList.toggle("is-success", kind === "success");
  };

  const updateAuthUi = () => {
    const signedIn = state.accessMode === "admin" && Boolean(state.authSession);
    if (elements.adminForm) elements.adminForm.hidden = signedIn;
    if (elements.adminSession) elements.adminSession.hidden = !signedIn;
    if (elements.adminIdentity) {
      elements.adminIdentity.textContent = signedIn
        ? String(state.authSession?.user?.email || "Allowlisted account")
        : "—";
    }
    if (signedIn) setAuthStatus("Private chart access active for this browser tab.", "success");
  };

  const verifyAdminAccess = async () => {
    const allowed = await supabaseRpc("is_chart_admin", {});
    if (allowed !== true) throw new Error("This account is not authorized for the private chart.");
  };

  const startRefreshLoop = () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(
      () => {
        if (hasChartAccess()) loadLiveData();
      },
      Math.max(5000, Number(config.refreshMs) || 10000),
    );
  };

  const startLocked = () => {
    state.mode = "locked";
    state.candles = [];
    state.trades = [];
    state.historyLoaded = false;
    state.viewOffset = 0;
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    updateSelectionUi();
    updateAuthUi();
    elements.mode.classList.remove("is-live");
    elements.mode.innerHTML = "<i></i> Public chart unavailable";
    elements.healthMode.textContent = "Configuration needed";
    elements.healthPublic.textContent = "Unavailable";
    elements.healthPublic.className = "";
    elements.notice.textContent = "Add the Supabase Publishable Key to pipeline-config.js. Never use the Supabase Secret Key in a public website.";
    elements.lag.textContent = "—";
    elements.lagLabel.textContent = "publishable key required";
    setStatus("Supabase browser configuration is incomplete", "locked");
    renderTradesTable();
    resizeCanvas();
  };

  const mergeTailPreservingView = (rows) => {
    const lastTime = state.candles.length ? state.candles[state.candles.length - 1].time : -Infinity;
    const incoming = rows.map(core.normalizeCandle).filter(Boolean);
    const newerCount = incoming.filter((candle) => candle.time > lastTime).length;
    state.candles = core.mergeCandles(state.candles, incoming, maxHistory());
    if (!state.autoFollow) state.viewOffset += newerCount;
  };

  const loadOlder = async () => {
    if (!hasChartAccess() || state.loadingOlder || !state.hasOlder || !state.candles.length) return;
    const requestInstrument = state.activeInstrumentId;
    const requestTimeframe = state.activeTimeframe;
    const beforeTime = state.candles[0].time;
    state.loadingOlder = true;
    updateSelectionUi();
    try {
      const rows = await supabaseRpc(chartRpcName("page"), {
        p_instrument_id: requestInstrument,
        p_timeframe: requestTimeframe,
        p_before: new Date(beforeTime).toISOString(),
        p_limit: pageSize(),
      });
      if (requestInstrument !== state.activeInstrumentId || requestTimeframe !== state.activeTimeframe) return;
      const previousFirst = state.candles[0].time;
      state.candles = core.mergeCandles(rows, state.candles, maxHistory());
      state.hasOlder = rows.length >= pageSize() && state.candles[0].time < previousFirst;
      drawChart();
    } catch (error) {
      elements.updated.textContent = error.message;
    } finally {
      state.loadingOlder = false;
      updateSelectionUi();
    }
  };

  const loadLiveData = async ({ reset = false } = {}) => {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.candles = [];
      state.trades = [];
      state.historyLoaded = false;
      state.hasOlder = true;
      state.hoverIndex = null;
      setFollow(true);
      drawChart();
    }
    const requestInstrument = state.activeInstrumentId;
    const requestTimeframe = state.activeTimeframe;
    const startedAt = performance.now();
    setStatus("Refreshing market history", "live");
    try {
      if (!state.historyLoaded) {
        const history = await supabaseRpc(chartRpcName("page"), {
          p_instrument_id: requestInstrument,
          p_timeframe: requestTimeframe,
          p_before: null,
          p_limit: pageSize(),
        });
        if (requestInstrument !== state.activeInstrumentId || requestTimeframe !== state.activeTimeframe) return;
        state.candles = core.mergeCandles([], history, maxHistory());
        state.historyLoaded = true;
        state.hasOlder = history.length >= pageSize();
      }
      const tail = await supabaseRpc(chartRpcName("tail"), {
        p_instrument_id: requestInstrument,
        p_timeframe: requestTimeframe,
      });
      if (requestInstrument !== state.activeInstrumentId || requestTimeframe !== state.activeTimeframe) return;
      mergeTailPreservingView(tail);

      const instrument = activeInstrument();
      const privateAdmin = state.accessMode === "admin";
      elements.mode.classList.add("is-live");
      elements.mode.innerHTML = state.activeTimeframe === "5m"
        ? `<i></i> ${privateAdmin ? "Private admin" : "Live-forming"} 5m · ${Math.round((Number(config.refreshMs) || 10000) / 1000)}s`
        : `<i></i> ${privateAdmin ? "Private admin" : "Stored"} ${timeframe().label}`;
      elements.healthMode.textContent = "Live";
      elements.healthPublic.textContent = privateAdmin ? "Private" : "Approved";
      elements.healthPublic.className = "health-good";
      elements.notice.textContent = privateAdmin
        ? `${instrument.symbolName} is visible through an authenticated administrator session. Public visitors receive no market-data rows.`
        : `${instrument.symbolName} displays approved OHLCV fields only. Order flow, order book, features, and credentials remain private.`;
      const latest = state.candles[state.candles.length - 1];
      const dataAge = latest && latest.collectedAt
        ? Date.now() - latest.collectedAt
        : Number.POSITIVE_INFINITY;
      const fresh = state.activeTimeframe !== "5m"
        || dataAge <= Math.max(30000, Number(config.staleAfterMs) || 120000);
      const message = !state.candles.length
        ? "Connected · no released bars yet"
        : fresh
          ? `${timeframe().label} chart ready`
          : "Market closed · showing latest stored candle";
      setStatus(message, fresh ? "live" : "stale");
      updateMetrics(Math.round(performance.now() - startedAt));
      renderTradesTable();
      updateSelectionUi();
      drawChart();
    } catch (error) {
      elements.status.textContent = "Market history unavailable";
      elements.updated.textContent = error.message;
      elements.dot.classList.remove("is-live");
    } finally {
      state.loading = false;
    }
  };

  const startDemo = () => {
    if (demoTimer) window.clearInterval(demoTimer);
    state.mode = "demo";
    const spacing = timeframe().minutes * 60_000;
    const generated = core.generateDemoCandles({ count: 300, startPrice: 10000, seed: 4043 });
    const end = Date.now();
    state.candles = generated.map((candle, index) => ({
      ...candle,
      time: end - (generated.length - 1 - index) * spacing,
    }));
    state.historyLoaded = true;
    state.hasOlder = false;
    setFollow(true);
    updateSelectionUi();
    elements.symbolOverline.textContent = "DEMO · NOT MARKET DATA";
    elements.mode.innerHTML = `<i></i> Synthetic demo · ${timeframe().label}`;
    elements.healthMode.textContent = "Demo";
    elements.healthPublic.textContent = "Locked";
    setStatus("Synthetic chart preview", "demo");
    updateMetrics();
    renderTradesTable();
    resizeCanvas();
    demoTimer = window.setInterval(() => {
      const previous = state.candles[state.candles.length - 1];
      const next = core.nextDemoCandle(previous, previous.time / 60_000 + 4043);
      next.time = previous.time + spacing;
      state.candles = core.mergeCandles(state.candles, [next], maxHistory());
      updateMetrics();
      drawChart();
    }, Math.max(2000, Number(config.demoTickMs) || 4500));
  };

  const resetForSelection = () => {
    updateSelectionUi();
    if (hasChartAccess()) loadLiveData({ reset: true });
    else startLocked();
  };

  symbolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const instrumentId = button.dataset.instrumentId;
      if (!instrumentsById.has(instrumentId) || instrumentId === state.activeInstrumentId) return;
      state.activeInstrumentId = instrumentId;
      resetForSelection();
    });
  });

  timeframeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const requested = button.dataset.timeframe;
      if (!TIMEFRAMES[requested] || requested === state.activeTimeframe) return;
      state.activeTimeframe = requested;
      resetForSelection();
    });
  });

  if (elements.adminForm) {
    elements.adminForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!adminAuth || !isSupabaseConfigurationValid()) {
        setAuthStatus("Supabase browser settings are incomplete.", "error");
        return;
      }
      const email = String(elements.adminEmail?.value || "").trim();
      const password = String(elements.adminPassword?.value || "");
      if (!email || !password) return;

      elements.adminSubmit.disabled = true;
      elements.adminSubmit.textContent = "Checking access…";
      setAuthStatus("Authenticating administrator…");
      try {
        state.authSession = await adminAuth.signIn(email, password);
        state.accessMode = "admin";
        await verifyAdminAccess();
        if (elements.adminPassword) elements.adminPassword.value = "";
        updateAuthUi();
        state.mode = "live";
        await loadLiveData({ reset: true });
        startRefreshLoop();
      } catch (error) {
        await adminAuth.signOut();
        state.authSession = null;
        state.accessMode = "none";
        startLocked();
        setAuthStatus(error.message || "Administrator sign-in failed.", "error");
      } finally {
        if (elements.adminPassword) elements.adminPassword.value = "";
        elements.adminSubmit.disabled = false;
        elements.adminSubmit.textContent = "Unlock private chart";
      }
    });
  }

  if (elements.adminSignOut) {
    elements.adminSignOut.addEventListener("click", async () => {
      await adminAuth?.signOut();
      state.authSession = null;
      state.accessMode = "none";
      setAuthStatus("Signed out. Administrator authentication required.");
      if (config.publicLiveDataApproved === true && isSupabaseConfigurationValid()) {
        state.mode = "live";
        await loadLiveData({ reset: true });
        startRefreshLoop();
      } else {
        startLocked();
      }
    });
  }

  followButton.addEventListener("click", () => {
    setFollow(!state.autoFollow);
    drawChart();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!state.candles.length) return;
    setFollow(false);
    state.hoverIndex = null;
    state.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: state.viewOffset,
    };
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
    drawChart();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (state.drag && state.drag.pointerId === event.pointerId) {
      const plotWidth = Math.max(10, wrapper.clientWidth - 14 - 76);
      state.viewOffset = core.panOffset({
        startOffset: state.drag.startOffset,
        deltaPixels: event.clientX - state.drag.startX,
        candlePixelWidth: plotWidth / capacity(),
        maxOffset: Math.max(0, state.candles.length - 1),
      });
      const view = visibleWindow();
      if (view.startIndex <= 20) loadOlder();
      drawChart();
      return;
    }
    const candles = visibleWindow().candles;
    if (!candles.length) return;
    const bounds = canvas.getBoundingClientRect();
    const plotWidth = Math.max(10, wrapper.clientWidth - 14 - 76);
    const x = Math.min(plotWidth, Math.max(0, event.clientX - bounds.left - 14));
    state.hoverIndex = Math.min(candles.length - 1, Math.floor(x / (plotWidth / candles.length)));
    drawChart();
  });

  const finishDrag = (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    state.drag = null;
    canvas.classList.remove("is-dragging");
    drawChart();
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("pointerleave", () => {
    if (!state.drag) {
      state.hoverIndex = null;
      drawChart();
    }
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(scheduleCanvasResize);
    resizeObserver.observe(wrapper);
  } else {
    window.addEventListener("resize", scheduleCanvasResize);
  }

  window.addEventListener("site-theme-change", () => {
    colors = readChartColors();
    scheduleCanvasResize();
  });

  const bootstrap = async () => {
    updateSelectionUi();
    if (isSupabaseConfigurationValid()) {
      state.mode = "live";
      await loadLiveData();
      startRefreshLoop();
    } else {
      startLocked();
    }
  };

  bootstrap();
})();
