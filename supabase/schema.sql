-- Quant pipeline schema for Supabase Postgres.
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.candles_1m (
  symbol text not null check (symbol ~ '^[0-9A-Z._-]{1,20}$'),
  bar_time timestamptz not null,
  open numeric(20, 6) not null check (open > 0),
  high numeric(20, 6) not null check (high > 0),
  low numeric(20, 6) not null check (low > 0),
  close numeric(20, 6) not null check (close > 0),
  volume bigint not null default 0 check (volume >= 0),
  is_complete boolean not null default true,
  public_visible boolean not null default false,
  source text not null default 'kis_openapi',
  collected_at timestamptz not null default now(),
  primary key (symbol, bar_time),
  constraint candles_1m_high_valid check (high >= greatest(open, close, low)),
  constraint candles_1m_low_valid check (low <= least(open, close, high))
);

create index if not exists candles_1m_public_lookup
  on public.candles_1m (symbol, bar_time desc)
  where public_visible = true and is_complete = true;

create table if not exists public.strategy_signals (
  signal_id uuid primary key default gen_random_uuid(),
  symbol text not null,
  signal_time timestamptz not null,
  side text not null check (side in ('BUY', 'SELL', 'HOLD')),
  reference_price numeric(20, 6) not null check (reference_price > 0),
  strategy_version text not null,
  reason jsonb not null default '{}'::jsonb,
  public_visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (symbol, signal_time, strategy_version)
);

create index if not exists strategy_signals_public_lookup
  on public.strategy_signals (symbol, signal_time desc)
  where public_visible = true;

create table if not exists public.paper_portfolios (
  portfolio_id uuid primary key default gen_random_uuid(),
  portfolio_name text not null unique,
  initial_cash numeric(20, 6) not null check (initial_cash > 0),
  cash numeric(20, 6) not null check (cash >= 0),
  currency text not null default 'KRW',
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_trades (
  trade_id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.paper_portfolios(portfolio_id) on delete restrict,
  signal_id uuid references public.strategy_signals(signal_id) on delete set null,
  symbol text not null,
  execution_time timestamptz not null,
  side text not null check (side in ('BUY', 'SELL')),
  price numeric(20, 6) not null check (price > 0),
  quantity numeric(20, 6) not null check (quantity > 0),
  fee numeric(20, 6) not null default 0 check (fee >= 0),
  strategy_version text not null,
  public_visible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (portfolio_id, symbol, execution_time, side, strategy_version)
);

create index if not exists paper_trades_public_lookup
  on public.paper_trades (symbol, execution_time desc)
  where public_visible = true;

create table if not exists public.pipeline_runs (
  run_id uuid primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('success', 'partial_failure', 'skipped_market_closed')),
  symbols_requested integer not null check (symbols_requested >= 0),
  candles_written integer not null check (candles_written >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  error_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_runs_recent
  on public.pipeline_runs (started_at desc);

create table if not exists public.pipeline_runtime_state (
  state_key text primary key,
  state_value jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.candles_1m enable row level security;
alter table public.strategy_signals enable row level security;
alter table public.paper_portfolios enable row level security;
alter table public.paper_trades enable row level security;
alter table public.pipeline_runs enable row level security;
alter table public.pipeline_runtime_state enable row level security;

drop policy if exists "Public completed candles only" on public.candles_1m;
create policy "Public completed candles only"
  on public.candles_1m for select to anon
  using (public_visible = true and is_complete = true);

drop policy if exists "Public strategy signals only" on public.strategy_signals;
create policy "Public strategy signals only"
  on public.strategy_signals for select to anon
  using (public_visible = true);

drop policy if exists "Public paper trades only" on public.paper_trades;
create policy "Public paper trades only"
  on public.paper_trades for select to anon
  using (public_visible = true);

-- Browser users receive read access only. Cloud Run uses the service-role key,
-- which bypasses RLS server-side. Never expose that key in pipeline-config.js.
grant usage on schema public to anon;
grant select on public.candles_1m to anon;
grant select on public.strategy_signals to anon;
grant select on public.paper_trades to anon;
revoke all on public.paper_portfolios from anon;
revoke all on public.pipeline_runs from anon;
revoke all on public.pipeline_runtime_state from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.candles_1m, public.strategy_signals, public.paper_trades from anon;

