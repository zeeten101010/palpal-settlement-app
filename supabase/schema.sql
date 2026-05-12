-- 팔팔너구리해장 월결산 웹앱 Supabase SQL Schema v4 REAL SAFE
-- 이 파일 하나만 전체 복사해서 Supabase SQL Editor에 붙여넣고 Run 하세요.
-- 초기 세팅용입니다. 기존 테이블/데이터를 삭제하고 다시 만듭니다.
-- 핵심 수정: 테이블이 없을 때 DROP TRIGGER를 실행하지 않도록 제거했습니다.

drop view if exists public.monthly_account_summary cascade;
drop view if exists public.monthly_summary cascade;

drop table if exists public.transactions cascade;
drop table if exists public.accounts cascade;
drop table if exists public.app_settings cascade;

drop function if exists public.set_updated_at() cascade;

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  app_name text not null default '팔팔너구리해장 월결산',
  store_name text not null default '팔팔너구리해장',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

insert into public.app_settings (app_name, store_name)
values ('팔팔너구리해장 월결산', '팔팔너구리해장');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.accounts(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('revenue', 'expense', 'non_profit')),
  level integer not null check (level in (1, 2, 3)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_accounts_parent_id on public.accounts(parent_id);
create index idx_accounts_type on public.accounts(account_type);
create index idx_accounts_active on public.accounts(is_active);

create trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  settlement_month text not null,
  transaction_type text not null check (transaction_type in ('revenue', 'expense', 'non_profit')),
  main_account_id uuid references public.accounts(id) on delete restrict,
  sub_account_id uuid references public.accounts(id) on delete restrict,
  detail_account_id uuid references public.accounts(id) on delete restrict,
  vendor text,
  amount numeric(14, 0) not null check (amount >= 0),
  payment_method text not null default '현금',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactions_settlement_month_format check (settlement_month ~ '^\d{4}-\d{2}$')
);

create index idx_transactions_month on public.transactions(settlement_month);
create index idx_transactions_date on public.transactions(transaction_date);
create index idx_transactions_type on public.transactions(transaction_type);
create index idx_transactions_main_account on public.transactions(main_account_id);
create index idx_transactions_sub_account on public.transactions(sub_account_id);
create index idx_transactions_detail_account on public.transactions(detail_account_id);
create index idx_transactions_deleted_at on public.transactions(deleted_at);

create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- 1단계: 대분류
insert into public.accounts (name, account_type, level, sort_order) values
('매출', 'revenue', 1, 10),
('매출원가', 'expense', 1, 20),
('인건비', 'expense', 1, 30),
('고정비', 'expense', 1, 40),
('변동비', 'expense', 1, 50),
('운영비', 'expense', 1, 60),
('기타비용', 'expense', 1, 70),
('비손익거래', 'non_profit', 1, 80);

-- 2단계: 중분류
insert into public.accounts (parent_id, name, account_type, level, sort_order) values
((select id from public.accounts where parent_id is null and name = '매출'), '홀매출', 'revenue', 2, 10),
((select id from public.accounts where parent_id is null and name = '매출'), '배달매출', 'revenue', 2, 20),
((select id from public.accounts where parent_id is null and name = '매출'), '기타매출', 'revenue', 2, 30),

((select id from public.accounts where parent_id is null and name = '매출원가'), '음식원가', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '매출원가'), '주류원가', 'expense', 2, 20),
((select id from public.accounts where parent_id is null and name = '매출원가'), '음료원가', 'expense', 2, 30),

((select id from public.accounts where parent_id is null and name = '인건비'), '급여', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '인건비'), '4대보험', 'expense', 2, 20),
((select id from public.accounts where parent_id is null and name = '인건비'), '알바비', 'expense', 2, 30),
((select id from public.accounts where parent_id is null and name = '인건비'), '식대/복리후생비', 'expense', 2, 40),

((select id from public.accounts where parent_id is null and name = '고정비'), '임차료', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '고정비'), '관리비', 'expense', 2, 20),
((select id from public.accounts where parent_id is null and name = '고정비'), '수도광열비', 'expense', 2, 30),
((select id from public.accounts where parent_id is null and name = '고정비'), '보험료', 'expense', 2, 40),

((select id from public.accounts where parent_id is null and name = '변동비'), '지급수수료', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '변동비'), '광고선전비', 'expense', 2, 20),
((select id from public.accounts where parent_id is null and name = '변동비'), '운반비', 'expense', 2, 30),

((select id from public.accounts where parent_id is null and name = '운영비'), '소모품비', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '운영비'), '통신비', 'expense', 2, 20),
((select id from public.accounts where parent_id is null and name = '운영비'), '수선비', 'expense', 2, 30),
((select id from public.accounts where parent_id is null and name = '운영비'), '차량유지비', 'expense', 2, 40),
((select id from public.accounts where parent_id is null and name = '운영비'), '세무사 수수료', 'expense', 2, 50),
((select id from public.accounts where parent_id is null and name = '운영비'), '접대비', 'expense', 2, 60),
((select id from public.accounts where parent_id is null and name = '운영비'), '렌탈비', 'expense', 2, 70),
((select id from public.accounts where parent_id is null and name = '운영비'), '대출이자', 'expense', 2, 80),

