create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists pg_cron;

create schema if not exists core;
create schema if not exists market;
create schema if not exists fundamentals;
create schema if not exists news;
create schema if not exists analytics;
create schema if not exists strategy;
create schema if not exists user_data;
create schema if not exists admin;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists core.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists core.industries (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references core.sectors(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (sector_id, slug)
);

create table if not exists core.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  slug text not null unique,
  isin text unique,
  sector_id uuid references core.sectors(id),
  industry_id uuid references core.industries(id),
  business_summary text,
  website_url text,
  ir_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.symbols (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  exchange text not null check (exchange in ('NSE', 'BSE')),
  symbol text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (exchange, symbol)
);

create table if not exists core.company_search (
  company_id uuid primary key references core.companies(id) on delete cascade,
  search_text text not null,
  updated_at timestamptz not null default now()
);

create index if not exists company_search_trgm_idx on core.company_search using gin (search_text gin_trgm_ops);

create table if not exists market.corporate_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  action_type text not null,
  action_date date not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists market.ohlcv_daily (
  company_id uuid not null references core.companies(id) on delete cascade,
  price_date date not null,
  open numeric(14, 4) not null,
  high numeric(14, 4) not null,
  low numeric(14, 4) not null,
  close numeric(14, 4) not null,
  volume bigint not null,
  source text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, price_date)
) partition by range (price_date);

create table if not exists market.ohlcv_daily_2025_2027
  partition of market.ohlcv_daily
  for values from ('2025-01-01') to ('2027-01-01');

create table if not exists market.technical_indicators_daily (
  company_id uuid not null references core.companies(id) on delete cascade,
  price_date date not null,
  sma_20 numeric(14, 4),
  sma_50 numeric(14, 4),
  sma_200 numeric(14, 4),
  rsi_14 numeric(10, 4),
  macd numeric(10, 4),
  atr_14 numeric(10, 4),
  vwap numeric(14, 4),
  created_at timestamptz not null default now(),
  primary key (company_id, price_date)
);

create table if not exists market.trend_states (
  company_id uuid not null references core.companies(id) on delete cascade,
  price_date date not null,
  timeframe text not null,
  trend_state text not null,
  explanation text,
  created_at timestamptz not null default now(),
  primary key (company_id, price_date, timeframe)
);

create table if not exists fundamentals.financial_statements_yearly (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  fiscal_year text not null,
  revenue_cr numeric(16, 2),
  ebitda_cr numeric(16, 2),
  pat_cr numeric(16, 2),
  operating_cash_flow_cr numeric(16, 2),
  filing_source text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, fiscal_year)
);

create table if not exists fundamentals.financial_statements_quarterly (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  fiscal_quarter text not null,
  revenue_cr numeric(16, 2),
  ebitda_cr numeric(16, 2),
  pat_cr numeric(16, 2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, fiscal_quarter)
);

create table if not exists fundamentals.financial_ratios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  as_of_date date not null,
  roe_pct numeric(10, 4),
  roce_pct numeric(10, 4),
  ebitda_margin_pct numeric(10, 4),
  pat_margin_pct numeric(10, 4),
  net_debt_to_ebitda numeric(10, 4),
  pe_ratio numeric(12, 4),
  pb_ratio numeric(12, 4),
  created_at timestamptz not null default now(),
  unique (company_id, as_of_date)
);

