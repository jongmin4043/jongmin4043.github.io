(function initializePublicMarketDashboard() {
  "use strict";

  const config = window.PIPELINE_CONFIG || {};
  const host = document.getElementById("market-chart-host");
  if (!host) return;

  const symbolButtons = [...document.querySelectorAll("[data-instrument-id]")];
  const timeframeButtons = [...document.querySelectorAll("[data-timeframe]")];
  const elements = {
    name: document.getElementById("pipeline-symbol-name"),
    overline: document.getElementById("pipeline-symbol-overline"),
    mark: document.getElementById("pipeline-symbol-mark"),
    timezone: document.getElementById("metric-timezone"),
    status: document.getElementById("stream-status"),
    updated: document.getElementById("stream-updated"),
  };

  const providerSymbols = Object.freeze({
    "KRX:005930": "KRX:005930",
    "KRX:000660": "KRX:000660",
    "NASDAQ:QQQ": "NASDAQ:QQQ",
    "NYSEARCA:VOO": "AMEX:VOO",
  });
  const timeframeIntervals = Object.freeze({ "5m": "5", "120m": "120", "1d": "D" });
  const fallbackInstruments = [
    { instrumentId: "KRX:005930", symbol: "005930", symbolName: "Samsung Electronics", market: "KRX", mark: "SE", timeZone: "Asia/Seoul" },
    { instrumentId: "KRX:000660", symbol: "000660", symbolName: "SK hynix", market: "KRX", mark: "SH", timeZone: "Asia/Seoul" },
    { instrumentId: "NASDAQ:QQQ", symbol: "QQQ", symbolName: "Invesco QQQ Trust", market: "NASDAQ", mark: "QQ", timeZone: "America/New_York" },
    { instrumentId: "NYSEARCA:VOO", symbol: "VOO", symbolName: "Vanguard S&P 500 ETF", market: "NYSE American", mark: "VO", timeZone: "America/New_York" },
  ];
  const configured = Array.isArray(config.instruments) && config.instruments.length
    ? config.instruments
    : fallbackInstruments;
  const instruments = configured.map((instrument) => ({
    ...instrument,
    tvSymbol: providerSymbols[instrument.instrumentId] || instrument.instrumentId,
  }));
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.instrumentId, instrument]));
  const state = {
    instrumentId: instrumentsById.has("KRX:005930") ? "KRX:005930" : instruments[0].instrumentId,
    timeframe: "5m",
  };

  const activeInstrument = () => instrumentsById.get(state.instrumentId) || instruments[0];
  const providerLink = (symbol) => `https://www.tradingview.com/symbols/${encodeURIComponent(symbol.replace(":", "-"))}/`;

  const updateControls = () => {
    const instrument = activeInstrument();
    elements.name.textContent = instrument.symbolName;
    elements.overline.textContent = `${instrument.market} · ${instrument.symbol}`;
    elements.mark.textContent = instrument.mark || instrument.symbol.slice(-2);
    elements.timezone.textContent = instrument.timeZone;
    symbolButtons.forEach((button) => {
      const selected = button.dataset.instrumentId === state.instrumentId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    timeframeButtons.forEach((button) => {
      const selected = button.dataset.timeframe === state.timeframe;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };

  const renderWidget = () => {
    const instrument = activeInstrument();
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "calc(100% - 28px)";
    widget.style.width = "100%";

    const credit = document.createElement("div");
    credit.className = "tradingview-widget-copyright";
    const creditLink = document.createElement("a");
    creditLink.href = providerLink(instrument.tvSymbol);
    creditLink.rel = "noopener nofollow";
    creditLink.target = "_blank";
    creditLink.textContent = `${instrument.symbol} chart by TradingView`;
    credit.appendChild(creditLink);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: instrument.tvSymbol,
      interval: timeframeIntervals[state.timeframe],
      timezone: "exchange",
      theme: "dark",
      backgroundColor: "rgba(10, 13, 19, 1)",
      gridColor: "rgba(255, 255, 255, 0.06)",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      details: true,
      hotlist: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.addEventListener("load", () => {
      elements.status.textContent = `${instrument.symbol} public chart ready`;
      elements.updated.textContent = "Data level is identified by the provider";
    });
    script.addEventListener("error", () => {
      elements.status.textContent = "Chart provider could not be loaded";
      elements.updated.textContent = "Check content blockers or network settings";
    });

    container.append(widget, credit, script);
    host.replaceChildren(container);
    elements.status.textContent = `Loading ${instrument.symbol} chart`;
    elements.updated.textContent = "No sign-in required";
  };

  symbolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const instrumentId = button.dataset.instrumentId;
      if (!instrumentsById.has(instrumentId) || instrumentId === state.instrumentId) return;
      state.instrumentId = instrumentId;
      updateControls();
      renderWidget();
    });
  });
  timeframeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const timeframe = button.dataset.timeframe;
      if (!timeframeIntervals[timeframe] || timeframe === state.timeframe) return;
      state.timeframe = timeframe;
      updateControls();
      renderWidget();
    });
  });

  updateControls();
  renderWidget();
})();
