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
  const elements = {
    mode: document.getElementById("pipeline-mode"),
    price: document.getElementById("metric-price"),
    change: document.getElementById("metric-change"),
    volume: document.getElementById("metric-volume"),
    time: document.getElementById("metric-time"),
    lag: document.getElementById("metric-lag"),
    lagLabel: document.getElementById("metric-lag-label"),
    status: document.getElementById("stream-status"),
    updated: document.getElementById("stream-updated"),
    dot: document.getElementById("stream-dot"),
    healthMode: document.getElementById("health-mode"),
    healthPublic: document.getElementById("health-public"),
    notice: document.getElementById("pipeline-notice-copy"),
    trades: document.getElementById("paper-trades-body"),
    symbolOverline: document.getElementById("pipeline-symbol-overline"),
    symbolName: document.getElementById("pipeline-symbol-name"),
  };

  const intervalMinutes = Math.max(1, Math.floor(Number(config.chartIntervalMinutes) || 5));
  const intervalMs = intervalMinutes * 60_000;
  const instruments = Array.isArray(config.instruments) && config.instruments.length
    ? config.instruments
    : [{
      instrumentId: "KRX:005930",
      symbol: "005930",
      symbolName: "Samsung Electronics",
      market: "KRX",
      mark: "SE",
    }];
  const instrumentsById = new Map(instruments.map((item) => [item.instrumentId, item]));

  const state = {
    candles: [],
    trades: [],
    mode: "demo",
    autoFollow: true,
    frozenEndTime: null,
    hoverIndex: null,
    requestStartedAt: null,
    activeInstrumentId: instruments[0].instrumentId,
    historyLoaded: false,
    loading: false,
  };

  let resizeFrame = null;
  let canvasPixelWidth = 0;
  let canvasPixelHeight = 0;

  const colors = {
    text: "rgba(244, 242, 239, .9)",
    muted: "rgba(148, 151, 161, .78)",
    grid: "rgba(255, 255, 255, .065)",
    up: "#42e8bd",
    down: "#ff7187",
    violet: "#876cff",
    amber: "#f5c86b",
    crosshair: "rgba(255, 255, 255, .24)",
  };

  const priceFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sessionDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const isLiveConfigurationValid = () => config.mode === "live"
    && config.publicLiveDataApproved === true
    && /^https:\/\//.test(config.supabaseUrl || "")
    && /^sb_publishable_/.test(config.supabasePublishableKey || "");

  const activeInstrument = () => instrumentsById.get(state.activeInstrumentId)
    || instruments[0];

  const updateInstrumentHeading = () => {
    const instrument = activeInstrument();
    elements.symbolOverline.textContent = `${instrument.market} · ${instrument.symbol}`;
    elements.symbolName.textContent = instrument.symbolName;
    const mark = document.querySelector(".pipeline-symbol-mark");
    if (mark) mark.textContent = instrument.mark || instrument.symbol.slice(-2);
    symbolButtons.forEach((button) => {
      const selected = button.dataset.instrumentId === state.activeInstrumentId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };

  const visibleCandles = () => {
    const rawSource = state.autoFollow || !state.frozenEndTime
      ? state.candles
      : state.candles.filter((candle) => candle.time <= state.frozenEndTime);
    const source = core.aggregateCandles(rawSource, intervalMinutes);
    const width = Math.max(wrapper.clientWidth, 320);
    const capacity = Math.max(26, Math.floor((width - 94) / 9));
    return source.slice(-capacity);
  };

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

  const drawMarker = (trade, candle, x, candleWidth, yForPrice, top, priceBottom) => {
    const side = String(trade.side || "").toUpperCase();
    const isBuy = side === "BUY";
    const y = Math.min(priceBottom - 14, Math.max(top + 14, yForPrice(Number(trade.price || candle.close))));
    const markerY = isBuy ? y + 18 : y - 18;
    const size = Math.max(4, Math.min(6, candleWidth * 0.55));

    context.save();
    context.translate(x, markerY);
    context.rotate(Math.PI / 4);
    context.fillStyle = isBuy ? colors.violet : "rgba(245, 200, 107, .16)";
    context.strokeStyle = isBuy ? colors.violet : colors.amber;
    context.lineWidth = 1;
    context.beginPath();
    context.rect(-size, -size, size * 2, size * 2);
    context.fill();
    context.stroke();
    context.restore();
  };

  function drawChart() {
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    context.clearRect(0, 0, width, height);

    const candles = visibleCandles();
    if (!candles.length) {
      const emptyMessage = state.mode === "locked"
        ? "LIVE MARKET FEED LOCKED"
        : "WAITING FOR THE FIRST MARKET CANDLE";
      drawText(emptyMessage, width / 2, height / 2, "center");
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
    const priceRange = Math.max(1, maxPrice - minPrice);
    minPrice -= priceRange * 0.08;
    maxPrice += priceRange * 0.08;
    const yForPrice = (price) => top + ((maxPrice - price) / (maxPrice - minPrice)) * (priceBottom - top);
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
      const value = maxPrice - ((maxPrice - minPrice) / 4) * index;
      drawText(priceFormatter.format(Math.round(value)), width - right + 10, y, "left");
    }

    [0, Math.floor((candles.length - 1) / 2), candles.length - 1].forEach((index) => {
      if (index < 0) return;
      const x = left + candleWidth * index + candleWidth / 2;
      context.strokeStyle = colors.grid;
      context.beginPath();
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, height - bottom);
      context.stroke();
      drawText(timeFormatter.format(new Date(candles[index].time)), x, height - 13, "center");
    });

    candles.forEach((candle, index) => {
      const x = left + candleWidth * index + candleWidth / 2;
      const up = candle.close >= candle.open;
      const color = up ? colors.up : colors.down;
      const openY = yForPrice(candle.open);
      const closeY = yForPrice(candle.close);
      const highY = yForPrice(candle.high);
      const lowY = yForPrice(candle.low);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));

      context.strokeStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + 0.5, highY);
      context.lineTo(x + 0.5, lowY);
      context.stroke();
      context.fillStyle = color;
      context.globalAlpha = candle.isComplete ? 1 : 0.68;
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      if (!candle.isComplete) {
        context.globalAlpha = 1;
        context.strokeStyle = color;
        context.strokeRect(x - bodyWidth / 2 - 1, bodyTop - 1, bodyWidth + 2, bodyHeight + 2);
      }

      const barHeight = (candle.volume / maxVolume) * volumeHeight;
      context.globalAlpha = 0.34;
      context.fillRect(x - bodyWidth / 2, volumeTop + volumeHeight - barHeight, bodyWidth, barHeight);
      context.globalAlpha = 1;

      state.trades
        .filter((trade) => Number(trade.time) >= candle.time && Number(trade.time) < candle.time + intervalMs)
        .forEach((trade) => drawMarker(trade, candle, x, candleWidth, yForPrice, top, priceBottom));
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

    if (state.hoverIndex !== null && candles[state.hoverIndex]) {
      const hovered = candles[state.hoverIndex];
      const x = left + candleWidth * state.hoverIndex + candleWidth / 2;
      context.strokeStyle = colors.crosshair;
      context.beginPath();
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, height - bottom);
      context.stroke();
      const candleState = hovered.isComplete ? "CLOSED" : "FORMING";
      tooltip.textContent = `${intervalMinutes}m ${candleState} · ${dateTimeFormatter.format(new Date(hovered.time))}  O ${priceFormatter.format(hovered.open)}  H ${priceFormatter.format(hovered.high)}  L ${priceFormatter.format(hovered.low)}  C ${priceFormatter.format(hovered.close)}  V ${compactFormatter.format(hovered.volume)}`;
      tooltip.classList.add("is-visible");
    } else {
      tooltip.classList.remove("is-visible");
    }
  }

  const updateMetrics = (requestDuration = null) => {
    const candles = core.aggregateCandles(state.candles, intervalMinutes);
    if (!candles.length) return;
    const latest = candles[candles.length - 1];
    const rawLatest = state.candles[state.candles.length - 1];
    const latestSessionDate = sessionDateFormatter.format(new Date(latest.time));
    const sessionCandles = candles.filter(
      (candle) => sessionDateFormatter.format(new Date(candle.time)) === latestSessionDate,
    );
    const first = sessionCandles[0] || candles[0];
    const change = latest.close - first.open;
    const percent = core.percentChange(first.open, latest.close);
    const sessionVolume = sessionCandles.reduce((sum, candle) => sum + candle.volume, 0);
    const changeClass = change >= 0 ? "is-up" : "is-down";
    const sign = change >= 0 ? "+" : "";

    elements.price.textContent = priceFormatter.format(latest.close);
    elements.change.textContent = `${sign}${priceFormatter.format(change)}  ${sign}${percent.toFixed(2)}%`;
    elements.change.className = changeClass;
    elements.volume.textContent = compactFormatter.format(sessionVolume);
    elements.time.textContent = timeFormatter.format(new Date(latest.time));

    if (state.mode === "demo") {
      elements.lag.textContent = "SIM";
      elements.lagLabel.textContent = "accelerated";
    } else {
      const collectedAt = rawLatest.collectedAt || Date.now();
      const lagSeconds = Math.max(0, Math.round((Date.now() - collectedAt) / 1000));
      elements.lag.textContent = `${lagSeconds}s`;
      elements.lagLabel.textContent = requestDuration === null ? "data age" : `${requestDuration}ms API`;
    }
  };

  const renderTradesTable = () => {
    if (!state.trades.length) {
      elements.trades.innerHTML = '<tr class="pipeline-empty-row"><td colspan="5">No paper trades recorded yet.</td></tr>';
      return;
    }

    elements.trades.innerHTML = state.trades.slice(-5).reverse().map((trade) => {
      const side = String(trade.side).toUpperCase();
      const sideClass = side === "BUY" ? "trade-buy" : "trade-sell";
      return `<tr>
        <td>${timeFormatter.format(new Date(Number(trade.time)))}</td>
        <td class="${sideClass}">${escapeHtml(side)}</td>
        <td>${priceFormatter.format(Number(trade.price))}</td>
        <td>${priceFormatter.format(Number(trade.quantity || 0))}</td>
        <td>${escapeHtml(trade.strategy || "paper_demo")}</td>
      </tr>`;
    }).join("");
  };

  const setStatus = (message, kind = "demo") => {
    elements.status.textContent = message;
    elements.dot.classList.toggle("is-live", kind === "live");
    elements.updated.textContent = `Updated ${timeFormatter.format(new Date())} KST`;
  };

  const startDemo = () => {
    state.mode = "demo";
    state.candles = core.generateDemoCandles({ count: 240, startPrice: 10000, seed: 4043 });
    state.trades = [
      { time: state.candles[76].time, side: "BUY", price: state.candles[76].close, quantity: 10, strategy: "demo_alpha" },
      { time: state.candles[176].time, side: "SELL", price: state.candles[176].close, quantity: 10, strategy: "demo_alpha" },
    ];
    elements.symbolOverline.textContent = "DEMO · NOT MARKET DATA";
    elements.symbolName.textContent = `Synthetic ${intervalMinutes}-minute preview`;
    elements.mode.innerHTML = `<i></i> Synthetic demo · ${intervalMinutes}m`;
    elements.healthMode.textContent = "Demo";
    elements.healthPublic.textContent = "Locked";
    setStatus(`Synthetic 1m source aggregated to ${intervalMinutes}m`, "demo");
    updateMetrics();
    renderTradesTable();
    resizeCanvas();

    window.setInterval(() => {
      const previous = state.candles[state.candles.length - 1];
      const next = core.nextDemoCandle(previous, previous.time / 60_000 + 4043);
      state.candles = core.mergeCandles(state.candles, [next], Number(config.maxCandles) || 300);
      if (state.autoFollow) state.frozenEndTime = null;
      setStatus("Demo candle appended", "demo");
      updateMetrics();
      drawChart();
    }, Math.max(2000, Number(config.demoTickMs) || 4500));
  };

  const supabaseRpc = async (functionName, payload) => {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Public data API returned ${response.status}`);
    return response.json();
  };

  const startLocked = () => {
    state.mode = "locked";
    state.candles = [];
    state.trades = [];
    updateInstrumentHeading();
    elements.mode.classList.remove("is-live");
    elements.mode.innerHTML = "<i></i> Public feed locked";
    elements.healthMode.textContent = "Ready";
    elements.healthPublic.textContent = "Locked";
    elements.healthPublic.className = "";
    elements.notice.textContent = "The live chart path is installed but remains locked until the first collection run is validated and redistribution permission is documented.";
    elements.lag.textContent = "—";
    elements.lagLabel.textContent = "not released";
    setStatus("Live chart awaiting release approval", "locked");
    renderTradesTable();
    resizeCanvas();
  };

  const loadLiveData = async ({ reset = false } = {}) => {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.candles = [];
      state.trades = [];
      state.historyLoaded = false;
      state.frozenEndTime = null;
      state.hoverIndex = null;
      drawChart();
    }
    const startedAt = performance.now();
    setStatus("Refreshing market state", "live");
    try {
      if (!state.historyLoaded) {
        const history = await supabaseRpc("get_public_chart_history", {
          p_instrument_id: state.activeInstrumentId,
          p_limit: Number(config.maxCandles) || 300,
        });
        state.candles = core.mergeCandles([], history, Number(config.maxCandles) || 300);
        state.historyLoaded = true;
      }

      const tail = await supabaseRpc("get_public_chart_tail", {
        p_instrument_id: state.activeInstrumentId,
      });
      state.candles = core.mergeCandles(
        state.candles,
        tail,
        Number(config.maxCandles) || 300,
      );

      const instrument = activeInstrument();
      elements.mode.classList.add("is-live");
      updateInstrumentHeading();
      elements.mode.innerHTML = `<i></i> Live-forming ${intervalMinutes}m · ${Math.round((Number(config.refreshMs) || 10000) / 1000)}s`;
      elements.healthMode.textContent = "Live";
      elements.healthPublic.textContent = "Approved";
      elements.healthPublic.className = "health-good";
      elements.notice.textContent = `${instrument.symbolName} displays approved chart-only fields. Order flow, order book, features, and credentials remain private.`;

      const latest = state.candles[state.candles.length - 1];
      const dataAge = latest && latest.collectedAt
        ? Date.now() - latest.collectedAt
        : Number.POSITIVE_INFINITY;
      const fresh = dataAge <= Math.max(30000, Number(config.staleAfterMs) || 120000);
      const status = !state.candles.length
        ? "Connected · waiting for the first candle"
        : fresh
          ? "Live market feed"
          : "Market closed · showing latest stored candle";
      setStatus(status, fresh ? "live" : "stale");
      updateMetrics(Math.round(performance.now() - startedAt));
      renderTradesTable();
      drawChart();
    } catch (error) {
      elements.status.textContent = "Live feed unavailable";
      elements.updated.textContent = error.message;
      elements.dot.classList.remove("is-live");
    } finally {
      state.loading = false;
    }
  };

  symbolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const instrumentId = button.dataset.instrumentId;
      if (!instrumentsById.has(instrumentId) || instrumentId === state.activeInstrumentId) return;
      state.activeInstrumentId = instrumentId;
      updateInstrumentHeading();
      if (isLiveConfigurationValid()) loadLiveData({ reset: true });
      else startLocked();
    });
  });

  followButton.addEventListener("click", () => {
    state.autoFollow = !state.autoFollow;
    if (state.autoFollow) state.frozenEndTime = null;
    else state.frozenEndTime = state.candles.length
      ? state.candles[state.candles.length - 1].time
      : null;
    followButton.classList.toggle("is-active", state.autoFollow);
    followButton.setAttribute("aria-pressed", String(state.autoFollow));
    drawChart();
  });

  canvas.addEventListener("mousemove", (event) => {
    const candles = visibleCandles();
    if (!candles.length) return;
    const plotWidth = Math.max(10, wrapper.clientWidth - 14 - 76);
    const x = Math.min(plotWidth, Math.max(0, event.offsetX - 14));
    state.hoverIndex = Math.min(candles.length - 1, Math.floor(x / (plotWidth / candles.length)));
    drawChart();
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverIndex = null;
    drawChart();
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(scheduleCanvasResize);
    resizeObserver.observe(wrapper);
  } else {
    window.addEventListener("resize", scheduleCanvasResize);
  }

  if (isLiveConfigurationValid()) {
    state.mode = "live";
    updateInstrumentHeading();
    loadLiveData();
    window.setInterval(
      loadLiveData,
      Math.max(5000, Number(config.refreshMs) || 10000),
    );
  } else if (config.mode === "live") {
    startLocked();
  } else {
    startDemo();
  }
})();
