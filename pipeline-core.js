(function exposePipelineCore(globalScope) {
  "use strict";

  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeCandle = (row) => {
    const timeValue = row.bar_time ?? row.time;
    const time = typeof timeValue === "number" ? timeValue : Date.parse(timeValue);
    const candle = {
      symbol: String(row.symbol ?? ""),
      time,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume) ?? 0,
      collectedAt: row.collected_at ? Date.parse(row.collected_at) : null,
    };

    const valid = Number.isFinite(candle.time)
      && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high)
      && candle.volume >= 0;

    return valid ? candle : null;
  };

  const mergeCandles = (existing, incoming, maxCandles = 120) => {
    const byTime = new Map();
    [...existing, ...incoming]
      .map(normalizeCandle)
      .filter(Boolean)
      .forEach((candle) => byTime.set(candle.time, candle));

    return [...byTime.values()]
      .sort((left, right) => left.time - right.time)
      .slice(-Math.max(1, maxCandles));
  };

  const seededRandom = (seed) => {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  const roundToTick = (value, tick = 100) => Math.round(value / tick) * tick;

  const generateDemoCandles = ({ count = 86, startPrice = 72400, seed = 4043 } = {}) => {
    const random = seededRandom(seed);
    const now = new Date();
    now.setSeconds(0, 0);
    const start = now.getTime() - (count - 1) * 60_000;
    let previousClose = startPrice;

    return Array.from({ length: count }, (_, index) => {
      const drift = 18 + Math.sin(index / 8) * 28;
      const shock = (random() - 0.48) * 260;
      const open = roundToTick(previousClose);
      const close = roundToTick(Math.max(100, open + drift + shock));
      const high = roundToTick(Math.max(open, close) + 100 + random() * 180);
      const low = roundToTick(Math.min(open, close) - 100 - random() * 180);
      const volume = Math.round(18000 + random() * 72000 + Math.abs(close - open) * 65);
      previousClose = close;
      return { symbol: "005930", time: start + index * 60_000, open, high, low, close, volume };
    });
  };

  const nextDemoCandle = (previous, seed = Date.now()) => {
    const random = seededRandom(seed);
    const open = previous.close;
    const close = roundToTick(Math.max(100, open + (random() - 0.47) * 340));
    const high = roundToTick(Math.max(open, close) + 100 + random() * 160);
    const low = roundToTick(Math.min(open, close) - 100 - random() * 160);
    return {
      symbol: previous.symbol,
      time: previous.time + 60_000,
      open,
      high,
      low,
      close,
      volume: Math.round(20000 + random() * 82000),
    };
  };

  const percentChange = (first, last) => {
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return 0;
    return ((last - first) / first) * 100;
  };

  const api = {
    generateDemoCandles,
    mergeCandles,
    nextDemoCandle,
    normalizeCandle,
    percentChange,
  };

  globalScope.PipelineCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