create table if not exists fundamentals.segment_revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  as_of_period text not null,
  segment_name text not null,
  revenue_share_pct numeric(8, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists fundamentals.geo_revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  as_of_period text not null,
  geography_name text not null,
  revenue_share_pct numeric(8, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists fundamentals.business_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  source_kind text not null,
  source_url text,
  note text not null,
  source_excerpt text,
  created_at timestamptz not null default now()
);

create table if not exists fundamentals.peer_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists fundamentals.peer_group_members (
  peer_group_id uuid not null references fundamentals.peer_groups(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (peer_group_id, company_id)
);

create table if not exists news.news_articles (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  source_name text not null,
  published_at timestamptz not null,
  canonical_url text,
  summary text,
  article_body text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists news.news_entities (
  id uuid primary key default gen_random_uuid(),
  news_article_id uuid not null references news.news_articles(id) on delete cascade,
  entity_type text not null,
  entity_name text not null,
  relevance_score numeric(8, 2),
  created_at timestamptz not null default now()
);

create table if not exists news.stock_news_links (
  news_article_id uuid not null references news.news_articles(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  impact_direction text,
  impact_score numeric(8, 2),
  created_at timestamptz not null default now(),
  primary key (news_article_id, company_id)
);

create table if not exists news.event_calendar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies(id) on delete cascade,
  event_title text not null,
  event_type text not null,
  event_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists analytics.stock_behavior_daily (
  company_id uuid not null references core.companies(id) on delete cascade,
  price_date date not null,
  momentum_sensitivity numeric(8, 2),
  acceleration_score numeric(8, 2),
  trend_decay_score numeric(8, 2),
  volatility_sensitivity numeric(8, 2),
  market_linkage_score numeric(8, 2),
  narrative text,
  created_at timestamptz not null default now(),
  primary key (company_id, price_date)
);

alter table analytics.stock_behavior_daily add column if not exists regime_label text;
alter table analytics.stock_behavior_daily add column if not exists macro_regime text;
alter table analytics.stock_behavior_daily add column if not exists market_context_summary text;
alter table analytics.stock_behavior_daily add column if not exists benchmark_symbol text;
alter table analytics.stock_behavior_daily add column if not exists benchmark_return_pct numeric(8, 2);
alter table analytics.stock_behavior_daily add column if not exists relative_strength_pct numeric(8, 2);
alter table analytics.stock_behavior_daily add column if not exists context_signals jsonb not null default '[]'::jsonb;

create table if not exists analytics.model_runs (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  stage text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists strategy.strategy_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null,
  description text not null,
  ruleset jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists strategy.strategy_evaluations (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references strategy.strategy_definitions(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  evaluation_date date not null,
  matched boolean not null default false,
  confidence_pct numeric(8, 2) not null,
  invalidation text,
  support_points jsonb not null default '[]'::jsonb,
  explanation text,
  created_at timestamptz not null default now(),
  unique (strategy_id, company_id, evaluation_date)
);

alter table strategy.strategy_evaluations add column if not exists source_snapshot_date date;
alter table strategy.strategy_evaluations add column if not exists matched_rule_count integer;
alter table strategy.strategy_evaluations add column if not exists total_rule_count integer;
alter table strategy.strategy_evaluations add column if not exists support_quality text;
alter table strategy.strategy_evaluations add column if not exists provenance_note text;

create table if not exists strategy.scenario_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  evaluation_date date not null,
  stance text not null,
  title text not null,
  confidence_pct numeric(8, 2) not null,
  trigger_condition text,
  invalidation text,
  payoff_frame text,
  explanation text,
  created_at timestamptz not null default now()
);

alter table strategy.scenario_outputs add column if not exists source_snapshot_date date;
alter table strategy.scenario_outputs add column if not exists provenance_note text;

create table if not exists strategy.pattern_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  price_date date not null,
  pattern_name text not null,
  confidence_pct numeric(8, 2) not null,
  note text,
  similar_cases jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_data.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_data.watchlist_items (
  watchlist_id uuid not null references user_data.watchlists(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, company_id)
);

create table if not exists user_data.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references core.companies(id) on delete cascade,
  alert_type text not null,
  threshold jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists user_data.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_data.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  beginner_mode boolean not null default true,
  mobile_density text not null default 'comfortable',
  default_watchlist_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists admin.source_adapters (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null unique,
  label text not null,
  source_type text not null,
  freshness_expectation text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists admin.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_adapter_id uuid not null references admin.source_adapters(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  detail text
);

create table if not exists admin.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_adapter_id uuid references admin.source_adapters(id) on delete set null,
  target_table text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  note text
);

create table if not exists admin.ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  ingestion_job_id uuid not null references admin.ingestion_jobs(id) on delete cascade,
  log_level text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists admin.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  source_adapter_id uuid references admin.source_adapters(id) on delete set null,
  issue_type text not null,
  detail text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admin.filing_documents (
  id uuid primary key default gen_random_uuid(),
  source_adapter_id uuid references admin.source_adapters(id) on delete set null,
  symbol text not null,
  exchange text not null check (exchange in ('NSE', 'BSE')),
  source_type text not null,
  document_kind text not null,
  status text not null default 'queued',
  input_path text,
  ocr_path text,
  output_path text,
  normalized_output_path text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_data.watchlists enable row level security;
alter table user_data.watchlist_items enable row level security;
alter table user_data.alerts enable row level security;
alter table user_data.saved_views enable row level security;
alter table user_data.user_preferences enable row level security;
alter table admin.source_adapters enable row level security;
alter table admin.source_runs enable row level security;
alter table admin.ingestion_jobs enable row level security;
alter table admin.ingestion_logs enable row level security;
alter table admin.data_quality_issues enable row level security;
alter table admin.filing_documents enable row level security;

drop policy if exists "watchlists_select_own" on user_data.watchlists;
drop policy if exists "watchlists_insert_own" on user_data.watchlists;
drop policy if exists "watchlists_update_own" on user_data.watchlists;
drop policy if exists "watchlists_delete_own" on user_data.watchlists;
drop policy if exists "watchlist_items_own" on user_data.watchlist_items;
drop policy if exists "alerts_own" on user_data.alerts;
drop policy if exists "saved_views_own" on user_data.saved_views;
drop policy if exists "preferences_own" on user_data.user_preferences;
drop policy if exists "admin_source_adapters_read" on admin.source_adapters;
drop policy if exists "admin_source_runs_read" on admin.source_runs;
drop policy if exists "admin_ingestion_jobs_read" on admin.ingestion_jobs;
drop policy if exists "admin_ingestion_logs_read" on admin.ingestion_logs;
drop policy if exists "admin_data_quality_read" on admin.data_quality_issues;
drop policy if exists "admin_filing_documents_read" on admin.filing_documents;

create policy "watchlists_select_own" on user_data.watchlists
  for select using (auth.uid() = user_id);
create policy "watchlists_insert_own" on user_data.watchlists
  for insert with check (auth.uid() = user_id);
create policy "watchlists_update_own" on user_data.watchlists
  for update using (auth.uid() = user_id);
create policy "watchlists_delete_own" on user_data.watchlists
  for delete using (auth.uid() = user_id);

create policy "watchlist_items_own" on user_data.watchlist_items
  for all using (
    exists (
      select 1 from user_data.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from user_data.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

create policy "alerts_own" on user_data.alerts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_views_own" on user_data.saved_views
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "preferences_own" on user_data.user_preferences
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "admin_source_adapters_read" on admin.source_adapters
  for select using (public.is_admin());
create policy "admin_source_runs_read" on admin.source_runs
  for select using (public.is_admin());
create policy "admin_ingestion_jobs_read" on admin.ingestion_jobs
  for select using (public.is_admin());
create policy "admin_ingestion_logs_read" on admin.ingestion_logs
  for select using (public.is_admin());
create policy "admin_data_quality_read" on admin.data_quality_issues
  for select using (public.is_admin());
create policy "admin_filing_documents_read" on admin.filing_documents
  for select using (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('filings', 'filings', false),
  ('news-cache', 'news-cache', false),
  ('reports', 'reports', false)
on conflict (id) do nothing;

insert into core.sectors (name, slug)
values
  ('Energy', 'energy'),
  ('Information Technology', 'information-technology')
on conflict (slug) do nothing;

insert into core.industries (sector_id, name, slug)
select s.id, v.name, v.slug
from core.sectors s
join (
  values
    ('energy', 'Integrated Oil, Retail, Telecom', 'integrated-energy'),
    ('information-technology', 'IT Services', 'it-services')
) as v(sector_slug, name, slug) on v.sector_slug = s.slug
on conflict (sector_id, slug) do nothing;

insert into core.companies (legal_name, display_name, slug, isin, sector_id, industry_id, business_summary, website_url)
select
  v.legal_name,
  v.display_name,
  v.slug,
  v.isin,
  s.id,
  i.id,
  v.business_summary,
  v.website_url
from (
  values
    ('Reliance Industries Limited', 'Reliance Industries', 'reliance-industries', 'INE002A01018', 'energy', 'integrated-energy', 'Diversified energy, retail, and telecom group.', 'https://www.ril.com'),
    ('Tata Consultancy Services Limited', 'Tata Consultancy Services', 'tata-consultancy-services', 'INE467B01029', 'information-technology', 'it-services', 'Global IT services and consulting company.', 'https://www.tcs.com')
) as v(legal_name, display_name, slug, isin, sector_slug, industry_slug, business_summary, website_url)
join core.sectors s on s.slug = v.sector_slug
join core.industries i on i.slug = v.industry_slug
on conflict (slug) do nothing;

insert into core.symbols (company_id, exchange, symbol, is_primary)
select c.id, v.exchange, v.symbol, true
from core.companies c
join (
  values
    ('reliance-industries', 'NSE', 'RELIANCE'),
    ('tata-consultancy-services', 'NSE', 'TCS')
) as v(company_slug, exchange, symbol) on v.company_slug = c.slug
on conflict (exchange, symbol) do nothing;

insert into core.company_search (company_id, search_text)
select c.id, concat_ws(' ', c.display_name, s.symbol, sec.name, ind.name)
from core.companies c
join core.symbols s on s.company_id = c.id and s.is_primary = true
left join core.sectors sec on sec.id = c.sector_id
left join core.industries ind on ind.id = c.industry_id
on conflict (company_id) do update set search_text = excluded.search_text, updated_at = now();

insert into strategy.strategy_definitions (slug, label, category, description, ruleset)
values
  ('trend-continuation', 'Trend Continuation', 'technical', 'Aligned moving averages and healthy momentum.', '{"rsi_min":55,"ma_stack":"bullish"}'),
  ('breakout-confirmation', 'Breakout Confirmation', 'technical', 'Fresh breakout with follow-through checks.', '{"requires_volume_confirmation":true}'),
  ('mean-reversion-watchlist', 'Mean Reversion Watchlist', 'technical', 'Oversold reset candidate watchlist.', '{"rsi_max":35}'),
  ('quality-plus-momentum', 'Quality + Momentum', 'hybrid', 'Strong returns profile plus trend support.', '{"roe_min":18,"trend_required":true}'),
  ('event-risk-watch', 'Event Risk Watch', 'news', 'Event-sensitive names near major catalysts.', '{"requires_upcoming_event":true}')
on conflict (slug) do nothing;

insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation)
values
  ('nse_eod', 'NSE EOD', 'official', 'Daily after market close'),
  ('bse_bhavcopy', 'BSE Bhav Copy', 'official', 'Daily after market close'),
  ('mca_filings', 'MCA Filings', 'official', 'Daily / filing-driven'),
  ('rbi_dbie', 'RBI DBIE', 'official', 'Weekly macro refresh'),
  ('yahoo_finance', 'Yahoo Finance', 'public-unofficial', 'On-demand / EOD refresh')
on conflict (adapter_key) do nothing;

drop view if exists public.app_stale_symbols;
drop view if exists public.app_filing_documents;
drop view if exists public.app_admin_overview;
drop view if exists public.app_data_quality_issues;
drop view if exists public.app_source_runs;
drop view if exists public.app_ingestion_jobs;
drop view if exists public.app_patterns;
drop view if exists public.app_scenarios;
drop view if exists public.app_strategy_evaluations;
drop view if exists public.app_behavior_snapshot;
drop view if exists public.app_company_events;
drop view if exists public.app_company_news;
drop view if exists public.app_news_entities;
drop view if exists public.app_corporate_actions;
drop view if exists public.app_price_levels;
drop view if exists public.app_technical_snapshot;
drop view if exists public.app_prices;
drop view if exists public.app_peer_comparison;
drop view if exists public.app_business_notes;
drop view if exists public.app_geography_mix;
drop view if exists public.app_segment_mix;
drop view if exists public.app_financials_quarterly;
drop view if exists public.app_financials_yearly;
drop view if exists public.app_stock_overview;
drop view if exists public.app_source_statuses;
drop view if exists public.app_company_directory;

create or replace view public.app_company_directory as
select
  c.id as company_id,
  c.slug,
  c.display_name as company_name,
  c.business_summary as summary,
  coalesce(sec.name, 'Unknown') as sector,
  coalesce(ind.name, 'Unknown') as industry,
  s.exchange,
  s.symbol,
  coalesce(
    array_remove(array[
      case when sec.name is not null then sec.name end,
      case when ind.name is not null then ind.name end
    ], null),
    '{}'::text[]
  ) as tags,
  c.created_at,
  c.updated_at
from core.companies c
join core.symbols s on s.company_id = c.id and s.is_primary = true
left join core.sectors sec on sec.id = c.sector_id
left join core.industries ind on ind.id = c.industry_id;

create or replace view public.app_source_statuses as
with latest_runs as (
  select distinct on (source_runs.source_adapter_id)
    source_runs.source_adapter_id,
    source_runs.started_at,
    source_runs.finished_at,
    source_runs.status,
    source_runs.detail
  from admin.source_runs
  order by source_runs.source_adapter_id, source_runs.started_at desc
)
select
  sa.id,
  sa.adapter_key,
  sa.label as adapter,
  sa.source_type,
  sa.freshness_expectation,
  sa.active,
  lr.started_at as last_started_at,
  lr.finished_at as last_finished_at,
  case
    when not sa.active then 'warning'
    when lr.source_adapter_id is null and sa.adapter_key <> 'yahoo_finance' then 'stale'
    when lr.status in ('warning', 'degraded', 'failed') then 'degraded'
    when lr.finished_at is null and lr.started_at < now() - interval '2 hours' then 'degraded'
    when sa.freshness_expectation ilike 'Daily%' and coalesce(lr.finished_at, lr.started_at) < now() - interval '2 days' then 'stale'
    when sa.freshness_expectation ilike 'Weekly%' and coalesce(lr.finished_at, lr.started_at) < now() - interval '8 days' then 'stale'
    when sa.freshness_expectation ilike 'On-demand%' and lr.source_adapter_id is null then 'warning'
    else coalesce(
      case when lr.status = 'success' then 'healthy' else lr.status end,
      case when sa.active then 'healthy' else 'warning' end
    )
  end as status,
  coalesce(
    lr.detail,
    case
      when sa.adapter_key = 'yahoo_finance' then 'Fallback adapter is configured and will run when a symbol is requested.'
      else 'Adapter configured and awaiting runtime jobs.'
    end
  ) as note,
  coalesce(
    to_char(coalesce(lr.finished_at, lr.started_at) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
    sa.freshness_expectation,
    'Not run yet'
  ) as freshness
from admin.source_adapters sa
left join latest_runs lr on lr.source_adapter_id = sa.id;

create or replace function public.app_search_companies(search_query text default null)
returns table (
  symbol text,
  company_name text,
  sector text,
  exchange text,
  tags text[]
)
language sql
stable
as $$
  select
    directory.symbol,
    directory.company_name,
    directory.sector,
    directory.exchange,
    directory.tags
  from public.app_company_directory directory
  where
    search_query is null
    or btrim(search_query) = ''
    or directory.symbol ilike '%' || btrim(search_query) || '%'
    or directory.company_name ilike '%' || btrim(search_query) || '%'
    or directory.sector ilike '%' || btrim(search_query) || '%'
    or exists (
      select 1
      from unnest(directory.tags) as tag
      where tag ilike '%' || btrim(search_query) || '%'
    )
  order by directory.company_name asc;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.app_company_directory to anon, authenticated, service_role;
grant select on public.app_source_statuses to anon, authenticated, service_role;
grant execute on function public.app_search_companies(text) to anon, authenticated, service_role;

create table if not exists analytics.company_snapshots_daily (
  company_id uuid not null references core.companies(id) on delete cascade,
  snapshot_date date not null,
  close numeric(14, 4) not null default 0,
  day_change_pct numeric(10, 4) not null default 0,
  market_cap_cr numeric(16, 2) not null default 0,
  one_year_return_pct numeric(10, 4),
  summary_tags jsonb not null default '[]'::jsonb,
  fundamentals_headline text,
  technical_summary text,
  technical_events jsonb not null default '[]'::jsonb,
  behavior_narrative text,
  created_at timestamptz not null default now(),
  primary key (company_id, snapshot_date)
);

create table if not exists market.price_levels (
  company_id uuid not null references core.companies(id) on delete cascade,
  as_of_date date not null,
  label text not null,
  value numeric(14, 4) not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (company_id, as_of_date, label)
);

alter table if exists fundamentals.financial_statements_yearly add column if not exists ebitda_margin_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_yearly add column if not exists pat_margin_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_yearly add column if not exists roe_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_yearly add column if not exists roce_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_yearly add column if not exists net_debt_to_ebitda numeric(10, 4);

alter table if exists fundamentals.financial_statements_quarterly add column if not exists ebitda_margin_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_quarterly add column if not exists pat_margin_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_quarterly add column if not exists roe_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_quarterly add column if not exists roce_pct numeric(10, 4);
alter table if exists fundamentals.financial_statements_quarterly add column if not exists net_debt_to_ebitda numeric(10, 4);

alter table if exists fundamentals.financial_ratios add column if not exists revenue_growth_pct numeric(10, 4);
alter table if exists news.stock_news_links add column if not exists relevance text;
alter table if exists news.stock_news_links add column if not exists sentiment text;
alter table if exists news.stock_news_links add column if not exists why_it_matters text;

create unique index if not exists segment_revenues_unique_idx on fundamentals.segment_revenues (company_id, as_of_period, segment_name);
create unique index if not exists geo_revenues_unique_idx on fundamentals.geo_revenues (company_id, as_of_period, geography_name);
create unique index if not exists business_notes_unique_idx on fundamentals.business_notes (company_id, source_kind, note);
create unique index if not exists event_calendar_unique_idx on news.event_calendar (company_id, event_title, event_date);
drop index if exists admin.source_runs_unique_idx;
create unique index if not exists source_runs_unique_idx on admin.source_runs (source_adapter_id, started_at);
create unique index if not exists ingestion_jobs_unique_idx on admin.ingestion_jobs (source_adapter_id, target_table, started_at);
create unique index if not exists scenario_outputs_unique_idx on strategy.scenario_outputs (company_id, evaluation_date, stance, title);
create unique index if not exists pattern_matches_unique_idx on strategy.pattern_matches (company_id, price_date, pattern_name);
drop index if exists news.news_articles_canonical_url_unique_idx;
create unique index if not exists news_articles_canonical_url_unique_idx on news.news_articles (canonical_url);

insert into core.companies (legal_name, display_name, slug, isin, sector_id, industry_id, business_summary, website_url)
select
  v.legal_name,
  v.display_name,
  v.slug,
  v.isin,
  s.id,
  i.id,
  v.business_summary,
  v.website_url
from (
  values
    ('Infosys Limited', 'Infosys', 'infosys', 'INE009A01021', 'information-technology', 'it-services', 'Global IT services company focused on enterprise transformation and digital programs.', 'https://www.infosys.com')
) as v(legal_name, display_name, slug, isin, sector_slug, industry_slug, business_summary, website_url)
join core.sectors s on s.slug = v.sector_slug
join core.industries i on i.slug = v.industry_slug
on conflict (slug) do nothing;

insert into core.symbols (company_id, exchange, symbol, is_primary)
select c.id, v.exchange, v.symbol, true
from core.companies c
join (
  values
    ('infosys', 'NSE', 'INFY')
) as v(company_slug, exchange, symbol) on v.company_slug = c.slug
on conflict (exchange, symbol) do nothing;

insert into core.company_search (company_id, search_text)
select c.id, concat_ws(' ', c.display_name, s.symbol, sec.name, ind.name)
from core.companies c
join core.symbols s on s.company_id = c.id and s.is_primary = true
left join core.sectors sec on sec.id = c.sector_id
left join core.industries ind on ind.id = c.industry_id
where c.slug = 'infosys'
on conflict (company_id) do update set search_text = excluded.search_text, updated_at = now();

insert into fundamentals.peer_groups (slug, label)
values ('largecap-leaders', 'Large Cap Leaders')
on conflict (slug) do nothing;

insert into fundamentals.peer_group_members (peer_group_id, company_id)
select pg.id, c.id
from fundamentals.peer_groups pg
join core.companies c on c.slug in ('reliance-industries', 'tata-consultancy-services', 'infosys')
where pg.slug = 'largecap-leaders'
on conflict do nothing;

insert into analytics.company_snapshots_daily (
  company_id, snapshot_date, close, day_change_pct, market_cap_cr, one_year_return_pct,
  summary_tags, fundamentals_headline, technical_summary, technical_events, behavior_narrative
)
select
  c.id,
  v.snapshot_date,
  v.close,
  v.day_change_pct,
  v.market_cap_cr,
  v.one_year_return_pct,
  v.summary_tags::jsonb,
  v.fundamentals_headline,
  v.technical_summary,
  v.technical_events::jsonb,
  v.behavior_narrative
from (
  values
    ('reliance-industries', '2026-03-27'::date, 3021.60, 1.82, 2050000.00, 19.20, '["Large cap","Retail optionality","Energy cash flows"]', 'Revenue mix remains diversified, but margin improvement still depends on telecom monetization and retail operating leverage.', 'Price is above major moving averages and volume has supported the latest breakout attempt.', '["Golden-cross style alignment remains intact across major moving averages.","Breakout candle expanded on stronger-than-average volume.","No fresh bearish divergence is visible on the current swing."]', 'Reliance is behaving like a high-liquidity trend stock with market linkage and company-specific acceleration potential.'),
    ('tata-consultancy-services', '2026-03-27'::date, 4315.25, 0.64, 1520000.00, 15.50, '["High quality","Cash rich","Margin resilient"]', 'TCS remains a quality benchmark with steady margins, strong client stickiness, and high cash generation.', 'TCS is trending upward with a steadier slope than momentum names and a quality-compounder profile.', '["Trend is positive, but follow-through tends to be steadier than explosive.","Relative strength versus IT peers has improved modestly.","No major exhaustion signal is visible yet."]', 'TCS behaves like a stable quality trend with lower noise and stronger resilience when sentiment turns choppy.'),
    ('infosys', '2026-03-27'::date, 1884.40, -0.25, 790000.00, 11.80, '["Digital services","USD revenue","Execution monitor"]', 'Infosys still screens as a balanced execution story with decent growth and global services exposure.', 'Price action is constructive but less extended than the strongest large-cap leaders.', '["Relative structure remains constructive.","Momentum is positive but not explosive.","Execution and guidance remain key catalysts."]', 'Infosys is behaving like a moderate-beta quality technology stock with improving but still measured momentum.')
) as v(company_slug, snapshot_date, close, day_change_pct, market_cap_cr, one_year_return_pct, summary_tags, fundamentals_headline, technical_summary, technical_events, behavior_narrative)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, snapshot_date) do update set
  close = excluded.close,
  day_change_pct = excluded.day_change_pct,
  market_cap_cr = excluded.market_cap_cr,
  one_year_return_pct = excluded.one_year_return_pct,
  summary_tags = excluded.summary_tags,
  fundamentals_headline = excluded.fundamentals_headline,
  technical_summary = excluded.technical_summary,
  technical_events = excluded.technical_events,
  behavior_narrative = excluded.behavior_narrative;

insert into fundamentals.financial_statements_yearly (
  company_id, fiscal_year, revenue_cr, ebitda_cr, pat_cr, operating_cash_flow_cr,
  filing_source, raw_payload, ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
)
select
  c.id, v.fiscal_year, v.revenue_cr, v.ebitda_cr, v.pat_cr, v.operating_cash_flow_cr,
  'seeded-demo', '{}'::jsonb, v.ebitda_margin_pct, v.pat_margin_pct, v.roe_pct, v.roce_pct, v.net_debt_to_ebitda
from (
  values
    ('reliance-industries','FY24',902341.00,150690.95,61359.19,91000.00,16.70,6.80,10.20,9.10,1.50),
    ('reliance-industries','FY25',958410.00,164846.52,68047.11,96500.00,17.20,7.10,10.60,9.50,1.40),
    ('reliance-industries','FY26E',1035220.00,182198.72,75571.06,103000.00,17.60,7.30,10.90,9.80,1.30),
    ('tata-consultancy-services','FY24',240893.00,60705.04,46010.56,50500.00,25.20,19.10,45.60,56.20,-0.40),
    ('tata-consultancy-services','FY25',258420.00,66413.94,50391.90,53800.00,25.70,19.50,46.10,57.40,-0.50),
    ('tata-consultancy-services','FY26E',285800.00,74593.80,56588.40,59400.00,26.10,19.80,46.80,58.30,-0.60),
    ('infosys','FY24',153670.00,38110.16,27045.92,29200.00,24.80,17.60,30.40,39.20,-0.30),
    ('infosys','FY25',165120.00,41775.36,29672.06,31500.00,25.30,17.97,30.90,39.90,-0.30),
    ('infosys','FY26E',179800.00,46028.80,32903.40,34400.00,25.60,18.30,31.40,40.60,-0.40)
) as v(company_slug, fiscal_year, revenue_cr, ebitda_cr, pat_cr, operating_cash_flow_cr, ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, fiscal_year) do update set
  revenue_cr = excluded.revenue_cr,
  ebitda_cr = excluded.ebitda_cr,
  pat_cr = excluded.pat_cr,
  operating_cash_flow_cr = excluded.operating_cash_flow_cr,
  ebitda_margin_pct = excluded.ebitda_margin_pct,
  pat_margin_pct = excluded.pat_margin_pct,
  roe_pct = excluded.roe_pct,
  roce_pct = excluded.roce_pct,
  net_debt_to_ebitda = excluded.net_debt_to_ebitda;

insert into fundamentals.financial_statements_quarterly (
  company_id, fiscal_quarter, revenue_cr, ebitda_cr, pat_cr, raw_payload,
  ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
)
select
  c.id, v.fiscal_quarter, v.revenue_cr, v.ebitda_cr, v.pat_cr, '{}'::jsonb,
  v.ebitda_margin_pct, v.pat_margin_pct, v.roe_pct, v.roce_pct, v.net_debt_to_ebitda
from (
  values
    ('reliance-industries','Q2 FY26',253100.00,43280.10,17717.00,17.10,7.00,10.50,9.30,1.40),
    ('reliance-industries','Q3 FY26',259880.00,45219.12,18711.36,17.40,7.20,10.70,9.60,1.40),
    ('reliance-industries','Q4 FY26E',264200.00,46539.20,19286.60,17.60,7.30,10.90,9.80,1.30),
    ('tata-consultancy-services','Q2 FY26',69440.00,17846.08,13471.36,25.70,19.40,46.00,57.20,-0.50),
    ('tata-consultancy-services','Q3 FY26',71200.00,18440.80,14026.40,25.90,19.70,46.40,57.90,-0.50),
    ('tata-consultancy-services','Q4 FY26E',72400.00,18896.40,14335.20,26.10,19.80,46.80,58.30,-0.60),
    ('infosys','Q2 FY26',44600.00,11239.20,8032.46,25.20,18.01,31.00,40.10,-0.30),
    ('infosys','Q3 FY26',45900.00,11704.50,8315.49,25.50,18.12,31.20,40.30,-0.30),
    ('infosys','Q4 FY26E',47200.00,12130.40,8588.32,25.70,18.20,31.40,40.60,-0.40)
) as v(company_slug, fiscal_quarter, revenue_cr, ebitda_cr, pat_cr, ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, fiscal_quarter) do update set
  revenue_cr = excluded.revenue_cr,
  ebitda_cr = excluded.ebitda_cr,
  pat_cr = excluded.pat_cr,
  ebitda_margin_pct = excluded.ebitda_margin_pct,
  pat_margin_pct = excluded.pat_margin_pct,
  roe_pct = excluded.roe_pct,
  roce_pct = excluded.roce_pct,
  net_debt_to_ebitda = excluded.net_debt_to_ebitda;

insert into fundamentals.financial_ratios (
  company_id, as_of_date, roe_pct, roce_pct, ebitda_margin_pct, pat_margin_pct,
  net_debt_to_ebitda, pe_ratio, pb_ratio, revenue_growth_pct
)
select
  c.id, v.as_of_date, v.roe_pct, v.roce_pct, v.ebitda_margin_pct, v.pat_margin_pct,
  v.net_debt_to_ebitda, v.pe_ratio, v.pb_ratio, v.revenue_growth_pct
from (
  values
    ('reliance-industries','2026-03-27'::date,10.90,9.80,17.60,7.30,1.30,24.60,2.10,8.10),
    ('tata-consultancy-services','2026-03-27'::date,46.80,58.30,26.10,19.80,-0.60,29.40,13.20,10.60),
    ('infosys','2026-03-27'::date,31.40,40.60,25.60,18.30,-0.40,27.30,8.40,9.40)
) as v(company_slug, as_of_date, roe_pct, roce_pct, ebitda_margin_pct, pat_margin_pct, net_debt_to_ebitda, pe_ratio, pb_ratio, revenue_growth_pct)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, as_of_date) do update set
  roe_pct = excluded.roe_pct,
  roce_pct = excluded.roce_pct,
  ebitda_margin_pct = excluded.ebitda_margin_pct,
  pat_margin_pct = excluded.pat_margin_pct,
  net_debt_to_ebitda = excluded.net_debt_to_ebitda,
  pe_ratio = excluded.pe_ratio,
  pb_ratio = excluded.pb_ratio,
  revenue_growth_pct = excluded.revenue_growth_pct;

insert into fundamentals.segment_revenues (company_id, as_of_period, segment_name, revenue_share_pct)
select c.id, v.as_of_period, v.segment_name, v.revenue_share_pct
from (
  values
    ('reliance-industries','FY26E','Oil to Chemicals',42.00),
    ('reliance-industries','FY26E','Retail',27.00),
    ('reliance-industries','FY26E','Digital Services',23.00),
    ('reliance-industries','FY26E','Others',8.00),
    ('tata-consultancy-services','FY26E','BFSI',33.00),
    ('tata-consultancy-services','FY26E','Retail & CPG',16.00),
    ('tata-consultancy-services','FY26E','Manufacturing',13.00),
    ('tata-consultancy-services','FY26E','Others',38.00),
    ('infosys','FY26E','Financial Services',30.00),
    ('infosys','FY26E','Manufacturing',18.00),
    ('infosys','FY26E','Retail',15.00),
    ('infosys','FY26E','Others',37.00)
) as v(company_slug, as_of_period, segment_name, revenue_share_pct)
join core.companies c on c.slug = v.company_slug
on conflict do nothing;

insert into fundamentals.geo_revenues (company_id, as_of_period, geography_name, revenue_share_pct)
select c.id, v.as_of_period, v.geography_name, v.revenue_share_pct
from (
  values
    ('reliance-industries','FY26E','India',78.00),
    ('reliance-industries','FY26E','Asia ex-India',11.00),
    ('reliance-industries','FY26E','Europe',6.00),
    ('reliance-industries','FY26E','Americas',5.00),
    ('tata-consultancy-services','FY26E','North America',51.00),
    ('tata-consultancy-services','FY26E','UK',17.00),
    ('tata-consultancy-services','FY26E','Continental Europe',15.00),
    ('tata-consultancy-services','FY26E','Rest of World',17.00),
    ('infosys','FY26E','North America',58.00),
    ('infosys','FY26E','Europe',27.00),
    ('infosys','FY26E','India',7.00),
    ('infosys','FY26E','Rest of World',8.00)
) as v(company_slug, as_of_period, geography_name, revenue_share_pct)
join core.companies c on c.slug = v.company_slug
on conflict do nothing;

insert into fundamentals.business_notes (company_id, source_kind, source_url, note, source_excerpt)
select c.id, v.source_kind, v.source_url, v.note, v.source_excerpt
from (
  values
    ('reliance-industries','annual-report','https://www.ril.com','Retail same-store growth recovered sequentially, which matters for operating leverage.','Seeded note for demo product completeness.'),
    ('reliance-industries','annual-report','https://www.ril.com','Telecom monetization remains the main bridge from scale to higher consolidated return ratios.','Seeded note for demo product completeness.'),
    ('tata-consultancy-services','annual-report','https://www.tcs.com','Client mining and large-deal conversion continue to matter more than short-term discretionary softness.','Seeded note for demo product completeness.'),
    ('tata-consultancy-services','annual-report','https://www.tcs.com','Margin resilience remains the quality anchor for the stock.','Seeded note for demo product completeness.'),
    ('infosys','annual-report','https://www.infosys.com','Execution consistency and client budget commentary remain the key variables to monitor.','Seeded note for demo product completeness.')
) as v(company_slug, source_kind, source_url, note, source_excerpt)
join core.companies c on c.slug = v.company_slug
on conflict do nothing;

with price_data as (
  select * from (values
    ('RELIANCE','2026-03-18'::date,2885.00,2905.00,2872.00,2893.00,2820000),
    ('RELIANCE','2026-03-19'::date,2892.00,2910.00,2881.00,2891.00,2760000),
    ('RELIANCE','2026-03-20'::date,2898.00,2925.00,2894.00,2896.00,2910000),
    ('RELIANCE','2026-03-23'::date,2902.00,2944.00,2897.00,2903.00,3040000),
    ('RELIANCE','2026-03-24'::date,2918.00,2965.00,2910.00,2917.00,3180000),
    ('RELIANCE','2026-03-25'::date,2938.00,2984.00,2931.00,2955.00,3320000),
    ('RELIANCE','2026-03-26'::date,2960.00,3004.00,2953.00,2992.00,3460000),
    ('RELIANCE','2026-03-27'::date,2998.00,3036.00,2988.00,3021.60,3615000),
    ('TCS','2026-03-18'::date,4214.00,4230.00,4202.00,4221.00,1980000),
    ('TCS','2026-03-19'::date,4220.00,4248.00,4215.00,4238.00,2025000),
    ('TCS','2026-03-20'::date,4240.00,4264.00,4231.00,4259.00,2080000),
    ('TCS','2026-03-23'::date,4262.00,4286.00,4252.00,4271.00,2140000),
    ('TCS','2026-03-24'::date,4275.00,4305.00,4268.00,4294.00,2190000),
    ('TCS','2026-03-25'::date,4293.00,4322.00,4287.00,4308.00,2235000),
    ('TCS','2026-03-26'::date,4304.00,4336.00,4298.00,4321.00,2290000),
    ('TCS','2026-03-27'::date,4322.00,4346.00,4310.00,4315.25,2350000),
    ('INFY','2026-03-18'::date,1842.00,1856.00,1837.00,1848.00,2510000),
    ('INFY','2026-03-19'::date,1849.00,1860.00,1841.00,1852.00,2470000),
    ('INFY','2026-03-20'::date,1851.00,1868.00,1848.00,1861.00,2550000),
    ('INFY','2026-03-23'::date,1860.00,1872.00,1854.00,1866.00,2590000),
    ('INFY','2026-03-24'::date,1868.00,1880.00,1861.00,1874.00,2640000),
    ('INFY','2026-03-25'::date,1873.00,1888.00,1867.00,1882.00,2710000),
    ('INFY','2026-03-26'::date,1880.00,1892.00,1870.00,1888.00,2770000),
    ('INFY','2026-03-27'::date,1888.00,1894.00,1876.00,1884.40,2830000)
  ) as t(symbol, price_date, open, high, low, close, volume)
)
insert into market.ohlcv_daily (company_id, price_date, open, high, low, close, volume, source)
select c.id, p.price_date, p.open, p.high, p.low, p.close, p.volume, 'seeded-demo'
from price_data p
join core.symbols s on s.symbol = p.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, price_date) do update set
  open = excluded.open,
  high = excluded.high,
  low = excluded.low,
  close = excluded.close,
  volume = excluded.volume,
  source = excluded.source;

insert into market.technical_indicators_daily (
  company_id, price_date, sma_20, sma_50, sma_200, rsi_14, macd, atr_14, vwap
)
select c.id, v.price_date, v.sma_20, v.sma_50, v.sma_200, v.rsi_14, v.macd, v.atr_14, v.vwap
from (
  values
    ('RELIANCE','2026-03-27'::date,2968.20,2894.10,2750.30,63.40,18.70,48.50,3008.20),
    ('TCS','2026-03-27'::date,4258.40,4191.60,3980.80,58.10,9.40,44.80,4309.10),
    ('INFY','2026-03-27'::date,1866.40,1822.10,1718.20,56.80,7.10,26.30,1881.40)
) as v(symbol, price_date, sma_20, sma_50, sma_200, rsi_14, macd, atr_14, vwap)
join core.symbols s on s.symbol = v.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, price_date) do update set
  sma_20 = excluded.sma_20,
  sma_50 = excluded.sma_50,
  sma_200 = excluded.sma_200,
  rsi_14 = excluded.rsi_14,
  macd = excluded.macd,
  atr_14 = excluded.atr_14,
  vwap = excluded.vwap;

insert into market.trend_states (company_id, price_date, timeframe, trend_state, explanation)
select c.id, v.price_date, v.timeframe, v.trend_state, v.explanation
from (
  values
    ('RELIANCE','2026-03-27'::date,'daily','Bullish with range expansion','Price remains above major moving averages with supportive momentum.'),
    ('TCS','2026-03-27'::date,'daily','Constructive but slower','Trend is positive but behaving more like a steady compounder than a breakout name.'),
    ('INFY','2026-03-27'::date,'daily','Constructive','Trend is positive with moderate momentum and less extension than stronger leaders.')
) as v(symbol, price_date, timeframe, trend_state, explanation)
join core.symbols s on s.symbol = v.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, price_date, timeframe) do update set
  trend_state = excluded.trend_state,
  explanation = excluded.explanation;

insert into market.price_levels (company_id, as_of_date, label, value, reason)
select c.id, v.as_of_date, v.label, v.value, v.reason
from (
  values
    ('RELIANCE','2026-03-27'::date,'Primary Support',2960.00,'Recent breakout retest zone'),
    ('RELIANCE','2026-03-27'::date,'Major Support',2890.00,'50DMA cluster'),
    ('RELIANCE','2026-03-27'::date,'Immediate Resistance',3050.00,'Recent swing high'),
    ('TCS','2026-03-27'::date,'Primary Support',4250.00,'20DMA and prior pivot'),
    ('TCS','2026-03-27'::date,'Major Support',4190.00,'50DMA zone'),
    ('TCS','2026-03-27'::date,'Immediate Resistance',4350.00,'Recent swing high shelf'),
    ('INFY','2026-03-27'::date,'Primary Support',1860.00,'Recent support band'),
    ('INFY','2026-03-27'::date,'Major Support',1820.00,'50DMA zone'),
    ('INFY','2026-03-27'::date,'Immediate Resistance',1895.00,'Recent local high')
) as v(symbol, as_of_date, label, value, reason)
join core.symbols s on s.symbol = v.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, as_of_date, label) do update set
  value = excluded.value,
  reason = excluded.reason;

insert into news.news_articles (headline, source_name, published_at, canonical_url, summary, article_body, raw_payload)
values
  ('Reliance retail expansion commentary points to improving discretionary demand', 'Business Standard', '2026-03-27T08:30:00+05:30', 'https://example.com/news/reliance-retail-demand', 'Retail commentary supports improving demand and margin expectations.', 'Seeded article body for Reliance retail demand.', '{}'::jsonb),
  ('Energy margin outlook stays mixed as global crack spreads soften', 'Mint', '2026-03-26T16:10:00+05:30', 'https://example.com/news/reliance-energy-margins', 'Energy margin commentary remains mixed.', 'Seeded article body for Reliance energy outlook.', '{}'::jsonb),
  ('Large-deal wins help support TCS growth visibility into next fiscal year', 'Economic Times', '2026-03-27T09:15:00+05:30', 'https://example.com/news/tcs-large-deals', 'Large deals continue to reinforce growth visibility.', 'Seeded article body for TCS large deals.', '{}'::jsonb)
on conflict (canonical_url) do update set
  headline = excluded.headline,
  source_name = excluded.source_name,
  published_at = excluded.published_at,
  summary = excluded.summary,
  article_body = excluded.article_body;

insert into news.stock_news_links (news_article_id, company_id, impact_direction, impact_score, relevance, sentiment, why_it_matters)
select a.id, c.id, v.impact_direction, v.impact_score, v.relevance, v.sentiment, v.why_it_matters
from (
  values
    ('https://example.com/news/reliance-retail-demand','reliance-industries','positive',78.00,'high','positive','The market is reading stronger store-level commentary as evidence that retail profitability can widen, which improves the margin narrative behind the stock.'),
    ('https://example.com/news/reliance-energy-margins','reliance-industries','neutral',54.00,'medium','neutral','This matters because energy cash flows still fund a large part of the group''s optionality, even though consumer businesses carry the rerating story.'),
    ('https://example.com/news/tcs-large-deals','tata-consultancy-services','positive',74.00,'high','positive','The market tends to reward TCS when large deals reinforce revenue visibility, especially in slower discretionary spending periods.')
) as v(canonical_url, company_slug, impact_direction, impact_score, relevance, sentiment, why_it_matters)
join news.news_articles a on a.canonical_url = v.canonical_url
join core.companies c on c.slug = v.company_slug
on conflict (news_article_id, company_id) do update set
  impact_direction = excluded.impact_direction,
  impact_score = excluded.impact_score,
  relevance = excluded.relevance,
  sentiment = excluded.sentiment,
  why_it_matters = excluded.why_it_matters;

insert into news.event_calendar (company_id, event_title, event_type, event_date, note)
select c.id, v.event_title, v.event_type, v.event_date, v.note
from (
  values
    ('reliance-industries','Q4 FY26 result window','Earnings','2026-04-19'::date,'Monitor retail margin and telecom ARPU commentary.'),
    ('reliance-industries','Annual report release','Filing','2026-05-10'::date,'Update business model map and segment notes from management commentary.'),
    ('tata-consultancy-services','Q4 FY26 result date','Earnings','2026-04-12'::date,'Watch deal pipeline, margin commentary, and BFSI demand.'),
    ('infosys','Q4 FY26 result date','Earnings','2026-04-18'::date,'Watch commentary on discretionary spending, large deals, and margin guidance.')
) as v(company_slug, event_title, event_type, event_date, note)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, event_title, event_date) do update set
  event_type = excluded.event_type,
  note = excluded.note;

insert into analytics.stock_behavior_daily (
  company_id, price_date, momentum_sensitivity, acceleration_score, trend_decay_score,
  volatility_sensitivity, market_linkage_score, regime_label, macro_regime,
  market_context_summary, benchmark_symbol, benchmark_return_pct, relative_strength_pct,
  context_signals, narrative
)
select c.id, v.price_date, v.momentum_sensitivity, v.acceleration_score, v.trend_decay_score,
  v.volatility_sensitivity, v.market_linkage_score, v.regime_label, v.macro_regime,
  v.market_context_summary, v.benchmark_symbol, v.benchmark_return_pct, v.relative_strength_pct,
  to_jsonb(v.context_signals::text[]), v.narrative
from (
  values
    ('RELIANCE','2026-03-27'::date,71.00,67.00,28.00,56.00,62.00,'Trend-following','Risk-on broad market','The stock is participating in a supportive broad-market tape while still outperforming enough to keep the move partly company-driven.','^NSEI',3.60,2.40,array['Momentum response is firm when the stock starts trending.','Recent price slope is steepening rather than flattening.','Trend decay is contained, which supports persistence.','Broader market direction is still explaining a meaningful part of the move.'],'Reliance is behaving like a high-liquidity trend stock: market-linked on broad moves, but still capable of company-specific acceleration when consumer or telecom narratives improve.'),
    ('TCS','2026-03-27'::date,59.00,48.00,24.00,34.00,44.00,'Balanced','Range-bound broad market','The stock is holding up in a steadier market tape, with company quality doing more of the work than broad beta alone.','^NSEI',1.10,1.80,array['Momentum behavior is constructive but not aggressive.','Acceleration is measured, so trend continuation may stay slower.','Trend decay is contained, which supports persistence.','Company-specific behavior is carrying more of the tape than index beta alone.'],'TCS behaves like a stable quality trend: lower noise, slower acceleration, and stronger resilience when broader sentiment gets choppy.'),
    ('INFY','2026-03-27'::date,55.00,46.00,31.00,39.00,47.00,'Balanced','Global-demand sensitive','Infosys is staying constructive in a steadier tape, but benchmark outperformance still depends on execution and demand commentary.','^NSEI',1.10,0.90,array['Momentum is constructive but still selective.','Acceleration remains measured instead of explosive.','Trend decay is contained, though not absent.','The stock is relying on company execution more than pure index beta.'],'Infosys is acting constructive but more selective, with enough momentum support to stay interesting while still depending on execution commentary.')
) as v(symbol, price_date, momentum_sensitivity, acceleration_score, trend_decay_score, volatility_sensitivity, market_linkage_score, regime_label, macro_regime, market_context_summary, benchmark_symbol, benchmark_return_pct, relative_strength_pct, context_signals, narrative)
join core.symbols s on s.symbol = v.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, price_date) do update set
  momentum_sensitivity = excluded.momentum_sensitivity,
  acceleration_score = excluded.acceleration_score,
  trend_decay_score = excluded.trend_decay_score,
  volatility_sensitivity = excluded.volatility_sensitivity,
  market_linkage_score = excluded.market_linkage_score,
  regime_label = excluded.regime_label,
  macro_regime = excluded.macro_regime,
  market_context_summary = excluded.market_context_summary,
  benchmark_symbol = excluded.benchmark_symbol,
  benchmark_return_pct = excluded.benchmark_return_pct,
  relative_strength_pct = excluded.relative_strength_pct,
  context_signals = excluded.context_signals,
  narrative = excluded.narrative;

insert into strategy.strategy_evaluations (
  strategy_id, company_id, evaluation_date, matched, confidence_pct, source_snapshot_date,
  matched_rule_count, total_rule_count, support_quality, provenance_note, invalidation, support_points, explanation
)
select sd.id, c.id, v.evaluation_date, v.matched, v.confidence_pct, v.source_snapshot_date,
  v.matched_rule_count, v.total_rule_count, v.support_quality, v.provenance_note,
  v.invalidation, to_jsonb(v.support_points::text[]), v.explanation
from (
  values
    ('reliance-industries','trend-continuation','2026-03-27'::date,true,78.00,'2026-03-27'::date,3,3,'strong','Derived from moving-average stack, RSI expansion, and volume confirmation.','Daily close back below 2960 with weakening volume support.','{"Price above 20DMA/50DMA/200DMA","RSI in healthy expansion zone","Breakout volume confirmed"}','This setup matches a continuation structure because the trend is aligned across timeframes and momentum is expanding without a clearly overbought reversal signal.'),
    ('reliance-industries','breakout-confirmation','2026-03-27'::date,true,72.00,'2026-03-27'::date,3,3,'strong','Derived from breakout participation, short-term trend position, and momentum confirmation.','Failed follow-through and a quick rejection back into the prior base.','{"Fresh swing-high test","Range expansion day","Follow-through watch level is nearby"}','The stock is in the right neighborhood for a breakout confirmation, but the strongest confirmation still depends on holding above resistance after the first thrust.'),
    ('reliance-industries','mean-reversion-watchlist','2026-03-27'::date,false,29.00,'2026-03-27'::date,0,1,'weak','Driven by oversold reset logic from the latest RSI snapshot.','Not applicable while the stock remains in expansion mode.','{"Momentum is positive","No oversold condition"}','This does not fit a mean-reversion watchlist because the setup is trending rather than washed out.'),
    ('reliance-industries','quality-plus-momentum','2026-03-27'::date,true,66.00,'2026-03-27'::date,2,2,'strong','Combines return-on-equity quality checks with trend continuation structure.','Return ratios stall while price underperforms peers.','{"Large-cap quality profile","Improving profitability","Trend alignment remains positive"}','It qualifies as a hybrid quality-plus-momentum candidate, though the quality score is not as clean as software or consumer compounders.'),
    ('reliance-industries','event-risk-watch','2026-03-27'::date,true,61.00,'2026-03-27'::date,1,1,'moderate','Triggered from the upcoming event calendar window in the latest refresh.','Event passes without material guidance change.','{"Earnings window ahead","Narrative-sensitive retail and telecom commentary","Breakout near event zone"}','Upcoming earnings create event sensitivity because the market still needs evidence that consumer and telecom segments are lifting returns fast enough.'),
    ('tata-consultancy-services','trend-continuation','2026-03-27'::date,true,64.00,'2026-03-27'::date,2,3,'moderate','Derived from moving-average stack and measured momentum expansion.','Close below 4250 with weakening relative strength.','{"Price above key moving averages","Measured momentum expansion"}','The trend remains positive, though it is a slower continuation profile than a fast breakout profile.'),
    ('tata-consultancy-services','breakout-confirmation','2026-03-27'::date,false,41.00,'2026-03-27'::date,1,3,'weak','Derived from resistance proximity and incomplete breakout participation checks.','Not applicable unless a clean range break appears.','{"Approaching resistance but without explosive expansion"}','TCS is nearer to orderly trend continuation than a high-energy breakout confirmation setup.'),
    ('tata-consultancy-services','mean-reversion-watchlist','2026-03-27'::date,false,18.00,'2026-03-27'::date,0,1,'weak','Driven by oversold reset logic from the latest RSI snapshot.','Not applicable in current trend state.','{"No oversold setup present"}','This is not a mean-reversion candidate because price is not in a stressed or oversold reset.'),
    ('tata-consultancy-services','quality-plus-momentum','2026-03-27'::date,true,82.00,'2026-03-27'::date,2,2,'strong','Combines return-on-equity quality checks with trend continuation structure.','Loss of quality narrative or persistent peer underperformance.','{"High ROE and ROCE","Healthy trend alignment","Cash-rich balance sheet"}','TCS is a strong match for quality plus momentum because fundamentals and trend structure are both supportive without requiring a high-risk narrative leap.'),
    ('tata-consultancy-services','event-risk-watch','2026-03-27'::date,true,58.00,'2026-03-27'::date,1,1,'moderate','Triggered from the upcoming event calendar window in the latest refresh.','Event passes with no material guidance surprise.','{"Earnings ahead","Deal commentary sensitivity"}','Results matter because the market still needs confirmation that growth visibility and margin discipline remain intact.'),
    ('infosys','trend-continuation','2026-03-27'::date,true,57.00,'2026-03-27'::date,2,3,'moderate','Derived from moving-average alignment and constructive momentum support.','Close below 1860 while trend breadth weakens.','{"Price above 20DMA and 50DMA","Momentum remains constructive"}','Infosys fits a moderate continuation setup because the trend is positive, but the move is less forceful than stronger leaders.'),
    ('infosys','breakout-confirmation','2026-03-27'::date,false,44.00,'2026-03-27'::date,1,3,'weak','Derived from resistance proximity and incomplete breakout participation checks.','Not applicable unless price clears the recent shelf decisively.','{"Near local highs","Needs stronger follow-through"}','The stock is close enough to watch for breakout behavior, but the present evidence looks more constructive than explosive.'),
    ('infosys','mean-reversion-watchlist','2026-03-27'::date,false,22.00,'2026-03-27'::date,0,1,'weak','Driven by oversold reset logic from the latest RSI snapshot.','Not applicable in the current price structure.','{"No oversold reset","Trend still positive"}','Infosys is not in a stressed enough condition to qualify as a mean-reversion setup.'),
    ('infosys','quality-plus-momentum','2026-03-27'::date,true,69.00,'2026-03-27'::date,2,2,'strong','Combines return-quality checks with constructive trend support.','Execution narrative weakens while the stock loses trend support.','{"Healthy return ratios","Moderate positive trend","Execution consistency improving"}','Infosys fits the hybrid quality-plus-momentum bucket because returns are solid and price behavior is constructive without demanding a heroic narrative.'),
    ('infosys','event-risk-watch','2026-03-27'::date,true,55.00,'2026-03-27'::date,1,1,'moderate','Triggered from the upcoming event calendar window in the latest refresh.','Event passes without a material change in commentary.','{"Result window ahead","Execution and demand commentary matter"}','The next result window matters because investors are still calibrating how much discretionary recovery is really flowing through the book.')
) as v(company_slug, strategy_slug, evaluation_date, matched, confidence_pct, source_snapshot_date, matched_rule_count, total_rule_count, support_quality, provenance_note, invalidation, support_points, explanation)
join core.companies c on c.slug = v.company_slug
join strategy.strategy_definitions sd on sd.slug = v.strategy_slug
on conflict (strategy_id, company_id, evaluation_date) do update set
  matched = excluded.matched,
  confidence_pct = excluded.confidence_pct,
  source_snapshot_date = excluded.source_snapshot_date,
  matched_rule_count = excluded.matched_rule_count,
  total_rule_count = excluded.total_rule_count,
  support_quality = excluded.support_quality,
  provenance_note = excluded.provenance_note,
  invalidation = excluded.invalidation,
  support_points = excluded.support_points,
  explanation = excluded.explanation;

insert into strategy.scenario_outputs (
  company_id, evaluation_date, stance, title, confidence_pct, source_snapshot_date, provenance_note, trigger_condition, invalidation, payoff_frame, explanation
)
select c.id, v.evaluation_date, v.stance, v.title, v.confidence_pct, v.source_snapshot_date, v.provenance_note, v.trigger_condition, v.invalidation, v.payoff_frame, v.explanation
from (
  values
    ('reliance-industries','2026-03-27'::date,'Bullish','Bullish continuation above breakout shelf',74.00,'2026-03-27'::date,'Bullish path is derived from the current trend state and nearest support/resistance structure.','Sustained closes above 3050 with RSI staying above 60.','Loss of 2960 support on closing basis.','Favors continuation toward the next leg if market breadth stays supportive.','The chart already has strong alignment, so a stable hold above the breakout shelf would convert strength into a cleaner continuation structure.'),
    ('reliance-industries','2026-03-27'::date,'Neutral','Range reset before the next move',52.00,'2026-03-27'::date,'Neutral path comes from consolidation logic around the current support shelf and resistance cap.','Price oscillates between 2960 and 3050 as momentum cools.','Convincing expansion outside the range.','Useful for patience rather than urgency.','This would be a normal digestion outcome after a sharp move, especially if the market pauses near quarter-end.'),
    ('reliance-industries','2026-03-27'::date,'Bearish','Failed breakout into deeper retest',34.00,'2026-03-27'::date,'Bearish path is anchored to a failed-hold scenario at the current support shelf.','Breakout rejection followed by closes below 2960.','Immediate recovery back above the breakout shelf.','Risk rises because a failed breakout can unwind quickly into the 50DMA zone.','This is lower probability today, but still important because event-driven stocks can reverse hard when the narrative wobbles.'),
    ('tata-consultancy-services','2026-03-27'::date,'Bullish','Quality continuation after earnings',69.00,'2026-03-27'::date,'Bullish path is derived from the current trend state and nearest support/resistance structure.','Healthy deal wins and stable margins with price holding above 4250.','Weak guidance and a close below 4190.','Supports a slow-grind continuation profile.','The bullish path depends more on predictability than excitement, which is typical for TCS.'),
    ('tata-consultancy-services','2026-03-27'::date,'Neutral','Sideways consolidation into results',57.00,'2026-03-27'::date,'Neutral path comes from consolidation logic around the current support shelf and resistance cap.','Price stays between 4250 and 4350 ahead of earnings.','Decisive move outside the range.','Favors patience and post-event clarity.','A neutral pause would be normal given the current measured trend slope.'),
    ('tata-consultancy-services','2026-03-27'::date,'Bearish','Defensive drift lower on soft guidance',31.00,'2026-03-27'::date,'Bearish path is anchored to a failed-hold scenario at the current support shelf.','Guidance softens and price loses 4190 support.','Immediate recovery above the 20DMA after the event.','Would likely be orderly rather than disorderly.','The bearish path is lower probability but still relevant because the stock''s premium multiple depends on trust.'),
    ('infosys','2026-03-27'::date,'Bullish','Execution-led continuation',64.00,'2026-03-27'::date,'Bullish path is derived from the current trend state and nearest support/resistance structure.','Constructive results commentary and price holding above 1860.','Close below 1820 after the event.','Supports a steadier continuation rather than a vertical move.','The bullish case relies on execution confidence and steady deal commentary more than on a dramatic rerating impulse.'),
    ('infosys','2026-03-27'::date,'Neutral','Pause below resistance',55.00,'2026-03-27'::date,'Neutral path comes from consolidation logic around the current support shelf and resistance cap.','Price holds between 1860 and 1895 while momentum cools slightly.','Clear directional break outside the band.','Encourages selective patience.','A pause would fit the stock''s current profile because momentum is positive but not extreme.'),
    ('infosys','2026-03-27'::date,'Bearish','Guidance wobble into trend reset',33.00,'2026-03-27'::date,'Bearish path is anchored to a failed-hold scenario at the current support shelf.','Soft guidance combines with a loss of 1860 support.','Quick recovery above recent highs.','Could pull price back toward the 50DMA zone.','The bearish path is not dominant, but service names can reprice quickly when confidence in execution slips.')
) as v(company_slug, evaluation_date, stance, title, confidence_pct, source_snapshot_date, provenance_note, trigger_condition, invalidation, payoff_frame, explanation)
join core.companies c on c.slug = v.company_slug
on conflict (company_id, evaluation_date, stance, title) do update set
  confidence_pct = excluded.confidence_pct,
  source_snapshot_date = excluded.source_snapshot_date,
  provenance_note = excluded.provenance_note,
  trigger_condition = excluded.trigger_condition,
  invalidation = excluded.invalidation,
  payoff_frame = excluded.payoff_frame,
  explanation = excluded.explanation;

insert into strategy.pattern_matches (company_id, price_date, pattern_name, confidence_pct, note, similar_cases)
select c.id, v.price_date, v.pattern_name, v.confidence_pct, v.note, to_jsonb(v.similar_cases::text[])
from (
  values
    ('RELIANCE','2026-03-27'::date,'Ascending base',76.00,'Price compressed upward before attempting range expansion.','{"2024 consumer rerating breakout","2025 telecom expansion leg"}'),
    ('TCS','2026-03-27'::date,'Rising channel',63.00,'Trend is steady, orderly, and less explosive than a breakout base.','{"2025 post-deal-win grind","2024 margin resilience rally"}'),
    ('INFY','2026-03-27'::date,'Constructive staircase',58.00,'The stock is climbing in measured steps rather than explosive bursts.','{"2025 services recovery phase","2024 digital pipeline rebuild"}')
) as v(symbol, price_date, pattern_name, confidence_pct, note, similar_cases)
join core.symbols s on s.symbol = v.symbol and s.is_primary = true
join core.companies c on c.id = s.company_id
on conflict (company_id, price_date, pattern_name) do update set
  confidence_pct = excluded.confidence_pct,
  note = excluded.note,
  similar_cases = excluded.similar_cases;

insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
select sa.id, v.started_at, v.finished_at, v.status, v.detail
from (
  values
    ('nse_eod','2026-03-27T18:12:00+05:30'::timestamptz,'2026-03-27T18:18:00+05:30'::timestamptz,'healthy','Daily price and security master refresh completed.'),
    ('bse_bhavcopy','2026-03-27T18:20:00+05:30'::timestamptz,'2026-03-27T18:24:00+05:30'::timestamptz,'healthy','Cross-exchange symbol mapping reconciled.'),
    ('mca_filings','2026-03-27T18:35:00+05:30'::timestamptz,null,'warning','Queued annual report extraction jobs remain pending.'),
    ('rbi_dbie','2026-03-27T08:00:00+05:30'::timestamptz,'2026-03-27T08:03:00+05:30'::timestamptz,'healthy','Macro overlays available for regime context.')
) as v(adapter_key, started_at, finished_at, status, detail)
join admin.source_adapters sa on sa.adapter_key = v.adapter_key
on conflict (source_adapter_id, started_at) do update set
  finished_at = excluded.finished_at,
  status = excluded.status,
  detail = excluded.detail;

insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
select sa.id, v.target_table, v.status, v.started_at, v.finished_at, v.note
from (
  values
    ('nse_eod','market.ohlcv_daily','success','2026-03-27T18:12:00+05:30'::timestamptz,'2026-03-27T18:18:00+05:30'::timestamptz,'Imported 2,341 EOD rows and refreshed security master joins.'),
    ('bse_bhavcopy','core.symbols','success','2026-03-27T18:20:00+05:30'::timestamptz,'2026-03-27T18:24:00+05:30'::timestamptz,'Exchange mapping delta applied cleanly.'),
    ('mca_filings','fundamentals.business_notes','warning','2026-03-27T18:35:00+05:30'::timestamptz,null,'Seven filings waiting for document extraction retry.'),
    ('rbi_dbie','analytics.stock_behavior_daily','success','2026-03-27T08:00:00+05:30'::timestamptz,'2026-03-27T08:03:00+05:30'::timestamptz,'Macro-linked behavior overlays refreshed for the current regime.')
) as v(adapter_key, target_table, status, started_at, finished_at, note)
join admin.source_adapters sa on sa.adapter_key = v.adapter_key
on conflict (source_adapter_id, target_table, started_at) do update set
  status = excluded.status,
  finished_at = excluded.finished_at,
  note = excluded.note;

insert into admin.data_quality_issues (source_adapter_id, issue_type, detail, resolved, created_at)
select sa.id, v.issue_type, v.detail, v.resolved, v.created_at
from (
  values
    ('mca_filings','backfill-lag','Annual report extraction backlog is still present for a subset of symbols awaiting parsing.', false, '2026-03-27T19:05:00+05:30'::timestamptz),
    ('yahoo_finance','source-classification','Yahoo Finance is currently a fallback source and should not be treated as the platform''s final official market-data backbone.', false, '2026-03-29T10:30:00+05:30'::timestamptz)
) as v(adapter_key, issue_type, detail, resolved, created_at)
join admin.source_adapters sa on sa.adapter_key = v.adapter_key
where not exists (
  select 1
  from admin.data_quality_issues dqi
  where dqi.source_adapter_id = sa.id and dqi.issue_type = v.issue_type and dqi.detail = v.detail
);

create or replace view public.app_stock_overview as
with latest_snapshots as (
  select distinct on (cs.company_id)
    cs.company_id,
    cs.snapshot_date,
    cs.close,
    cs.day_change_pct,
    cs.market_cap_cr,
    cs.one_year_return_pct,
    cs.summary_tags,
    cs.fundamentals_headline,
    cs.technical_summary,
    cs.technical_events,
    cs.behavior_narrative
  from analytics.company_snapshots_daily cs
  order by cs.company_id, cs.snapshot_date desc
)
select
  d.company_id,
  d.slug,
  d.company_name,
  d.summary,
  d.sector,
  d.industry,
  d.exchange,
  d.symbol,
  d.tags as base_tags,
  ls.snapshot_date,
  ls.close,
  ls.day_change_pct,
  ls.market_cap_cr,
  ls.one_year_return_pct,
  ls.fundamentals_headline,
  ls.technical_summary,
  coalesce(ls.technical_events, '[]'::jsonb) as technical_events,
  ls.behavior_narrative,
  coalesce(ls.summary_tags, '[]'::jsonb) as summary_tags,
  coalesce(
    array(
      select distinct tag
      from (
        select unnest(coalesce(d.tags, '{}'::text[])) as tag
        union all
        select jsonb_array_elements_text(coalesce(ls.summary_tags, '[]'::jsonb)) as tag
      ) tags
      where tag is not null and btrim(tag) <> ''
      order by tag
    ),
    '{}'::text[]
  ) as tags,
  d.created_at,
  d.updated_at
from public.app_company_directory d
left join latest_snapshots ls on ls.company_id = d.company_id;

create or replace view public.app_financials_yearly as
select
  s.symbol,
  c.display_name as company_name,
  fy.fiscal_year as period,
  fy.revenue_cr,
  fy.ebitda_margin_pct,
  fy.pat_margin_pct,
  fy.roe_pct,
  fy.roce_pct,
  fy.net_debt_to_ebitda,
  fy.created_at
from fundamentals.financial_statements_yearly fy
join core.companies c on c.id = fy.company_id
join core.symbols s on s.company_id = c.id and s.is_primary = true;

create or replace view public.app_financials_quarterly as
select
  s.symbol,
  c.display_name as company_name,
  fq.fiscal_quarter as period,
  fq.revenue_cr,
  fq.ebitda_margin_pct,
  fq.pat_margin_pct,
  fq.roe_pct,
  fq.roce_pct,
  fq.net_debt_to_ebitda,
  fq.created_at
from fundamentals.financial_statements_quarterly fq
join core.companies c on c.id = fq.company_id
join core.symbols s on s.company_id = c.id and s.is_primary = true;

create or replace view public.app_segment_mix as
select
  s.symbol,
  sr.as_of_period,
  sr.segment_name as label,
  sr.revenue_share_pct as value_pct
from fundamentals.segment_revenues sr
join core.symbols s on s.company_id = sr.company_id and s.is_primary = true;

create or replace view public.app_geography_mix as
select
  s.symbol,
  gr.as_of_period,
  gr.geography_name as label,
  gr.revenue_share_pct as value_pct
from fundamentals.geo_revenues gr
join core.symbols s on s.company_id = gr.company_id and s.is_primary = true;

create or replace view public.app_business_notes as
select
  s.symbol,
  bn.id,
  bn.source_kind,
  bn.source_url,
  bn.note,
  bn.source_excerpt,
  bn.created_at
from fundamentals.business_notes bn
join core.symbols s on s.company_id = bn.company_id and s.is_primary = true;

create or replace view public.app_peer_comparison as
with latest_ratios as (
  select distinct on (company_id)
    company_id,
    as_of_date,
    roe_pct,
    pe_ratio,
    revenue_growth_pct
  from fundamentals.financial_ratios
  order by company_id, as_of_date desc
),
latest_snapshots as (
  select distinct on (company_id)
    company_id,
    snapshot_date,
    market_cap_cr,
    one_year_return_pct
  from analytics.company_snapshots_daily
  order by company_id, snapshot_date desc
)
select
  basis_symbol.symbol as basis_symbol,
  peer_symbol.symbol,
  peer_company.display_name as company_name,
  coalesce(ls.market_cap_cr, 0) as market_cap_cr,
  coalesce(lr.pe_ratio, 0) as pe_ratio,
  coalesce(lr.roe_pct, 0) as roe_pct,
  coalesce(lr.revenue_growth_pct, 0) as revenue_growth_pct,
  coalesce(ls.one_year_return_pct, 0) as one_year_return_pct
from fundamentals.peer_group_members basis_member
join fundamentals.peer_group_members peer_member on peer_member.peer_group_id = basis_member.peer_group_id
join core.symbols basis_symbol on basis_symbol.company_id = basis_member.company_id and basis_symbol.is_primary = true
join core.companies peer_company on peer_company.id = peer_member.company_id
join core.symbols peer_symbol on peer_symbol.company_id = peer_company.id and peer_symbol.is_primary = true
left join latest_ratios lr on lr.company_id = peer_company.id
left join latest_snapshots ls on ls.company_id = peer_company.id;

create or replace view public.app_prices as
select
  s.symbol,
  od.price_date,
  od.open,
  od.high,
  od.low,
  od.close,
  od.volume,
  od.source
from market.ohlcv_daily od
join core.symbols s on s.company_id = od.company_id and s.is_primary = true;

create or replace view public.app_technical_snapshot as
with latest_indicators as (
  select distinct on (ti.company_id)
    ti.company_id,
    ti.price_date,
    ti.sma_20,
    ti.sma_50,
    ti.sma_200,
    ti.rsi_14,
    ti.macd,
    ti.atr_14,
    ti.vwap
  from market.technical_indicators_daily ti
  order by ti.company_id, ti.price_date desc
),
latest_trends as (
  select distinct on (ts.company_id)
    ts.company_id,
    ts.price_date,
    ts.trend_state,
    ts.explanation
  from market.trend_states ts
  where ts.timeframe = 'daily'
  order by ts.company_id, ts.price_date desc
),
latest_snapshots as (
  select distinct on (cs.company_id)
    cs.company_id,
    cs.snapshot_date,
    cs.technical_summary,
    cs.technical_events
  from analytics.company_snapshots_daily cs
  order by cs.company_id, cs.snapshot_date desc
)
select
  s.symbol,
  li.price_date,
  li.sma_20,
  li.sma_50,
  li.sma_200,
  li.rsi_14,
  li.macd,
  li.atr_14,
  li.vwap,
  lt.trend_state,
  coalesce(ls.technical_summary, lt.explanation) as technical_summary,
  coalesce(ls.technical_events, '[]'::jsonb) as technical_events
from latest_indicators li
join core.symbols s on s.company_id = li.company_id and s.is_primary = true
left join latest_trends lt on lt.company_id = li.company_id and lt.price_date = li.price_date
left join latest_snapshots ls on ls.company_id = li.company_id;

create or replace view public.app_price_levels as
select
  s.symbol,
  pl.as_of_date,
  pl.label,
  pl.value,
  pl.reason
from market.price_levels pl
join core.symbols s on s.company_id = pl.company_id and s.is_primary = true;

create or replace view public.app_corporate_actions as
select
  s.symbol,
  ca.id,
  ca.action_type,
  ca.action_date,
  ca.details
from market.corporate_actions ca
join core.symbols s on s.company_id = ca.company_id and s.is_primary = true;

create or replace view public.app_company_news as
select
  s.symbol,
  na.id,
  na.headline,
  na.source_name,
  na.published_at,
  snl.relevance,
  snl.impact_direction,
  snl.impact_score,
  snl.sentiment,
  snl.why_it_matters,
  na.summary,
  na.canonical_url,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'entityType', ne.entity_type,
          'entityName', ne.entity_name,
          'relevanceScore', ne.relevance_score
        )
        order by ne.relevance_score desc nulls last, ne.entity_name
      )
      from news.news_entities ne
      where ne.news_article_id = na.id
    ),
    '[]'::jsonb
  ) as entities
