/*
 * Public browser configuration only.
 * Never place broker keys or a Supabase service-role key in this file.
 */
window.PIPELINE_CONFIG = Object.freeze({
  mode: "demo",
  symbol: "005930",
  symbolName: "Samsung Electronics",
  market: "KRX",
  chartIntervalMinutes: 5,
  supabaseUrl: "",
  supabaseAnonKey: "",
  refreshMs: 30000,
  demoTickMs: 4500,
  maxCandles: 300,
  publicLiveDataApproved: false,
});
