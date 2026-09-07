(function initializeTradingViewMarketDashboard() {
  "use strict";

  const config = window.PIPELINE_CONFIG || {};
  const frame = document.getElementById("market-chart-frame");
  const tabs = document.querySelector(".pipeline-symbol-tabs");
  if (!frame || !tabs) return;

  const buttons = [...tabs.querySelectorAll("button[data-instrument-id]")];
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
  const fallbackInstruments = [
    { instrumentId: "KRX:005930", symbol: "005930", symbolName: "Samsung Electronics", market: "KRX", mark: "SE", timeZone: "Asia/Seoul" },
    { instrumentId: "KRX:000660", symbol: "000660", symbolName: "SK hynix", market: "KRX", mark: "SH", timeZone: "Asia/Seoul" },
    { instrumentId: "NASDAQ:QQQ", symbol: "QQQ", symbolName: "Invesco QQQ Trust", market: "NASDAQ", mark: "QQ", timeZone: "America/New_York" },
    { instrumentId: "NYSEARCA:VOO", symbol: "VOO", symbolName: "Vanguard S&P 500 ETF", market: "NYSE Arca", mark: "VO", timeZone: "America/New_York" },
  ];
  const configuredInstruments = Array.isArray(config.instruments) && config.instruments.length
    ? config.instruments
    : fallbackInstruments;
  const instruments = configuredInstruments.map((instrument) => ({
    ...instrument,
    tvSymbol: providerSymbols[instrument.instrumentId] || instrument.instrumentId,
  }));
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.instrumentId, instrument]));
  const requestedInstrumentId = new URLSearchParams(window.location.search).get("instrument");
  let activeInstrumentId = instrumentsById.has(requestedInstrumentId)
    ? requestedInstrumentId
    : instrumentsById.has("KRX:005930")
      ? "KRX:005930"
      : instruments[0].instrumentId;

  const activeInstrument = () => instrumentsById.get(activeInstrumentId) || instruments[0];
  const activeTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";

  const buildWidgetUrl = (instrument) => {
    const light = activeTheme() === "light";
    const params = new URLSearchParams({
      frameElementId: "market-chart-frame",
      symbol: instrument.tvSymbol,
      interval: "5",
      hidesidetoolbar: "0",
      symboledit: "0",
      saveimage: "1",
      toolbarbg: light ? "#f5f7fb" : "#0a0d13",
      studies: "[]",
      theme: light ? "light" : "dark",
      style: "1",
      timezone: "exchange",
      withdateranges: "1",
      hideideas: "1",
      locale: "en",
      enablepublishing: "0",
      allow_symbol_change: "0",
      support_host: "https://www.tradingview.com",
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  };

  const updateHeader = () => {
    const instrument = activeInstrument();
    elements.name.textContent = instrument.symbolName;
    elements.overline.textContent = `${instrument.market} · ${instrument.symbol}`;
    elements.mark.textContent = instrument.mark || instrument.symbol.slice(-2);
    elements.timezone.textContent = instrument.timeZone;
    buttons.forEach((button) => {
      const selected = button.dataset.instrumentId === activeInstrumentId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };

  const loadInstrument = (instrumentId, { force = false } = {}) => {
    if (!instrumentsById.has(instrumentId)) return;
    if (!force && instrumentId === activeInstrumentId && frame.src) return;

    activeInstrumentId = instrumentId;
    const instrument = activeInstrument();
    updateHeader();
    elements.status.textContent = `Loading ${instrument.symbol} chart`;
    elements.updated.textContent = `Requested ${instrument.tvSymbol} · 5m default`;
    frame.title = `${instrument.symbolName} interactive market chart`;
    frame.src = buildWidgetUrl(instrument);

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("instrument", instrument.instrumentId);
    currentUrl.hash = "market-dashboard";
    window.history.replaceState(null, "", currentUrl);
  };

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-instrument-id]");
    if (!button || !tabs.contains(button)) return;
    loadInstrument(button.dataset.instrumentId, { force: true });
  });

  frame.addEventListener("load", () => {
    const instrument = activeInstrument();
    elements.status.textContent = `${instrument.symbol} chart ready`;
    elements.updated.textContent = "Data timing and availability are identified by TradingView";
  });

  window.addEventListener("site-theme-change", () => {
    loadInstrument(activeInstrumentId, { force: true });
  });

  updateHeader();
  loadInstrument(activeInstrumentId, { force: true });
})();