from news.stock_news_links snl
join news.news_articles na on na.id = snl.news_article_id
join core.symbols s on s.company_id = snl.company_id and s.is_primary = true;

create or replace view public.app_news_entities as
select
  s.symbol,
  ne.news_article_id,
  ne.id,
  ne.entity_type,
  ne.entity_name,
  ne.relevance_score,
  ne.created_at
from news.news_entities ne
join news.stock_news_links snl on snl.news_article_id = ne.news_article_id
join core.symbols s on s.company_id = snl.company_id and s.is_primary = true;

create or replace view public.app_company_events as
select
  s.symbol,
  ec.id,
  ec.event_title,
  ec.event_type,
  ec.event_date,
  ec.note
from news.event_calendar ec
join core.symbols s on s.company_id = ec.company_id and s.is_primary = true;

create or replace view public.app_behavior_snapshot as
select
  s.symbol,
  bd.price_date,
  bd.regime_label,
  bd.macro_regime,
  bd.narrative,
  bd.market_context_summary,
  bd.benchmark_symbol,
  bd.benchmark_return_pct,
  bd.relative_strength_pct,
  bd.context_signals,
  bd.momentum_sensitivity,
  bd.acceleration_score,
  bd.trend_decay_score,
  bd.volatility_sensitivity,
  bd.market_linkage_score
