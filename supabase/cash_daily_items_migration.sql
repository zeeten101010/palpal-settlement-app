-- 자금일보 메뉴 추가용 SQL
-- 기존 월결산 테이블은 건드리지 않습니다.
-- Supabase SQL Editor에서 이 파일 전체를 1번만 실행하세요.

create table if not exists public.cash_daily_items (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  settlement_month text not null,
  item_type text not null check (item_type in ('account', 'out_done', 'out_scheduled', 'in_scheduled')),
  group_name text not null default '팔팔',
  category text,
  vendor text,
  amount numeric(14, 0) not null check (amount >= 0),
  account_name text,
  bank text,
  account_number text,
  status text,
  memo text,
  exclude_from_cash boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cash_daily_items_settlement_month_format check (settlement_month ~ '^\d{4}-\d{2}$')
);

create index if not exists idx_cash_daily_items_month on public.cash_daily_items(settlement_month);
create index if not exists idx_cash_daily_items_date on public.cash_daily_items(record_date);
create index if not exists idx_cash_daily_items_type on public.cash_daily_items(item_type);
create index if not exists idx_cash_daily_items_group on public.cash_daily_items(group_name);
create index if not exists idx_cash_daily_items_deleted_at on public.cash_daily_items(deleted_at);

drop trigger if exists trg_cash_daily_items_updated_at on public.cash_daily_items;

create trigger trg_cash_daily_items_updated_at
before update on public.cash_daily_items
for each row execute function public.set_updated_at();

alter table public.cash_daily_items enable row level security;

-- RLS 정책은 만들지 않습니다.
-- Next.js 서버 API에서 service role key로만 접근합니다.
-- service role key는 브라우저에 절대 노출하면 안 됩니다.

select 'OK - 자금일보 테이블 생성 완료' as result;