((select id from public.accounts where parent_id is null and name = '기타비용'), '잡비', 'expense', 2, 10),
((select id from public.accounts where parent_id is null and name = '기타비용'), '예비비', 'expense', 2, 20),

((select id from public.accounts where parent_id is null and name = '비손익거래'), '보증금', 'non_profit', 2, 10),
((select id from public.accounts where parent_id is null and name = '비손익거래'), '대출', 'non_profit', 2, 20),
((select id from public.accounts where parent_id is null and name = '비손익거래'), '부가세', 'non_profit', 2, 30),
((select id from public.accounts where parent_id is null and name = '비손익거래'), '대표자', 'non_profit', 2, 40);

-- 3단계: 세부항목
insert into public.accounts (parent_id, name, account_type, level, sort_order) values
((select id from public.accounts where name = '음식원가' and level = 2), '육류', 'expense', 3, 10),
((select id from public.accounts where name = '음식원가' and level = 2), '부속', 'expense', 3, 20),
((select id from public.accounts where name = '음식원가' and level = 2), '식자재', 'expense', 3, 30),
((select id from public.accounts where name = '음식원가' and level = 2), '공산품', 'expense', 3, 40),

((select id from public.accounts where name = '수도광열비' and level = 2), '전기료', 'expense', 3, 10),
((select id from public.accounts where name = '수도광열비' and level = 2), '가스료', 'expense', 3, 20),
((select id from public.accounts where name = '수도광열비' and level = 2), '수도료', 'expense', 3, 30),

((select id from public.accounts where name = '지급수수료' and level = 2), '배달앱 수수료', 'expense', 3, 10),
((select id from public.accounts where name = '지급수수료' and level = 2), '카드수수료', 'expense', 3, 20),

((select id from public.accounts where name = '광고선전비' and level = 2), '배달앱 광고', 'expense', 3, 10),
((select id from public.accounts where name = '광고선전비' and level = 2), '네이버 광고', 'expense', 3, 20),

((select id from public.accounts where name = '보증금' and level = 2), '물류보증금 입금', 'non_profit', 3, 10),
((select id from public.accounts where name = '보증금' and level = 2), '물류보증금 반환', 'non_profit', 3, 20),
((select id from public.accounts where name = '보증금' and level = 2), '가맹보증금 입금', 'non_profit', 3, 30),
((select id from public.accounts where name = '보증금' and level = 2), '가맹보증금 반환', 'non_profit', 3, 40),

((select id from public.accounts where name = '대출' and level = 2), '대출원금 상환', 'non_profit', 3, 10),

((select id from public.accounts where name = '부가세' and level = 2), '부가세 납부', 'non_profit', 3, 10),
((select id from public.accounts where name = '부가세' and level = 2), '부가세 환급', 'non_profit', 3, 20),

((select id from public.accounts where name = '대표자' and level = 2), '대표자 인출', 'non_profit', 3, 10),
((select id from public.accounts where name = '대표자' and level = 2), '대표자 입금', 'non_profit', 3, 20);

create or replace view public.monthly_summary as
select
  settlement_month,
  coalesce(sum(case when transaction_type = 'revenue' then amount else 0 end), 0) as total_revenue,
  coalesce(sum(case when transaction_type = 'expense' then amount else 0 end), 0) as total_expense,
  coalesce(sum(case when transaction_type = 'revenue' then amount else 0 end), 0)
    - coalesce(sum(case when transaction_type = 'expense' then amount else 0 end), 0) as net_profit,
  coalesce(sum(case when transaction_type = 'non_profit' then amount else 0 end), 0) as non_profit_cash_flow
from public.transactions
where deleted_at is null
group by settlement_month;

create or replace view public.monthly_account_summary as
select
  t.settlement_month,
  t.transaction_type,
  main.id as main_account_id,
  sub.id as sub_account_id,
  detail.id as detail_account_id,
  main.name as main_account_name,
  sub.name as sub_account_name,
  detail.name as detail_account_name,
  sum(t.amount) as total_amount
from public.transactions t
left join public.accounts main on main.id = t.main_account_id
left join public.accounts sub on sub.id = t.sub_account_id
left join public.accounts detail on detail.id = t.detail_account_id
where t.deleted_at is null
group by
  t.settlement_month,
  t.transaction_type,
  main.id,
  sub.id,
  detail.id,
  main.name,
  sub.name,
  detail.name;

-- 완료 확인용
select
  'OK - 팔팔너구리해장 월결산 DB 세팅 완료' as result,
  (select count(*) from public.accounts) as account_count;