from analytics.stock_behavior_daily bd
join core.symbols s on s.company_id = bd.company_id and s.is_primary = true;

create or replace view public.app_strategy_evaluations as
select
  s.symbol,
  se.id,
  sd.slug as strategy_slug,
  sd.label as strategy_name,
  sd.category,
  se.evaluation_date,
  se.matched,
  se.confidence_pct,
  se.source_snapshot_date,
  se.matched_rule_count,
  se.total_rule_count,
  se.support_quality,
  se.provenance_note,
  se.invalidation,
  se.support_points,
  se.explanation
from strategy.strategy_evaluations se
join strategy.strategy_definitions sd on sd.id = se.strategy_id
join core.symbols s on s.company_id = se.company_id and s.is_primary = true;

create or replace view public.app_scenarios as
select
  s.symbol,
  so.id,
  so.evaluation_date,
  so.stance,
  so.title,
  so.confidence_pct,
  so.source_snapshot_date,
  so.provenance_note,
  so.trigger_condition,
  so.invalidation,
  so.payoff_frame,
  so.explanation
from strategy.scenario_outputs so
join core.symbols s on s.company_id = so.company_id and s.is_primary = true;

create or replace view public.app_patterns as
select
  s.symbol,
  pm.id,
  pm.price_date,
  pm.pattern_name,
  pm.confidence_pct,
  pm.note,
  pm.similar_cases
from strategy.pattern_matches pm
join core.symbols s on s.company_id = pm.company_id and s.is_primary = true;

create or replace view public.app_ingestion_jobs as
select
  ij.id,
  coalesce(sa.label, 'Unknown source') as source,
  ij.target_table,
  ij.status,
  ij.started_at,
  ij.finished_at,
  ij.note
from admin.ingestion_jobs ij
left join admin.source_adapters sa on sa.id = ij.source_adapter_id;

create or replace view public.app_source_runs as
select
  sr.id,
  sa.adapter_key,
  sa.label as adapter,
  sa.source_type,
  sr.started_at,
  sr.finished_at,
  sr.status,
  sr.detail
from admin.source_runs sr
join admin.source_adapters sa on sa.id = sr.source_adapter_id;

create or replace view public.app_data_quality_issues as
select
  dqi.id,
  coalesce(sa.label, 'Platform') as adapter,
  coalesce(sa.adapter_key, 'platform') as adapter_key,
  dqi.issue_type,
  dqi.detail,
  dqi.resolved,
  dqi.created_at
