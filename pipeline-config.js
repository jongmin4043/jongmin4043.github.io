/*
 * Public browser configuration only.
 * Never place broker keys or a Supabase service-role key in this file.
 */
window.PIPELINE_CONFIG = Object.freeze({
  mode: "live",
  instruments: [
    { instrumentId: "KRX:005930", symbol: "005930", symbolName: "Samsung Electronics", market: "KRX", mark: "SE" },
    { instrumentId: "KRX:000660", symbol: "000660", symbolName: "SK hynix", market: "KRX", mark: "SH" },
  ],
  chartIntervalMinutes: 5,
  supabaseUrl: "https://jkonuvvzqgntthcdpgyh.supabase.co",
  supabasePublishableKey: "sb_publishable_rbEYgEraVvq15o0G1jGOaQ_hxyI7zSQ",
  refreshMs: 10000,
  staleAfterMs: 120000,
  demoTickMs: 4500,
  maxCandles: 300,
  // Change to true only after the matching Supabase release gate is approved.
  publicLiveDataApproved: false,
});
