-- v22 가맹 손익 보고서 / 원가율 산정용 재고 저장 테이블
-- 기존 거래, 자금일보 데이터는 건드리지 않습니다.
-- Supabase SQL Editor에서 1번만 실행하세요.

create table if not exists public.cost_inventory_items (
  id uuid primary key default gen_random_uuid(),
  settlement_month text not null,
  category text not null,
  beginning_inventory numeric(14, 0) not null default 0,
  ending_inventory numeric(14, 0) not null default 0,
  memo text,
  sort_order integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_inventory_items_month_format check (settlement_month ~ '^\d{4}-\d{2}$'),
  constraint cost_inventory_items_month_category_unique unique (settlement_month, category)
);

create index if not exists idx_cost_inventory_items_month on public.cost_inventory_items(settlement_month);
create index if not exists idx_cost_inventory_items_category on public.cost_inventory_items(category);

drop trigger if exists trg_cost_inventory_items_updated_at on public.cost_inventory_items;

create trigger trg_cost_inventory_items_updated_at
before update on public.cost_inventory_items
for each row execute function public.set_updated_at();

alter table public.cost_inventory_items enable row level security;

select 'OK - 원가율 산정용 재고 테이블 생성 완료' as result;