from admin.data_quality_issues dqi
left join admin.source_adapters sa on sa.id = dqi.source_adapter_id;

create or replace view public.app_admin_overview as
with source_counts as (
  select
    count(*) as total_sources,
    count(*) filter (where status = 'healthy') as healthy_sources,
    count(*) filter (where status = 'warning') as warning_sources,
    count(*) filter (where status = 'degraded') as degraded_sources,
    count(*) filter (where status = 'stale') as stale_sources
  from public.app_source_statuses
),
job_counts as (
  select
    count(*) as total_jobs,
    count(*) filter (where status = 'running') as running_jobs,
    count(*) filter (where status = 'queued') as queued_jobs,
    count(*) filter (where status = 'warning') as warning_jobs,
    count(*) filter (where status = 'success') as success_jobs
  from public.app_ingestion_jobs
),
issue_counts as (
  select
    count(*) filter (where resolved = false) as open_issues,
    count(*) filter (where resolved = true) as resolved_issues
  from public.app_data_quality_issues
),
activity as (
  select
    max(started_at) as latest_run_started_at,
    max(coalesce(finished_at, started_at)) as latest_activity_at
  from public.app_source_runs
)
select
  sc.total_sources,
  sc.healthy_sources,
  sc.warning_sources,
  sc.degraded_sources,
  sc.stale_sources,
  jc.total_jobs,
  jc.running_jobs,
  jc.queued_jobs,
  jc.warning_jobs,
  jc.success_jobs,
  ic.open_issues,
  ic.resolved_issues,
  activity.latest_run_started_at,
  activity.latest_activity_at
from source_counts sc
cross join job_counts jc
cross join issue_counts ic
cross join activity;

create or replace view public.app_stale_symbols as
with latest_snapshots as (
  select distinct on (cs.company_id)
    cs.company_id,
    cs.snapshot_date
  from analytics.company_snapshots_daily cs
  order by cs.company_id, cs.snapshot_date desc
)
select
  c.id as company_id,
  c.display_name as company_name,
  s.exchange,
  s.symbol,
  ls.snapshot_date,
  case
    when ls.snapshot_date is null then null
    else greatest((current_date - ls.snapshot_date), 0)
  end as snapshot_age_days,
  case
    when ls.snapshot_date is null then 'missing'
    when ls.snapshot_date < current_date - 5 then 'stale'
    else 'fresh'
  end as status,
  case
    when ls.snapshot_date is null then 'No stored overview snapshot exists for this primary symbol yet.'
    when ls.snapshot_date < current_date - 5 then format('Latest stored snapshot is %s days old.', greatest((current_date - ls.snapshot_date), 0))
    else 'Snapshot is within the current freshness window.'
  end as note
from core.symbols s
join core.companies c on c.id = s.company_id
left join latest_snapshots ls on ls.company_id = c.id
where s.is_primary = true
  and (ls.snapshot_date is null or ls.snapshot_date < current_date - 5);

create or replace view public.app_filing_documents as
select
  fd.id,
  coalesce(sa.label, 'Unknown source') as source,
  fd.symbol,
  fd.exchange,
  fd.source_type,
  fd.document_kind,
  fd.status,
  fd.input_path,
  fd.ocr_path,
  fd.output_path,
  fd.normalized_output_path,
  fd.error_message,
  fd.metadata,
  fd.queued_at,
  fd.processing_started_at,
  fd.processing_finished_at,
  fd.created_at,
  fd.updated_at
from admin.filing_documents fd
left join admin.source_adapters sa on sa.id = fd.source_adapter_id;

grant select on public.app_stock_overview to anon, authenticated, service_role;
grant select on public.app_financials_yearly to anon, authenticated, service_role;
grant select on public.app_financials_quarterly to anon, authenticated, service_role;
grant select on public.app_segment_mix to anon, authenticated, service_role;
grant select on public.app_geography_mix to anon, authenticated, service_role;
grant select on public.app_business_notes to anon, authenticated, service_role;
grant select on public.app_peer_comparison to anon, authenticated, service_role;
grant select on public.app_prices to anon, authenticated, service_role;
grant select on public.app_technical_snapshot to anon, authenticated, service_role;
grant select on public.app_price_levels to anon, authenticated, service_role;
grant select on public.app_corporate_actions to anon, authenticated, service_role;
grant select on public.app_company_news to anon, authenticated, service_role;
grant select on public.app_news_entities to anon, authenticated, service_role;
grant select on public.app_company_events to anon, authenticated, service_role;
grant select on public.app_behavior_snapshot to anon, authenticated, service_role;
grant select on public.app_strategy_evaluations to anon, authenticated, service_role;
grant select on public.app_scenarios to anon, authenticated, service_role;
grant select on public.app_patterns to anon, authenticated, service_role;
grant select on public.app_ingestion_jobs to anon, authenticated, service_role;
grant select on public.app_source_runs to anon, authenticated, service_role;
grant select on public.app_data_quality_issues to anon, authenticated, service_role;
grant select on public.app_admin_overview to anon, authenticated, service_role;
grant select on public.app_stale_symbols to anon, authenticated, service_role;
grant select on public.app_filing_documents to anon, authenticated, service_role;

create or replace function public.app_run_freshness_audit(stale_after_days integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, core, analytics, admin
as $$
declare
  v_started_at timestamptz := now();
  v_finished_at timestamptz := now();
  v_platform_adapter_id uuid;
  v_issue_count integer := 0;
  v_resolved_count integer := 0;
  stale_row record;
begin
  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values ('platform_audit', 'Platform Audit', 'internal', 'Daily platform audit', true)
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_platform_adapter_id;

  insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
  values (
    v_platform_adapter_id,
    v_started_at,
    v_finished_at,
    'healthy',
    format('Freshness audit evaluated primary symbols with a stale threshold of %s days.', stale_after_days)
  )
  on conflict (source_adapter_id, started_at) do update set
    finished_at = excluded.finished_at,
    status = excluded.status,
    detail = excluded.detail;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
  values (
    v_platform_adapter_id,
    'platform.freshness_audit',
    'success',
    v_started_at,
    v_finished_at,
    format('Freshness audit started with stale threshold %s days.', stale_after_days)
  )
  on conflict (source_adapter_id, target_table, started_at) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    note = excluded.note;

  update admin.data_quality_issues
  set resolved = true
  where resolved = false
    and issue_type in ('missing-snapshot', 'stale-snapshot');

  get diagnostics v_resolved_count = row_count;

  for stale_row in
    with latest_snapshots as (
      select distinct on (cs.company_id)
        cs.company_id,
        cs.snapshot_date
      from analytics.company_snapshots_daily cs
      order by cs.company_id, cs.snapshot_date desc
    )
    select
      c.id as company_id,
      c.display_name as company_name,
      s.exchange,
      s.symbol,
      ls.snapshot_date
    from core.symbols s
    join core.companies c on c.id = s.company_id
    left join latest_snapshots ls on ls.company_id = c.id
    where s.is_primary = true
      and (
        ls.snapshot_date is null
        or ls.snapshot_date < current_date - stale_after_days
      )
  loop
    insert into admin.data_quality_issues (source_adapter_id, issue_type, detail, resolved, created_at)
    values (
      v_platform_adapter_id,
      case when stale_row.snapshot_date is null then 'missing-snapshot' else 'stale-snapshot' end,
      case
        when stale_row.snapshot_date is null
          then format('Primary symbol %s:%s has no stored overview snapshot yet.', stale_row.exchange, stale_row.symbol)
        else format(
          'Primary symbol %s:%s is stale. Latest stored snapshot date is %s.',
          stale_row.exchange,
          stale_row.symbol,
          stale_row.snapshot_date
        )
      end,
      false,
      now()
    );
    v_issue_count := v_issue_count + 1;
  end loop;

  insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
  select
    ij.id,
    case when v_issue_count > 0 then 'warning' else 'info' end,
    'Freshness audit completed.',
    jsonb_build_object(
      'staleAfterDays', stale_after_days,
      'issuesCreated', v_issue_count,
      'issuesResolved', v_resolved_count
    )
  from admin.ingestion_jobs ij
  where ij.source_adapter_id = v_platform_adapter_id
    and ij.target_table = 'platform.freshness_audit'
    and ij.started_at = v_started_at
  limit 1;

  return jsonb_build_object(
    'staleAfterDays', stale_after_days,
    'issuesCreated', v_issue_count,
    'issuesResolved', v_resolved_count
  );
end;
$$;

grant execute on function public.app_run_freshness_audit(integer) to service_role;

create or replace function public.app_queue_daily_refresh(run_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_started_at timestamptz := now();
  v_nse_adapter_id uuid;
  v_bse_adapter_id uuid;
  queued_count integer := 0;
begin
  select id into v_nse_adapter_id from admin.source_adapters where adapter_key = 'nse_eod' limit 1;
  select id into v_bse_adapter_id from admin.source_adapters where adapter_key = 'bse_bhavcopy' limit 1;

  if v_nse_adapter_id is not null then
    insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, note)
    values
      (v_nse_adapter_id, 'core.security_master.nse', 'queued', v_started_at, format('Queued NSE security master refresh for %s.', run_date)),
      (v_nse_adapter_id, 'market.ohlcv_daily.nse', 'queued', v_started_at, format('Queued NSE EOD market-data refresh for %s.', run_date))
    on conflict (source_adapter_id, target_table, started_at) do nothing;
    queued_count := queued_count + 2;
  end if;

  if v_bse_adapter_id is not null then
    insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, note)
    values
      (v_bse_adapter_id, 'core.security_master.bse', 'queued', v_started_at, format('Queued BSE security master refresh for %s.', run_date)),
      (v_bse_adapter_id, 'market.ohlcv_daily.bse', 'queued', v_started_at, format('Queued BSE EOD market-data refresh for %s.', run_date))
    on conflict (source_adapter_id, target_table, started_at) do nothing;
    queued_count := queued_count + 2;
  end if;

  return jsonb_build_object(
    'runDate', run_date,
    'queuedJobs', queued_count
  );
end;
$$;

grant execute on function public.app_queue_daily_refresh(date) to service_role;

create or replace function public.app_queue_filing_document(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_adapter_key text := coalesce(payload->>'adapterKey', 'mca_filings');
  v_adapter_label text := coalesce(payload->>'adapterLabel', 'MCA Filings');
  v_source_type text := coalesce(payload->>'sourceType', 'official');
  v_freshness text := coalesce(payload->>'freshnessExpectation', 'Filing-driven');
  v_symbol text := upper(coalesce(payload->>'symbol', ''));
  v_exchange text := upper(coalesce(payload->>'exchange', 'NSE'));
  v_document_kind text := coalesce(payload->>'documentKind', 'filing');
  v_parser_source_type text := coalesce(payload->>'parserSourceType', 'annual-report-ocr');
  v_input_path text := nullif(payload->>'inputPath', '');
  v_ocr_path text := nullif(payload->>'ocrPath', '');
  v_output_path text := nullif(payload->>'outputPath', '');
  v_normalized_output_path text := nullif(payload->>'normalizedOutputPath', '');
  v_source_adapter_id uuid;
  v_document_id uuid;
  v_metadata jsonb := coalesce(payload->'metadata', '{}'::jsonb);
begin
  if v_symbol = '' then
    raise exception 'symbol is required';
  end if;

  if v_exchange not in ('NSE', 'BSE') then
    v_exchange := 'NSE';
  end if;

  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values (v_adapter_key, v_adapter_label, v_source_type, v_freshness, true)
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_source_adapter_id;

  insert into admin.filing_documents (
    source_adapter_id, symbol, exchange, source_type, document_kind, status,
    input_path, ocr_path, output_path, normalized_output_path, metadata
  )
  values (
    v_source_adapter_id,
    v_symbol,
    v_exchange,
    v_parser_source_type,
    v_document_kind,
    'queued',
    v_input_path,
    v_ocr_path,
    v_output_path,
    v_normalized_output_path,
    v_metadata
  )
  returning id into v_document_id;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, note)
  values (
    v_source_adapter_id,
    'documents.' || lower(v_symbol) || '.' || replace(v_document_kind, ' ', '-'),
    'queued',
    now(),
    format('Queued %s document for %s:%s.', v_document_kind, v_exchange, v_symbol)
  );

  return jsonb_build_object(
    'documentId', v_document_id,
    'symbol', v_symbol,
    'exchange', v_exchange,
    'status', 'queued'
  );
end;
$$;

grant execute on function public.app_queue_filing_document(jsonb) to service_role;

create or replace function public.app_claim_filing_documents(limit_count integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  claimed_ids uuid[];
begin
  with candidates as (
    select fd.id
    from admin.filing_documents fd
    where fd.status = 'queued'
    order by fd.queued_at asc
    limit limit_count
    for update skip locked
  ),
  updated as (
    update admin.filing_documents fd
    set
      status = 'processing',
      processing_started_at = now(),
      updated_at = now()
    where fd.id in (select id from candidates)
    returning fd.id
  )
  select array_agg(id) into claimed_ids from updated;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', fd.id,
        'source', coalesce(sa.label, 'Unknown source'),
        'symbol', fd.symbol,
        'exchange', fd.exchange,
        'sourceType', fd.source_type,
        'documentKind', fd.document_kind,
        'inputPath', fd.input_path,
        'ocrPath', fd.ocr_path,
        'outputPath', fd.output_path,
        'normalizedOutputPath', fd.normalized_output_path,
        'metadata', fd.metadata
      )
    )
    from admin.filing_documents fd
    left join admin.source_adapters sa on sa.id = fd.source_adapter_id
    where claimed_ids is not null
      and fd.id = any(claimed_ids)
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.app_claim_filing_documents(integer) to service_role;

