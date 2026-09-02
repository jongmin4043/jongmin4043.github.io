"use strict";

const assert = require("node:assert/strict");
const core = require("../pipeline-core.js");

const candles = core.generateDemoCandles({ count: 12, startPrice: 72000, seed: 4043 });
assert.equal(candles.length, 12);
assert.ok(candles.every((candle) => candle.high >= Math.max(candle.open, candle.close)));
assert.ok(candles.every((candle) => candle.low <= Math.min(candle.open, candle.close)));

const replacement = { ...candles[11], close: candles[11].close + 100 };
const merged = core.mergeCandles(candles, [replacement], 12);
assert.equal(merged.length, 12, "duplicate timestamps must be upserted, not appended");
assert.equal(merged[11].close, replacement.close);

const invalid = core.normalizeCandle({
  symbol: "005930",
  time: Date.now(),
  open: 72000,
  high: 71000,
  low: 70000,
  close: 71500,
  volume: 1,
});
assert.equal(invalid, null);

assert.equal(core.percentChange(100, 110), 10);
console.log("pipeline-core tests passed");