create or replace function public.app_complete_filing_document(
  document_id uuid,
  final_status text,
  result_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_document admin.filing_documents%rowtype;
  v_output_path text := nullif(result_payload->>'outputPath', '');
  v_normalized_output_path text := nullif(result_payload->>'normalizedOutputPath', '');
  v_error_message text := nullif(result_payload->>'errorMessage', '');
  v_push_status text := coalesce(result_payload->>'pushStatus', '');
begin
  update admin.filing_documents
  set
    status = final_status,
    output_path = coalesce(v_output_path, output_path),
    normalized_output_path = coalesce(v_normalized_output_path, normalized_output_path),
    error_message = coalesce(v_error_message, error_message),
    processing_finished_at = now(),
    updated_at = now(),
    metadata = metadata || coalesce(result_payload, '{}'::jsonb)
  where id = document_id
  returning * into v_document;

  if not found then
    raise exception 'document not found';
  end if;

  update admin.ingestion_jobs
  set
    status = case
      when final_status = 'completed' and v_push_status <> 'failed' then 'success'
      when final_status = 'failed' or v_push_status = 'failed' then 'warning'
      else status
    end,
    finished_at = now(),
    note = case
      when final_status = 'completed'
        then format('Processed %s document for %s:%s.', v_document.document_kind, v_document.exchange, v_document.symbol)
      else coalesce(v_error_message, format('Processing failed for %s:%s.', v_document.exchange, v_document.symbol))
    end
  where source_adapter_id = v_document.source_adapter_id
    and target_table = 'documents.' || lower(v_document.symbol) || '.' || replace(v_document.document_kind, ' ', '-')
    and status in ('queued', 'running', 'warning');

  insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
  select
    ij.id,
    case when final_status = 'completed' and v_push_status <> 'failed' then 'info' else 'warning' end,
    case
      when final_status = 'completed' then 'Document processing completed.'
      else 'Document processing failed.'
    end,
    result_payload
  from admin.ingestion_jobs ij
  where ij.source_adapter_id = v_document.source_adapter_id
    and ij.target_table = 'documents.' || lower(v_document.symbol) || '.' || replace(v_document.document_kind, ' ', '-')
  order by ij.started_at desc
  limit 1;

  return jsonb_build_object(
    'documentId', document_id,
    'status', final_status
  );
end;
$$;

grant execute on function public.app_complete_filing_document(uuid, text, jsonb) to service_role;

create or replace function public.app_ingest_fundamentals_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, core, fundamentals, analytics, admin
as $$
declare
  source_payload jsonb := coalesce(payload->'source', '{}'::jsonb);
  record_item jsonb;
  item jsonb;
  peer_symbol_item text;
  v_adapter_key text := coalesce(source_payload->>'adapterKey', 'mca_filings');
  v_adapter_label text := coalesce(source_payload->>'adapterLabel', 'MCA Filings');
  v_source_type text := coalesce(source_payload->>'sourceType', 'official');
  v_freshness text := coalesce(source_payload->>'freshnessExpectation', 'Quarterly / filing-driven');
  v_default_exchange text := upper(coalesce(source_payload->>'exchange', 'NSE'));
  v_started_at timestamptz := coalesce(nullif(source_payload->>'startedAt', '')::timestamptz, now());
  v_finished_at timestamptz := coalesce(nullif(source_payload->>'finishedAt', '')::timestamptz, now());
  v_status text := coalesce(source_payload->>'status', 'healthy');
  v_detail text := coalesce(source_payload->>'detail', 'Fundamentals refresh completed.');
  v_source_adapter_id uuid;
  v_ingestion_job_id uuid;
  v_company_id uuid;
  v_symbol text;
  v_exchange text;
  v_as_of_date date;
  v_headline text;
  v_peer_group_id uuid;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if v_default_exchange not in ('NSE', 'BSE') then
    v_default_exchange := 'NSE';
  end if;

  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values (v_adapter_key, v_adapter_label, v_source_type, v_freshness, true)
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_source_adapter_id;

  insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
  values (v_source_adapter_id, v_started_at, v_finished_at, v_status, v_detail)
  on conflict (source_adapter_id, started_at) do update set
    finished_at = excluded.finished_at,
    status = excluded.status,
    detail = excluded.detail;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
  values (
    v_source_adapter_id,
    'fundamentals.financial_statements_yearly',
    case when v_status in ('healthy', 'success') then 'success' else 'warning' end,
    v_started_at,
    v_finished_at,
    v_detail
  )
  on conflict (source_adapter_id, target_table, started_at) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    note = excluded.note
  returning id into v_ingestion_job_id;

  for record_item in
    select value from jsonb_array_elements(coalesce(payload->'records', '[]'::jsonb))
  loop
    v_symbol := upper(btrim(coalesce(record_item->>'symbol', '')));
    v_exchange := upper(btrim(coalesce(record_item->>'exchange', v_default_exchange)));
    v_as_of_date := coalesce(nullif(record_item->>'asOfDate', '')::date, current_date);

    if v_symbol = '' then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if v_exchange not in ('NSE', 'BSE') then
      v_exchange := v_default_exchange;
    end if;

    select s.company_id
    into v_company_id
    from core.symbols s
    where s.exchange = v_exchange
      and s.symbol = v_symbol
    limit 1;

    if v_company_id is null then
      skipped_count := skipped_count + 1;
      insert into admin.data_quality_issues (source_adapter_id, issue_type, detail, resolved)
      values (
        v_source_adapter_id,
        'unknown-symbol',
        format('No company found for %s:%s during fundamentals import.', v_exchange, v_symbol),
        false
      );
      continue;
    end if;

    for item in
      select value from jsonb_array_elements(coalesce(record_item->'yearlyFinancials', '[]'::jsonb))
    loop
      insert into fundamentals.financial_statements_yearly (
        company_id, fiscal_year, revenue_cr, ebitda_cr, pat_cr, operating_cash_flow_cr, filing_source,
        raw_payload, ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
      )
      values (
        v_company_id,
        item->>'period',
        nullif(item->>'revenueCr', '')::numeric,
        nullif(item->>'ebitdaCr', '')::numeric,
        nullif(item->>'patCr', '')::numeric,
        nullif(item->>'operatingCashFlowCr', '')::numeric,
        coalesce(item->>'filingSource', v_adapter_key),
        item,
        nullif(item->>'ebitdaMarginPct', '')::numeric,
        nullif(item->>'patMarginPct', '')::numeric,
        nullif(item->>'roePct', '')::numeric,
        nullif(item->>'rocePct', '')::numeric,
        nullif(item->>'netDebtToEbitda', '')::numeric
      )
      on conflict (company_id, fiscal_year) do update set
        revenue_cr = excluded.revenue_cr,
        ebitda_cr = excluded.ebitda_cr,
        pat_cr = excluded.pat_cr,
        operating_cash_flow_cr = excluded.operating_cash_flow_cr,
        filing_source = excluded.filing_source,
        raw_payload = excluded.raw_payload,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        pat_margin_pct = excluded.pat_margin_pct,
        roe_pct = excluded.roe_pct,
        roce_pct = excluded.roce_pct,
        net_debt_to_ebitda = excluded.net_debt_to_ebitda;
    end loop;

    for item in
      select value from jsonb_array_elements(coalesce(record_item->'quarterlyFinancials', '[]'::jsonb))
    loop
      insert into fundamentals.financial_statements_quarterly (
        company_id, fiscal_quarter, revenue_cr, ebitda_cr, pat_cr, raw_payload,
        ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
      )
      values (
        v_company_id,
        item->>'period',
        nullif(item->>'revenueCr', '')::numeric,
        nullif(item->>'ebitdaCr', '')::numeric,
        nullif(item->>'patCr', '')::numeric,
        item,
        nullif(item->>'ebitdaMarginPct', '')::numeric,
        nullif(item->>'patMarginPct', '')::numeric,
        nullif(item->>'roePct', '')::numeric,
        nullif(item->>'rocePct', '')::numeric,
        nullif(item->>'netDebtToEbitda', '')::numeric
      )
      on conflict (company_id, fiscal_quarter) do update set
        revenue_cr = excluded.revenue_cr,
        ebitda_cr = excluded.ebitda_cr,
        pat_cr = excluded.pat_cr,
        raw_payload = excluded.raw_payload,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        pat_margin_pct = excluded.pat_margin_pct,
        roe_pct = excluded.roe_pct,
        roce_pct = excluded.roce_pct,
        net_debt_to_ebitda = excluded.net_debt_to_ebitda;
    end loop;

    if record_item ? 'ratios' then
      insert into fundamentals.financial_ratios (
        company_id, as_of_date, roe_pct, roce_pct, ebitda_margin_pct, pat_margin_pct,
        net_debt_to_ebitda, pe_ratio, pb_ratio, revenue_growth_pct
      )
      values (
        v_company_id,
        v_as_of_date,
        nullif(record_item->'ratios'->>'roePct', '')::numeric,
        nullif(record_item->'ratios'->>'rocePct', '')::numeric,
        nullif(record_item->'ratios'->>'ebitdaMarginPct', '')::numeric,
        nullif(record_item->'ratios'->>'patMarginPct', '')::numeric,
        nullif(record_item->'ratios'->>'netDebtToEbitda', '')::numeric,
        nullif(record_item->'ratios'->>'peRatio', '')::numeric,
        nullif(record_item->'ratios'->>'pbRatio', '')::numeric,
        nullif(record_item->'ratios'->>'revenueGrowthPct', '')::numeric
      )
      on conflict (company_id, as_of_date) do update set
        roe_pct = excluded.roe_pct,
        roce_pct = excluded.roce_pct,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        pat_margin_pct = excluded.pat_margin_pct,
        net_debt_to_ebitda = excluded.net_debt_to_ebitda,
        pe_ratio = excluded.pe_ratio,
        pb_ratio = excluded.pb_ratio,
        revenue_growth_pct = excluded.revenue_growth_pct;
    end if;

    for item in
      select value from jsonb_array_elements(coalesce(record_item->'segmentMix', '[]'::jsonb))
    loop
      insert into fundamentals.segment_revenues (company_id, as_of_period, segment_name, revenue_share_pct)
      values (
        v_company_id,
        coalesce(item->>'asOfPeriod', coalesce(record_item->>'segmentAsOfPeriod', 'TTM')),
        item->>'label',
        coalesce((item->>'valuePct')::numeric, 0)
      )
      on conflict (company_id, as_of_period, segment_name) do update set
        revenue_share_pct = excluded.revenue_share_pct;
    end loop;

    for item in
      select value from jsonb_array_elements(coalesce(record_item->'geographyMix', '[]'::jsonb))
    loop
      insert into fundamentals.geo_revenues (company_id, as_of_period, geography_name, revenue_share_pct)
      values (
        v_company_id,
        coalesce(item->>'asOfPeriod', coalesce(record_item->>'geographyAsOfPeriod', 'TTM')),
        item->>'label',
        coalesce((item->>'valuePct')::numeric, 0)
      )
      on conflict (company_id, as_of_period, geography_name) do update set
        revenue_share_pct = excluded.revenue_share_pct;
    end loop;

    for item in
      select value from jsonb_array_elements(coalesce(record_item->'businessNotes', '[]'::jsonb))
    loop
      insert into fundamentals.business_notes (company_id, source_kind, source_url, note, source_excerpt)
      values (
        v_company_id,
        coalesce(item->>'sourceKind', v_adapter_key),
        nullif(item->>'sourceUrl', ''),
        item->>'note',
        item->>'sourceExcerpt'
      )
      on conflict (company_id, source_kind, note) do update set
        source_url = excluded.source_url,
        source_excerpt = excluded.source_excerpt;
    end loop;

    if nullif(record_item->>'peerGroupSlug', '') is not null then
      insert into fundamentals.peer_groups (slug, label)
      values (
        record_item->>'peerGroupSlug',
        coalesce(record_item->>'peerGroupLabel', record_item->>'peerGroupSlug')
      )
      on conflict (slug) do update set
        label = excluded.label
      returning id into v_peer_group_id;

      insert into fundamentals.peer_group_members (peer_group_id, company_id)
      values (v_peer_group_id, v_company_id)
      on conflict do nothing;

      for peer_symbol_item in
        select value from jsonb_array_elements_text(coalesce(record_item->'peerMembers', '[]'::jsonb))
      loop
        insert into fundamentals.peer_group_members (peer_group_id, company_id)
        select v_peer_group_id, s.company_id
        from core.symbols s
        where s.symbol = upper(peer_symbol_item)
          and s.is_primary = true
        on conflict do nothing;
      end loop;
    end if;

    select trim(both ' ' from concat_ws(
      ' ',
      case
        when record_item ? 'ratios' and nullif(record_item->'ratios'->>'revenueGrowthPct', '') is not null
          then 'Revenue growth ' || (record_item->'ratios'->>'revenueGrowthPct') || '%.'
        else null
      end,
      case
        when record_item ? 'ratios' and nullif(record_item->'ratios'->>'roePct', '') is not null
          then 'ROE ' || (record_item->'ratios'->>'roePct') || '%.'
        else null
      end,
      case
        when jsonb_array_length(coalesce(record_item->'businessNotes', '[]'::jsonb)) > 0
          then coalesce(record_item->'businessNotes'->0->>'note', null)
        else null
      end
    ))
    into v_headline;

    update analytics.company_snapshots_daily cs
    set fundamentals_headline = coalesce(nullif(v_headline, ''), cs.fundamentals_headline)
    where cs.company_id = v_company_id
      and cs.snapshot_date = (
        select max(snapshot_date)
        from analytics.company_snapshots_daily
        where company_id = v_company_id
      );

    inserted_count := inserted_count + 1;
  end loop;

  if v_ingestion_job_id is not null then
    insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
    values (
      v_ingestion_job_id,
      case when v_status in ('healthy', 'success') then 'info' else 'warning' end,
      'Fundamentals refresh processed company records.',
      jsonb_build_object(
        'adapterKey', v_adapter_key,
        'recordsProcessed', inserted_count,
        'recordsSkipped', skipped_count
      )
    );
  end if;

  return jsonb_build_object(
    'adapterKey', v_adapter_key,
    'recordsProcessed', inserted_count,
    'recordsSkipped', skipped_count,
    'status', v_status
  );
end;
$$;

grant execute on function public.app_ingest_fundamentals_payload(jsonb) to service_role;

create or replace function public.app_ingest_symbol_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, core, market, fundamentals, news, analytics, strategy, admin
as $$
declare
  company_payload jsonb := coalesce(payload->'company', '{}'::jsonb);
  snapshot_payload jsonb := coalesce(payload->'snapshot', '{}'::jsonb);
  ratios_payload jsonb := coalesce(payload->'ratios', '{}'::jsonb);
  technical_payload jsonb := coalesce(payload->'technical', '{}'::jsonb);
  behavior_payload jsonb := coalesce(payload->'behavior', '{}'::jsonb);
  admin_payload jsonb := coalesce(payload->'admin', '{}'::jsonb);
  item jsonb;
  strategy_item jsonb;
  scenario_item jsonb;
  pattern_item jsonb;
  level_item jsonb;
  note_item jsonb;
  news_item jsonb;
  news_entity_item jsonb;
  event_item jsonb;
  v_symbol text := upper(coalesce(company_payload->>'symbol', ''));
  v_exchange text := upper(coalesce(company_payload->>'exchange', 'NSE'));
  v_yahoo_symbol text := company_payload->>'yahooSymbol';
  v_company_name text := coalesce(company_payload->>'displayName', company_payload->>'legalName', v_symbol);
  v_legal_name text := coalesce(company_payload->>'legalName', v_company_name);
  v_company_slug text := coalesce(
    nullif(company_payload->>'slug', ''),
    trim(both '-' from regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g'))
  );
  v_sector_name text := nullif(company_payload->>'sector', '');
  v_sector_slug text := case
    when company_payload ? 'sectorSlug' then nullif(company_payload->>'sectorSlug', '')
    when company_payload ? 'sector' then trim(both '-' from regexp_replace(lower(company_payload->>'sector'), '[^a-z0-9]+', '-', 'g'))
    else null
  end;
  v_industry_name text := nullif(company_payload->>'industry', '');
  v_industry_slug text := case
    when company_payload ? 'industrySlug' then nullif(company_payload->>'industrySlug', '')
    when company_payload ? 'industry' then trim(both '-' from regexp_replace(lower(company_payload->>'industry'), '[^a-z0-9]+', '-', 'g'))
    else null
  end;
  v_sector_id uuid;
  v_industry_id uuid;
  v_company_id uuid;
  v_source_adapter_id uuid;
  v_strategy_id uuid;
  v_news_article_id uuid;
  v_ingestion_job_id uuid;
  v_snapshot_date date := nullif(snapshot_payload->>'date', '')::date;
  v_price_date date := coalesce(nullif(technical_payload->>'priceDate', '')::date, v_snapshot_date);
  v_as_of_date date := coalesce(nullif(ratios_payload->>'asOfDate', '')::date, v_snapshot_date);
  v_started_at timestamptz := coalesce(nullif(admin_payload->>'startedAt', '')::timestamptz, now());
  v_finished_at timestamptz := coalesce(nullif(admin_payload->>'finishedAt', '')::timestamptz, now());
  v_source_run_status text := coalesce(admin_payload->>'sourceRunStatus', 'healthy');
  v_source_run_detail text := coalesce(admin_payload->>'sourceRunDetail', 'On-demand symbol ingestion completed.');
  v_job_status text := coalesce(admin_payload->>'jobStatus', 'success');
  v_job_note text := coalesce(admin_payload->>'jobNote', 'On-demand symbol ingestion completed.');
begin
  if v_symbol = '' then
    raise exception 'company.symbol is required';
  end if;

  if v_exchange not in ('NSE', 'BSE') then
    v_exchange := 'NSE';
  end if;

  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values (
    coalesce(admin_payload->>'adapterKey', 'yahoo_finance'),
    coalesce(admin_payload->>'adapterLabel', 'Yahoo Finance'),
    coalesce(admin_payload->>'sourceType', 'public-unofficial'),
    coalesce(admin_payload->>'freshnessExpectation', 'On-demand / EOD refresh'),
    true
  )
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_source_adapter_id;

  if v_sector_name is not null and v_sector_slug is not null then
    insert into core.sectors (name, slug)
    values (v_sector_name, v_sector_slug)
    on conflict (slug) do update set name = excluded.name
    returning id into v_sector_id;
  end if;

  if v_industry_name is not null and v_industry_slug is not null and v_sector_id is not null then
    insert into core.industries (sector_id, name, slug)
    values (v_sector_id, v_industry_name, v_industry_slug)
    on conflict (sector_id, slug) do update set name = excluded.name
    returning id into v_industry_id;
  end if;

  insert into core.companies (
    legal_name,
    display_name,
    slug,
    isin,
    sector_id,
    industry_id,
    business_summary,
    website_url,
    ir_url,
    status,
    updated_at
  )
  values (
    v_legal_name,
    v_company_name,
    v_company_slug,
    nullif(company_payload->>'isin', ''),
    v_sector_id,
    v_industry_id,
    nullif(company_payload->>'businessSummary', ''),
    nullif(company_payload->>'websiteUrl', ''),
    nullif(company_payload->>'irUrl', ''),
    'active',
    now()
  )
  on conflict (slug) do update set
    legal_name = excluded.legal_name,
    display_name = excluded.display_name,
    isin = coalesce(excluded.isin, core.companies.isin),
    sector_id = coalesce(excluded.sector_id, core.companies.sector_id),
    industry_id = coalesce(excluded.industry_id, core.companies.industry_id),
    business_summary = coalesce(excluded.business_summary, core.companies.business_summary),
    website_url = coalesce(excluded.website_url, core.companies.website_url),
    ir_url = coalesce(excluded.ir_url, core.companies.ir_url),
    updated_at = now()
  returning id into v_company_id;

  insert into core.symbols (company_id, exchange, symbol, is_primary)
  values (v_company_id, v_exchange, v_symbol, true)
  on conflict (exchange, symbol) do update set
    company_id = excluded.company_id,
    is_primary = true;

  if v_yahoo_symbol is not null then
    insert into fundamentals.business_notes (company_id, source_kind, source_url, note, source_excerpt)
    values (
      v_company_id,
      'market-data-provider',
      'https://finance.yahoo.com/quote/' || v_yahoo_symbol,
      'On-demand market snapshot sourced through Yahoo Finance for symbol ' || v_yahoo_symbol || '.',
      'The platform refreshes this symbol on demand and stores the normalized output in Supabase.'
    )
    on conflict do nothing;
  end if;

  insert into core.company_search (company_id, search_text, updated_at)
  values (
    v_company_id,
    concat_ws(' ', v_company_name, v_symbol, coalesce(v_sector_name, ''), coalesce(v_industry_name, ''), coalesce(v_yahoo_symbol, '')),
    now()
  )
  on conflict (company_id) do update set
    search_text = excluded.search_text,
    updated_at = now();

  if v_snapshot_date is not null then
    insert into analytics.company_snapshots_daily (
      company_id, snapshot_date, close, day_change_pct, market_cap_cr, one_year_return_pct,
      summary_tags, fundamentals_headline, technical_summary, technical_events, behavior_narrative
    )
    values (
      v_company_id,
      v_snapshot_date,
      coalesce((snapshot_payload->>'close')::numeric, 0),
      coalesce((snapshot_payload->>'dayChangePct')::numeric, 0),
      coalesce((snapshot_payload->>'marketCapCr')::numeric, 0),
      nullif(snapshot_payload->>'oneYearReturnPct', '')::numeric,
      coalesce(snapshot_payload->'summaryTags', '[]'::jsonb),
      snapshot_payload->>'fundamentalsHeadline',
      snapshot_payload->>'technicalSummary',
      coalesce(snapshot_payload->'technicalEvents', '[]'::jsonb),
      snapshot_payload->>'behaviorNarrative'
    )
    on conflict (company_id, snapshot_date) do update set
      close = excluded.close,
      day_change_pct = excluded.day_change_pct,
      market_cap_cr = excluded.market_cap_cr,
      one_year_return_pct = excluded.one_year_return_pct,
      summary_tags = excluded.summary_tags,
      fundamentals_headline = excluded.fundamentals_headline,
      technical_summary = excluded.technical_summary,
      technical_events = excluded.technical_events,
      behavior_narrative = excluded.behavior_narrative;
  end if;

  if v_as_of_date is not null then
    insert into fundamentals.financial_ratios (
      company_id, as_of_date, roe_pct, roce_pct, ebitda_margin_pct, pat_margin_pct,
      net_debt_to_ebitda, pe_ratio, pb_ratio, revenue_growth_pct
    )
    values (
      v_company_id,
      v_as_of_date,
      nullif(ratios_payload->>'roePct', '')::numeric,
      nullif(ratios_payload->>'rocePct', '')::numeric,
      nullif(ratios_payload->>'ebitdaMarginPct', '')::numeric,
      nullif(ratios_payload->>'patMarginPct', '')::numeric,
      nullif(ratios_payload->>'netDebtToEbitda', '')::numeric,
      nullif(ratios_payload->>'peRatio', '')::numeric,
      nullif(ratios_payload->>'pbRatio', '')::numeric,
      nullif(ratios_payload->>'revenueGrowthPct', '')::numeric
    )
    on conflict (company_id, as_of_date) do update set
      roe_pct = excluded.roe_pct,
      roce_pct = excluded.roce_pct,
      ebitda_margin_pct = excluded.ebitda_margin_pct,
      pat_margin_pct = excluded.pat_margin_pct,
      net_debt_to_ebitda = excluded.net_debt_to_ebitda,
      pe_ratio = excluded.pe_ratio,
      pb_ratio = excluded.pb_ratio,
      revenue_growth_pct = excluded.revenue_growth_pct;
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(payload->'yearlyFinancials', '[]'::jsonb))
  loop
    insert into fundamentals.financial_statements_yearly (
      company_id, fiscal_year, revenue_cr, ebitda_cr, pat_cr, operating_cash_flow_cr, filing_source,
      raw_payload, ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
    )
    values (
      v_company_id,
      item->>'period',
      nullif(item->>'revenueCr', '')::numeric,
      nullif(item->>'ebitdaCr', '')::numeric,
      nullif(item->>'patCr', '')::numeric,
      nullif(item->>'operatingCashFlowCr', '')::numeric,
      coalesce(item->>'filingSource', 'yahoo-finance-on-demand'),
      item,
      nullif(item->>'ebitdaMarginPct', '')::numeric,
      nullif(item->>'patMarginPct', '')::numeric,
      nullif(item->>'roePct', '')::numeric,
      nullif(item->>'rocePct', '')::numeric,
      nullif(item->>'netDebtToEbitda', '')::numeric
    )
    on conflict (company_id, fiscal_year) do update set
      revenue_cr = excluded.revenue_cr,
      ebitda_cr = excluded.ebitda_cr,
      pat_cr = excluded.pat_cr,
      operating_cash_flow_cr = excluded.operating_cash_flow_cr,
      filing_source = excluded.filing_source,
      raw_payload = excluded.raw_payload,
      ebitda_margin_pct = excluded.ebitda_margin_pct,
      pat_margin_pct = excluded.pat_margin_pct,
      roe_pct = excluded.roe_pct,
      roce_pct = excluded.roce_pct,
      net_debt_to_ebitda = excluded.net_debt_to_ebitda;
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(payload->'quarterlyFinancials', '[]'::jsonb))
  loop
    insert into fundamentals.financial_statements_quarterly (
      company_id, fiscal_quarter, revenue_cr, ebitda_cr, pat_cr, raw_payload,
      ebitda_margin_pct, pat_margin_pct, roe_pct, roce_pct, net_debt_to_ebitda
    )
    values (
      v_company_id,
      item->>'period',
      nullif(item->>'revenueCr', '')::numeric,
      nullif(item->>'ebitdaCr', '')::numeric,
      nullif(item->>'patCr', '')::numeric,
      item,
      nullif(item->>'ebitdaMarginPct', '')::numeric,
      nullif(item->>'patMarginPct', '')::numeric,
      nullif(item->>'roePct', '')::numeric,
      nullif(item->>'rocePct', '')::numeric,
      nullif(item->>'netDebtToEbitda', '')::numeric
    )
    on conflict (company_id, fiscal_quarter) do update set
      revenue_cr = excluded.revenue_cr,
      ebitda_cr = excluded.ebitda_cr,
      pat_cr = excluded.pat_cr,
      raw_payload = excluded.raw_payload,
      ebitda_margin_pct = excluded.ebitda_margin_pct,
      pat_margin_pct = excluded.pat_margin_pct,
      roe_pct = excluded.roe_pct,
      roce_pct = excluded.roce_pct,
      net_debt_to_ebitda = excluded.net_debt_to_ebitda;
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(payload->'segmentMix', '[]'::jsonb))
  loop
    insert into fundamentals.segment_revenues (company_id, as_of_period, segment_name, revenue_share_pct)
    values (
      v_company_id,
      coalesce(item->>'asOfPeriod', coalesce(payload->>'segmentAsOfPeriod', 'TTM')),
      item->>'label',
      coalesce((item->>'valuePct')::numeric, 0)
    )
    on conflict do nothing;
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(payload->'geographyMix', '[]'::jsonb))
  loop
    insert into fundamentals.geo_revenues (company_id, as_of_period, geography_name, revenue_share_pct)
    values (
      v_company_id,
      coalesce(item->>'asOfPeriod', coalesce(payload->>'geographyAsOfPeriod', 'TTM')),
      item->>'label',
      coalesce((item->>'valuePct')::numeric, 0)
    )
    on conflict do nothing;
  end loop;

  for note_item in
    select value from jsonb_array_elements(coalesce(payload->'businessNotes', '[]'::jsonb))
  loop
    insert into fundamentals.business_notes (company_id, source_kind, source_url, note, source_excerpt)
    values (
      v_company_id,
      coalesce(note_item->>'sourceKind', 'market-data-provider'),
      nullif(note_item->>'sourceUrl', ''),
      note_item->>'note',
      note_item->>'sourceExcerpt'
    )
    on conflict do nothing;
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(payload->'prices', '[]'::jsonb))
  loop
    insert into market.ohlcv_daily (company_id, price_date, open, high, low, close, volume, source)
    values (
      v_company_id,
      (item->>'date')::date,
      coalesce((item->>'open')::numeric, 0),
      coalesce((item->>'high')::numeric, 0),
      coalesce((item->>'low')::numeric, 0),
      coalesce((item->>'close')::numeric, 0),
      coalesce((item->>'volume')::bigint, 0),
      coalesce(item->>'source', 'yahoo-finance-on-demand')
    )
    on conflict (company_id, price_date) do update set
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      source = excluded.source;
  end loop;

  if v_price_date is not null then
    insert into market.technical_indicators_daily (
      company_id, price_date, sma_20, sma_50, sma_200, rsi_14, macd, atr_14, vwap
    )
    values (
      v_company_id,
      v_price_date,
      nullif(technical_payload->>'sma20', '')::numeric,
      nullif(technical_payload->>'sma50', '')::numeric,
      nullif(technical_payload->>'sma200', '')::numeric,
      nullif(technical_payload->>'rsi14', '')::numeric,
      nullif(technical_payload->>'macd', '')::numeric,
      nullif(technical_payload->>'atr14', '')::numeric,
      nullif(technical_payload->>'vwap', '')::numeric
    )
    on conflict (company_id, price_date) do update set
      sma_20 = excluded.sma_20,
      sma_50 = excluded.sma_50,
      sma_200 = excluded.sma_200,
      rsi_14 = excluded.rsi_14,
      macd = excluded.macd,
      atr_14 = excluded.atr_14,
      vwap = excluded.vwap;

    insert into market.trend_states (company_id, price_date, timeframe, trend_state, explanation)
    values (
      v_company_id,
      v_price_date,
      'daily',
      coalesce(technical_payload->>'trendState', 'Constructive'),
      technical_payload->>'trendExplanation'
    )
    on conflict (company_id, price_date, timeframe) do update set
      trend_state = excluded.trend_state,
      explanation = excluded.explanation;
  end if;

  for level_item in
    select value from jsonb_array_elements(coalesce(technical_payload->'priceLevels', '[]'::jsonb))
  loop
    insert into market.price_levels (company_id, as_of_date, label, value, reason)
    values (
      v_company_id,
      coalesce(v_price_date, current_date),
      level_item->>'label',
      coalesce((level_item->>'value')::numeric, 0),
      level_item->>'reason'
    )
    on conflict (company_id, as_of_date, label) do update set
      value = excluded.value,
      reason = excluded.reason;
  end loop;

  for news_item in
    select value from jsonb_array_elements(coalesce(payload->'news', '[]'::jsonb))
  loop
    insert into news.news_articles (
      headline, source_name, published_at, canonical_url, summary, article_body, raw_payload
    )
    values (
      news_item->>'headline',
      coalesce(news_item->>'sourceName', 'Yahoo Finance'),
      coalesce(nullif(news_item->>'publishedAt', '')::timestamptz, now()),
      coalesce(nullif(news_item->>'canonicalUrl', ''), 'yahoo:' || v_symbol || ':' || md5(coalesce(news_item->>'headline', '') || coalesce(news_item->>'publishedAt', ''))),
      news_item->>'summary',
      news_item->>'articleBody',
      news_item
    )
    on conflict (canonical_url) do update set
      headline = excluded.headline,
      source_name = excluded.source_name,
      published_at = excluded.published_at,
      summary = excluded.summary,
      article_body = excluded.article_body,
      raw_payload = excluded.raw_payload
    returning id into v_news_article_id;

    insert into news.stock_news_links (
      news_article_id, company_id, impact_direction, impact_score, relevance, sentiment, why_it_matters
    )
    values (
      v_news_article_id,
      v_company_id,
      news_item->>'impactDirection',
      nullif(news_item->>'impactScore', '')::numeric,
      news_item->>'relevance',
      news_item->>'sentiment',
      news_item->>'whyItMatters'
    )
    on conflict (news_article_id, company_id) do update set
      impact_direction = excluded.impact_direction,
      impact_score = excluded.impact_score,
      relevance = excluded.relevance,
      sentiment = excluded.sentiment,
      why_it_matters = excluded.why_it_matters;

    delete from news.news_entities
    where news_article_id = v_news_article_id;

    for news_entity_item in
      select value from jsonb_array_elements(coalesce(news_item->'entities', '[]'::jsonb))
    loop
      insert into news.news_entities (news_article_id, entity_type, entity_name, relevance_score)
      values (
        v_news_article_id,
        coalesce(nullif(news_entity_item->>'entityType', ''), 'topic'),
        coalesce(nullif(news_entity_item->>'entityName', ''), 'Unspecified'),
        nullif(news_entity_item->>'relevanceScore', '')::numeric
      );
    end loop;
  end loop;

  for event_item in
    select value from jsonb_array_elements(coalesce(payload->'events', '[]'::jsonb))
  loop
    insert into news.event_calendar (company_id, event_title, event_type, event_date, note)
    values (
      v_company_id,
      event_item->>'title',
      coalesce(event_item->>'eventType', event_item->>'category', 'Event'),
      (event_item->>'eventDate')::date,
      event_item->>'note'
    )
    on conflict (company_id, event_title, event_date) do update set
      event_type = excluded.event_type,
      note = excluded.note;
  end loop;

  if v_price_date is not null then
    insert into analytics.stock_behavior_daily (
      company_id, price_date, momentum_sensitivity, acceleration_score, trend_decay_score,
      volatility_sensitivity, market_linkage_score, regime_label, macro_regime,
      market_context_summary, benchmark_symbol, benchmark_return_pct, relative_strength_pct,
      context_signals, narrative
    )
    values (
      v_company_id,
      v_price_date,
      nullif(behavior_payload->>'momentumSensitivity', '')::numeric,
      nullif(behavior_payload->>'accelerationScore', '')::numeric,
      nullif(behavior_payload->>'trendDecayScore', '')::numeric,
      nullif(behavior_payload->>'volatilitySensitivity', '')::numeric,
      nullif(behavior_payload->>'marketLinkageScore', '')::numeric,
      nullif(behavior_payload->>'regimeLabel', ''),
      nullif(behavior_payload->>'macroRegime', ''),
      nullif(behavior_payload->>'marketContextSummary', ''),
      nullif(behavior_payload->>'benchmarkSymbol', ''),
      nullif(behavior_payload->>'benchmarkReturnPct', '')::numeric,
      nullif(behavior_payload->>'relativeStrengthPct', '')::numeric,
      coalesce(behavior_payload->'contextSignals', '[]'::jsonb),
      behavior_payload->>'narrative'
    )
    on conflict (company_id, price_date) do update set
      momentum_sensitivity = excluded.momentum_sensitivity,
      acceleration_score = excluded.acceleration_score,
      trend_decay_score = excluded.trend_decay_score,
      volatility_sensitivity = excluded.volatility_sensitivity,
      market_linkage_score = excluded.market_linkage_score,
      regime_label = excluded.regime_label,
      macro_regime = excluded.macro_regime,
      market_context_summary = excluded.market_context_summary,
      benchmark_symbol = excluded.benchmark_symbol,
      benchmark_return_pct = excluded.benchmark_return_pct,
      relative_strength_pct = excluded.relative_strength_pct,
      context_signals = excluded.context_signals,
      narrative = excluded.narrative;
  end if;

  for strategy_item in
    select value from jsonb_array_elements(coalesce(payload->'strategies', '[]'::jsonb))
  loop
    insert into strategy.strategy_definitions (slug, label, category, description, ruleset)
    values (
      coalesce(
        nullif(strategy_item->>'slug', ''),
        trim(both '-' from regexp_replace(lower(coalesce(strategy_item->>'strategyName', 'strategy')), '[^a-z0-9]+', '-', 'g'))
      ),
      strategy_item->>'strategyName',
      coalesce(strategy_item->>'category', 'technical'),
      coalesce(strategy_item->>'description', strategy_item->>'strategyName', 'On-demand strategy'),
      coalesce(strategy_item->'ruleset', '{}'::jsonb)
    )
    on conflict (slug) do update set label = excluded.label
    returning id into v_strategy_id;

    insert into strategy.strategy_evaluations (
      strategy_id, company_id, evaluation_date, matched, confidence_pct, source_snapshot_date,
      matched_rule_count, total_rule_count, support_quality, provenance_note, invalidation, support_points, explanation
    )
    values (
      v_strategy_id,
      v_company_id,
      coalesce(nullif(strategy_item->>'evaluationDate', '')::date, v_snapshot_date, current_date),
      coalesce((strategy_item->>'matched')::boolean, false),
      coalesce((strategy_item->>'confidencePct')::numeric, 0),
      coalesce(nullif(strategy_item->>'sourceSnapshotDate', '')::date, v_snapshot_date, current_date),
      nullif(strategy_item->>'matchedRuleCount', '')::integer,
      nullif(strategy_item->>'totalRuleCount', '')::integer,
      nullif(strategy_item->>'supportQuality', ''),
      strategy_item->>'provenanceNote',
      strategy_item->>'invalidation',
      coalesce(strategy_item->'supportPoints', '[]'::jsonb),
      strategy_item->>'explanation'
    )
    on conflict (strategy_id, company_id, evaluation_date) do update set
      matched = excluded.matched,
      confidence_pct = excluded.confidence_pct,
      source_snapshot_date = excluded.source_snapshot_date,
      matched_rule_count = excluded.matched_rule_count,
      total_rule_count = excluded.total_rule_count,
      support_quality = excluded.support_quality,
      provenance_note = excluded.provenance_note,
      invalidation = excluded.invalidation,
      support_points = excluded.support_points,
      explanation = excluded.explanation;
  end loop;

  for scenario_item in
    select value from jsonb_array_elements(coalesce(payload->'scenarios', '[]'::jsonb))
  loop
    insert into strategy.scenario_outputs (
      company_id, evaluation_date, stance, title, confidence_pct, source_snapshot_date, provenance_note,
      trigger_condition, invalidation, payoff_frame, explanation
    )
    values (
      v_company_id,
      coalesce(nullif(scenario_item->>'evaluationDate', '')::date, v_snapshot_date, current_date),
      scenario_item->>'stance',
      scenario_item->>'title',
      coalesce((scenario_item->>'confidencePct')::numeric, 0),
      coalesce(nullif(scenario_item->>'sourceSnapshotDate', '')::date, v_snapshot_date, current_date),
      scenario_item->>'provenanceNote',
      scenario_item->>'triggerCondition',
      scenario_item->>'invalidation',
      scenario_item->>'payoffFrame',
      scenario_item->>'explanation'
    )
    on conflict (company_id, evaluation_date, stance, title) do update set
      confidence_pct = excluded.confidence_pct,
      source_snapshot_date = excluded.source_snapshot_date,
      provenance_note = excluded.provenance_note,
      trigger_condition = excluded.trigger_condition,
      invalidation = excluded.invalidation,
      payoff_frame = excluded.payoff_frame,
      explanation = excluded.explanation;
  end loop;

  for pattern_item in
    select value from jsonb_array_elements(coalesce(payload->'patterns', '[]'::jsonb))
  loop
    insert into strategy.pattern_matches (
      company_id, price_date, pattern_name, confidence_pct, note, similar_cases
    )
    values (
      v_company_id,
      coalesce(nullif(pattern_item->>'priceDate', '')::date, v_price_date, current_date),
      pattern_item->>'patternName',
      coalesce((pattern_item->>'confidencePct')::numeric, 0),
      pattern_item->>'note',
      coalesce(pattern_item->'similarCases', '[]'::jsonb)
    )
    on conflict (company_id, price_date, pattern_name) do update set
      confidence_pct = excluded.confidence_pct,
      note = excluded.note,
      similar_cases = excluded.similar_cases;
  end loop;

  insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
  values (v_source_adapter_id, v_started_at, v_finished_at, v_source_run_status, v_source_run_detail)
  on conflict (source_adapter_id, started_at) do update set
    finished_at = excluded.finished_at,
    status = excluded.status,
    detail = excluded.detail;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
  values (
    v_source_adapter_id,
    'on-demand.symbol.' || lower(v_symbol),
    v_job_status,
    v_started_at,
    v_finished_at,
    v_job_note
  )
  on conflict (source_adapter_id, target_table, started_at) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    note = excluded.note;

  select ij.id
  into v_ingestion_job_id
  from admin.ingestion_jobs ij
  where ij.source_adapter_id = v_source_adapter_id
    and ij.target_table = 'on-demand.symbol.' || lower(v_symbol)
    and ij.started_at = v_started_at
  limit 1;

  if v_ingestion_job_id is not null then
    insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
    values (
      v_ingestion_job_id,
      case when v_job_status = 'warning' then 'warning' else 'info' end,
      'Symbol payload ingested through public.app_ingest_symbol_payload.',
      jsonb_build_object(
        'symbol', v_symbol,
        'exchange', v_exchange,
        'snapshotDate', v_snapshot_date,
        'sourceAdapter', coalesce(admin_payload->>'adapterKey', 'yahoo_finance')
      )
    );
  end if;

  return jsonb_build_object(
    'symbol', v_symbol,
    'exchange', v_exchange,
    'companySlug', v_company_slug,
    'companyId', v_company_id,
    'snapshotDate', v_snapshot_date,
    'ingested', true
  );
end;
$$;

grant execute on function public.app_ingest_symbol_payload(jsonb) to service_role;

create or replace function public.app_refresh_security_master(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, core, admin
as $$
declare
  source_payload jsonb := coalesce(payload->'source', '{}'::jsonb);
  record_item jsonb;
  v_adapter_key text := coalesce(source_payload->>'adapterKey', 'nse_eod');
  v_adapter_label text := coalesce(source_payload->>'adapterLabel', 'NSE Security Master');
  v_source_type text := coalesce(source_payload->>'sourceType', 'official');
  v_freshness text := coalesce(source_payload->>'freshnessExpectation', 'Daily directory refresh');
  v_default_exchange text := upper(coalesce(source_payload->>'exchange', 'NSE'));
  v_started_at timestamptz := coalesce(nullif(source_payload->>'startedAt', '')::timestamptz, now());
  v_finished_at timestamptz := coalesce(nullif(source_payload->>'finishedAt', '')::timestamptz, now());
  v_status text := coalesce(source_payload->>'status', 'healthy');
  v_detail text := coalesce(source_payload->>'detail', 'Security master refresh completed.');
  v_source_adapter_id uuid;
  v_ingestion_job_id uuid;
  v_sector_name text;
  v_sector_slug text;
  v_industry_name text;
  v_industry_slug text;
  v_display_name text;
  v_legal_name text;
  v_company_slug text;
  v_exchange text;
  v_symbol text;
  v_isin text;
  v_business_summary text;
  v_website_url text;
  v_ir_url text;
  v_sector_id uuid;
  v_industry_id uuid;
  v_company_id uuid;
  inserted_count integer := 0;
begin
  if v_default_exchange not in ('NSE', 'BSE') then
    v_default_exchange := 'NSE';
  end if;

  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values (v_adapter_key, v_adapter_label, v_source_type, v_freshness, true)
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_source_adapter_id;

  insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
  values (v_source_adapter_id, v_started_at, v_finished_at, v_status, v_detail)
  on conflict (source_adapter_id, started_at) do update set
    finished_at = excluded.finished_at,
    status = excluded.status,
    detail = excluded.detail;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
  values (
    v_source_adapter_id,
    'core.security_master',
    case when v_status in ('healthy', 'success') then 'success' else 'warning' end,
    v_started_at,
    v_finished_at,
    v_detail
  )
  on conflict (source_adapter_id, target_table, started_at) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    note = excluded.note
  returning id into v_ingestion_job_id;

  for record_item in
    select value from jsonb_array_elements(coalesce(payload->'records', '[]'::jsonb))
  loop
    v_display_name := btrim(coalesce(record_item->>'displayName', record_item->>'companyName', record_item->>'legalName', ''));
    v_legal_name := btrim(coalesce(record_item->>'legalName', v_display_name));
    v_symbol := upper(btrim(coalesce(record_item->>'symbol', '')));
    v_exchange := upper(btrim(coalesce(record_item->>'exchange', v_default_exchange)));
    v_isin := nullif(btrim(coalesce(record_item->>'isin', '')), '');
    v_business_summary := nullif(btrim(coalesce(record_item->>'businessSummary', '')), '');
    v_website_url := nullif(btrim(coalesce(record_item->>'websiteUrl', '')), '');
    v_ir_url := nullif(btrim(coalesce(record_item->>'irUrl', '')), '');

    if v_display_name = '' or v_symbol = '' then
      continue;
    end if;

    if v_exchange not in ('NSE', 'BSE') then
      v_exchange := v_default_exchange;
    end if;

    v_sector_name := nullif(btrim(coalesce(record_item->>'sector', '')), '');
    v_sector_slug := case
      when record_item ? 'sectorSlug' then nullif(btrim(record_item->>'sectorSlug'), '')
      when v_sector_name is not null then trim(both '-' from regexp_replace(lower(v_sector_name), '[^a-z0-9]+', '-', 'g'))
      else null
    end;

    v_industry_name := nullif(btrim(coalesce(record_item->>'industry', '')), '');
    v_industry_slug := case
      when record_item ? 'industrySlug' then nullif(btrim(record_item->>'industrySlug'), '')
      when v_industry_name is not null then trim(both '-' from regexp_replace(lower(v_industry_name), '[^a-z0-9]+', '-', 'g'))
      else null
    end;

    v_company_slug := coalesce(
      nullif(btrim(coalesce(record_item->>'slug', '')), ''),
      trim(both '-' from regexp_replace(lower(v_display_name), '[^a-z0-9]+', '-', 'g'))
    );

    if v_sector_name is not null and v_sector_slug is not null then
      insert into core.sectors (name, slug)
      values (v_sector_name, v_sector_slug)
      on conflict (slug) do update set name = excluded.name
      returning id into v_sector_id;
    else
      v_sector_id := null;
    end if;

    if v_industry_name is not null and v_industry_slug is not null and v_sector_id is not null then
      insert into core.industries (sector_id, name, slug)
      values (v_sector_id, v_industry_name, v_industry_slug)
      on conflict (sector_id, slug) do update set name = excluded.name
      returning id into v_industry_id;
    else
      v_industry_id := null;
    end if;

    insert into core.companies (
      legal_name, display_name, slug, isin, sector_id, industry_id, business_summary, website_url, ir_url, status, updated_at
    )
    values (
      v_legal_name, v_display_name, v_company_slug, v_isin, v_sector_id, v_industry_id, v_business_summary, v_website_url, v_ir_url, 'active', now()
    )
    on conflict (slug) do update set
      legal_name = excluded.legal_name,
      display_name = excluded.display_name,
      isin = coalesce(excluded.isin, core.companies.isin),
      sector_id = coalesce(excluded.sector_id, core.companies.sector_id),
      industry_id = coalesce(excluded.industry_id, core.companies.industry_id),
      business_summary = coalesce(excluded.business_summary, core.companies.business_summary),
      website_url = coalesce(excluded.website_url, core.companies.website_url),
      ir_url = coalesce(excluded.ir_url, core.companies.ir_url),
      status = 'active',
      updated_at = now()
    returning id into v_company_id;

    insert into core.symbols (company_id, exchange, symbol, is_primary)
    values (
      v_company_id,
      v_exchange,
      v_symbol,
      coalesce((record_item->>'isPrimary')::boolean, true)
    )
    on conflict (exchange, symbol) do update set
      company_id = excluded.company_id,
      is_primary = excluded.is_primary;

    insert into core.company_search (company_id, search_text, updated_at)
    values (
      v_company_id,
      concat_ws(
        ' ',
        v_display_name,
        v_legal_name,
        v_symbol,
        coalesce(v_sector_name, ''),
        coalesce(v_industry_name, ''),
        coalesce(v_isin, '')
      ),
      now()
    )
    on conflict (company_id) do update set
      search_text = excluded.search_text,
      updated_at = now();

    inserted_count := inserted_count + 1;
  end loop;

  if v_ingestion_job_id is not null then
    insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
    values (
      v_ingestion_job_id,
      case when v_status in ('healthy', 'success') then 'info' else 'warning' end,
      'Security master refresh processed records.',
      jsonb_build_object(
        'adapterKey', v_adapter_key,
        'recordsProcessed', inserted_count,
        'exchange', v_default_exchange
      )
    );
  end if;

  return jsonb_build_object(
    'adapterKey', v_adapter_key,
    'exchange', v_default_exchange,
    'recordsProcessed', inserted_count,
    'status', v_status
  );
end;
$$;

grant execute on function public.app_refresh_security_master(jsonb) to service_role;

create or replace function public.app_ingest_eod_market_data(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, core, market, analytics, admin
as $$
declare
  source_payload jsonb := coalesce(payload->'source', '{}'::jsonb);
  record_item jsonb;
  action_item jsonb;
  v_adapter_key text := coalesce(source_payload->>'adapterKey', 'nse_eod');
  v_adapter_label text := coalesce(source_payload->>'adapterLabel', 'NSE EOD');
  v_source_type text := coalesce(source_payload->>'sourceType', 'official');
  v_freshness text := coalesce(source_payload->>'freshnessExpectation', 'Daily after market close');
  v_default_exchange text := upper(coalesce(source_payload->>'exchange', 'NSE'));
  v_started_at timestamptz := coalesce(nullif(source_payload->>'startedAt', '')::timestamptz, now());
  v_finished_at timestamptz := coalesce(nullif(source_payload->>'finishedAt', '')::timestamptz, now());
  v_status text := coalesce(source_payload->>'status', 'healthy');
  v_detail text := coalesce(source_payload->>'detail', 'EOD market-data refresh completed.');
  v_source_adapter_id uuid;
  v_ingestion_job_id uuid;
  v_company_id uuid;
  v_symbol text;
  v_exchange text;
  v_price_date date;
  v_close numeric;
  v_prev_close numeric;
  v_market_cap_cr numeric;
  touched_company_ids uuid[] := '{}';
  company_item uuid;
  v_latest_date date;
  v_latest_close numeric;
  v_previous_close numeric;
  v_day_change_pct numeric;
  v_market_cap_snapshot numeric;
  v_one_year_return_pct numeric;
  v_sma20 numeric;
  v_sma50 numeric;
  v_sma200 numeric;
  v_rsi14 numeric;
  v_macd numeric;
  v_atr14 numeric;
  v_vwap numeric;
  v_support numeric;
  v_major_support numeric;
  v_resistance numeric;
  v_trend_state text;
  v_trend_explanation text;
  v_technical_events jsonb;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if v_default_exchange not in ('NSE', 'BSE') then
    v_default_exchange := 'NSE';
  end if;

  insert into admin.source_adapters (adapter_key, label, source_type, freshness_expectation, active)
  values (v_adapter_key, v_adapter_label, v_source_type, v_freshness, true)
  on conflict (adapter_key) do update set
    label = excluded.label,
    source_type = excluded.source_type,
    freshness_expectation = excluded.freshness_expectation,
    active = true
  returning id into v_source_adapter_id;

  insert into admin.source_runs (source_adapter_id, started_at, finished_at, status, detail)
  values (v_source_adapter_id, v_started_at, v_finished_at, v_status, v_detail)
  on conflict (source_adapter_id, started_at) do update set
    finished_at = excluded.finished_at,
    status = excluded.status,
    detail = excluded.detail;

  insert into admin.ingestion_jobs (source_adapter_id, target_table, status, started_at, finished_at, note)
  values (
    v_source_adapter_id,
    'market.ohlcv_daily',
    case when v_status in ('healthy', 'success') then 'success' else 'warning' end,
    v_started_at,
    v_finished_at,
    v_detail
  )
  on conflict (source_adapter_id, target_table, started_at) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    note = excluded.note
  returning id into v_ingestion_job_id;

  for record_item in
    select value from jsonb_array_elements(coalesce(payload->'records', '[]'::jsonb))
  loop
    v_symbol := upper(btrim(coalesce(record_item->>'symbol', '')));
    v_exchange := upper(btrim(coalesce(record_item->>'exchange', v_default_exchange)));
    v_price_date := nullif(record_item->>'priceDate', '')::date;

    if v_symbol = '' or v_price_date is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if v_exchange not in ('NSE', 'BSE') then
      v_exchange := v_default_exchange;
    end if;

    select s.company_id
    into v_company_id
    from core.symbols s
    where s.exchange = v_exchange
      and s.symbol = v_symbol
    limit 1;

    if v_company_id is null then
      skipped_count := skipped_count + 1;

      if not exists (
        select 1
        from admin.data_quality_issues dqi
        where dqi.source_adapter_id = v_source_adapter_id
          and dqi.issue_type = 'unknown-symbol'
          and dqi.detail = format('No company found for %s:%s during EOD import.', v_exchange, v_symbol)
      ) then
        insert into admin.data_quality_issues (source_adapter_id, issue_type, detail, resolved)
        values (
          v_source_adapter_id,
          'unknown-symbol',
          format('No company found for %s:%s during EOD import.', v_exchange, v_symbol),
          false
        );
      end if;

      continue;
    end if;

    insert into market.ohlcv_daily (company_id, price_date, open, high, low, close, volume, source)
    values (
      v_company_id,
      v_price_date,
      coalesce((record_item->>'open')::numeric, 0),
      coalesce((record_item->>'high')::numeric, 0),
      coalesce((record_item->>'low')::numeric, 0),
      coalesce((record_item->>'close')::numeric, 0),
      coalesce((record_item->>'volume')::bigint, 0),
      coalesce(record_item->>'source', v_adapter_key)
    )
    on conflict (company_id, price_date) do update set
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      source = excluded.source;

    for action_item in
      select value from jsonb_array_elements(coalesce(record_item->'corporateActions', '[]'::jsonb))
    loop
      insert into market.corporate_actions (company_id, action_type, action_date, details)
      values (
        v_company_id,
        coalesce(action_item->>'actionType', 'corporate-action'),
        coalesce(nullif(action_item->>'actionDate', '')::date, v_price_date),
        action_item
      );
    end loop;

    if not coalesce(v_company_id = any(touched_company_ids), false) then
      touched_company_ids := array_append(touched_company_ids, v_company_id);
    end if;

    inserted_count := inserted_count + 1;
  end loop;

  foreach company_item in array touched_company_ids
  loop
    select max(price_date)
    into v_latest_date
    from market.ohlcv_daily
    where company_id = company_item;

    if v_latest_date is null then
      continue;
    end if;

    select close
    into v_latest_close
    from market.ohlcv_daily
    where company_id = company_item and price_date = v_latest_date;

    select close
    into v_previous_close
    from market.ohlcv_daily
    where company_id = company_item and price_date < v_latest_date
    order by price_date desc
    limit 1;

    v_day_change_pct := case
      when v_previous_close is null or v_previous_close = 0 then 0
      else round(((v_latest_close - v_previous_close) / v_previous_close) * 100, 2)
    end;

    select close
    into v_prev_close
    from (
      select close
      from market.ohlcv_daily
      where company_id = company_item
      order by price_date desc
      offset 251 limit 1
    ) historical;

    v_one_year_return_pct := case
      when v_prev_close is null or v_prev_close = 0 then null
      else round(((v_latest_close - v_prev_close) / v_prev_close) * 100, 2)
    end;

    select round(avg(close), 2) into v_sma20
    from (
      select close from market.ohlcv_daily where company_id = company_item order by price_date desc limit 20
    ) recent20;

    select round(avg(close), 2) into v_sma50
    from (
      select close from market.ohlcv_daily where company_id = company_item order by price_date desc limit 50
    ) recent50;

    select round(avg(close), 2) into v_sma200
    from (
      select close from market.ohlcv_daily where company_id = company_item order by price_date desc limit 200
    ) recent200;

    select round(100 - (100 / (1 + nullif(avg_gain / nullif(avg_loss, 0), 0))), 2)
    into v_rsi14
    from (
      select
        avg(gain) as avg_gain,
        avg(loss) as avg_loss
      from (
        select
          greatest(close - lag(close) over (order by price_date), 0) as gain,
          greatest(lag(close) over (order by price_date) - close, 0) as loss
        from (
          select price_date, close
          from market.ohlcv_daily
          where company_id = company_item
          order by price_date desc
          limit 15
        ) recent_rsi
      ) deltas
      where gain is not null and loss is not null
    ) rsi_source;

    select round(avg(close), 2) into v_macd
    from (
      select close
      from market.ohlcv_daily
      where company_id = company_item
      order by price_date desc
      limit 12
    ) macd_fast;

    v_macd := case
      when v_macd is null then null
      else round(
        v_macd - coalesce((
          select round(avg(close), 2)
          from (
            select close
            from market.ohlcv_daily
            where company_id = company_item
            order by price_date desc
            limit 26
          ) macd_slow
        ), v_macd),
        2
      )
    end;

    select round(avg(truerange), 2)
    into v_atr14
    from (
      select
        greatest(
          high - low,
          abs(high - lag(close) over (order by price_date)),
          abs(low - lag(close) over (order by price_date))
        ) as truerange
      from (
        select price_date, high, low, close
        from market.ohlcv_daily
        where company_id = company_item
        order by price_date desc
        limit 15
      ) recent_atr
    ) atr_source
    where truerange is not null;

    select round(sum(((high + low + close) / 3) * volume) / nullif(sum(volume), 0), 2)
    into v_vwap
    from (
      select high, low, close, volume
      from market.ohlcv_daily
      where company_id = company_item
      order by price_date desc
      limit 20
    ) vwap_source;

    select round(min(low), 2) into v_support
    from (
      select low from market.ohlcv_daily where company_id = company_item order by price_date desc limit 10
    ) support_source;

    v_major_support := coalesce(v_sma50, v_support);

    select round(max(high), 2) into v_resistance
    from (
      select high from market.ohlcv_daily where company_id = company_item order by price_date desc limit 20
    ) resistance_source;

    v_trend_state := case
      when v_sma20 is not null and v_sma50 is not null and v_sma200 is not null
        and v_latest_close > v_sma20 and v_sma20 > v_sma50 and v_sma50 > v_sma200
        and coalesce(v_rsi14, 0) >= 58
        then 'Bullish with trend alignment'
      when v_sma20 is not null and v_sma50 is not null and v_latest_close > v_sma20 and v_latest_close > v_sma50
        then 'Constructive'
      when v_sma20 is not null and v_sma50 is not null and v_latest_close < v_sma20 and v_latest_close < v_sma50
        then 'Under pressure'
      else 'Mixed'
    end;

    v_trend_explanation := case
      when v_trend_state = 'Bullish with trend alignment'
        then 'Price is holding above key moving averages with constructive momentum and stored EOD participation.'
      when v_trend_state = 'Constructive'
        then 'The stock is above short and medium trend references, but the structure is less extended.'
      when v_trend_state = 'Under pressure'
        then 'The stock is below important short and medium trend references and needs repair.'
      else 'The latest EOD structure is mixed and does not yet show clean directional alignment.'
    end;

    v_technical_events := to_jsonb(array[
      case
        when v_sma20 is not null and v_sma50 is not null and v_sma200 is not null and v_latest_close > v_sma20 and v_sma20 > v_sma50 and v_sma50 > v_sma200
          then 'Major moving averages remain stacked in bullish order.'
        else 'Moving-average alignment is not fully stacked yet.'
      end,
      case
        when coalesce(v_rsi14, 0) >= 60 then 'Momentum is strong without obviously extreme exhaustion.'
        when coalesce(v_rsi14, 0) <= 40 then 'Momentum is soft and needs recovery before trend conviction improves.'
        else 'Momentum remains constructive but measured.'
      end,
      case
        when v_day_change_pct >= 1 then 'Recent EOD move showed positive directional participation.'
        when v_day_change_pct <= -1 then 'Recent EOD move showed negative directional pressure.'
        else 'Recent EOD participation was present but not decisive.'
      end
    ]);

    insert into market.technical_indicators_daily (
      company_id, price_date, sma_20, sma_50, sma_200, rsi_14, macd, atr_14, vwap
    )
    values (company_item, v_latest_date, v_sma20, v_sma50, v_sma200, v_rsi14, v_macd, v_atr14, v_vwap)
    on conflict (company_id, price_date) do update set
      sma_20 = excluded.sma_20,
      sma_50 = excluded.sma_50,
      sma_200 = excluded.sma_200,
      rsi_14 = excluded.rsi_14,
      macd = excluded.macd,
      atr_14 = excluded.atr_14,
      vwap = excluded.vwap;

    insert into market.trend_states (company_id, price_date, timeframe, trend_state, explanation)
    values (company_item, v_latest_date, 'daily', v_trend_state, v_trend_explanation)
    on conflict (company_id, price_date, timeframe) do update set
      trend_state = excluded.trend_state,
      explanation = excluded.explanation;

    insert into market.price_levels (company_id, as_of_date, label, value, reason)
    values
      (company_item, v_latest_date, 'Primary Support', coalesce(v_support, v_latest_close), 'Recent swing-low and short-term support band.'),
      (company_item, v_latest_date, 'Major Support', coalesce(v_major_support, v_support, v_latest_close), 'Medium-term support reference from stored EOD history.'),
      (company_item, v_latest_date, 'Immediate Resistance', coalesce(v_resistance, v_latest_close), 'Recent local high and breakout test zone.')
    on conflict (company_id, as_of_date, label) do update set
      value = excluded.value,
      reason = excluded.reason;

    select market_cap_cr
    into v_market_cap_snapshot
    from analytics.company_snapshots_daily
    where company_id = company_item
    order by snapshot_date desc
    limit 1;

    insert into analytics.company_snapshots_daily (
      company_id, snapshot_date, close, day_change_pct, market_cap_cr, one_year_return_pct,
      summary_tags, fundamentals_headline, technical_summary, technical_events, behavior_narrative
    )
    select
      company_item,
      v_latest_date,
      v_latest_close,
      coalesce(v_day_change_pct, 0),
      coalesce(v_market_cap_snapshot, 0),
      v_one_year_return_pct,
      to_jsonb(array_remove(array[sec.name, ind.name, 'Official EOD'], null)),
      cs.fundamentals_headline,
      v_trend_explanation,
      v_technical_events,
      cs.behavior_narrative
    from core.companies c
    left join core.sectors sec on sec.id = c.sector_id
    left join core.industries ind on ind.id = c.industry_id
    left join lateral (
      select fundamentals_headline, behavior_narrative
      from analytics.company_snapshots_daily
      where company_id = company_item
      order by snapshot_date desc
      limit 1
    ) cs on true
    where c.id = company_item
    on conflict (company_id, snapshot_date) do update set
      close = excluded.close,
      day_change_pct = excluded.day_change_pct,
      market_cap_cr = excluded.market_cap_cr,
      one_year_return_pct = excluded.one_year_return_pct,
      summary_tags = excluded.summary_tags,
      fundamentals_headline = coalesce(excluded.fundamentals_headline, analytics.company_snapshots_daily.fundamentals_headline),
      technical_summary = excluded.technical_summary,
      technical_events = excluded.technical_events,
      behavior_narrative = coalesce(excluded.behavior_narrative, analytics.company_snapshots_daily.behavior_narrative);
  end loop;

  if v_ingestion_job_id is not null then
    insert into admin.ingestion_logs (ingestion_job_id, log_level, message, payload)
    values (
      v_ingestion_job_id,
      case when v_status in ('healthy', 'success') then 'info' else 'warning' end,
      'EOD market-data refresh processed records and refreshed derived technical snapshots.',
      jsonb_build_object(
        'adapterKey', v_adapter_key,
        'recordsProcessed', inserted_count,
        'recordsSkipped', skipped_count,
        'exchange', v_default_exchange,
        'companiesTouched', coalesce(array_length(touched_company_ids, 1), 0)
      )
    );
  end if;

  return jsonb_build_object(
    'adapterKey', v_adapter_key,
    'exchange', v_default_exchange,
    'recordsProcessed', inserted_count,
    'recordsSkipped', skipped_count,
    'companiesTouched', coalesce(array_length(touched_company_ids, 1), 0),
    'status', v_status
  );
end;
$$;

grant execute on function public.app_ingest_eod_market_data(jsonb) to service_role;
