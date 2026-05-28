-- v16 월말재고 차감 세부 계정 추가
-- 기존 거래/자금일보 데이터는 건드리지 않습니다.
-- Supabase SQL Editor에서 1번만 실행하세요.
--
-- 사용법:
-- 지출 > 매출원가 > 월말재고 차감 > 육류 재고 차감
-- 지출 > 매출원가 > 월말재고 차감 > 음료 재고 차감
-- 지출 > 매출원가 > 월말재고 차감 > 주류 재고 차감
--
-- 금액은 양수로 입력합니다.
-- 앱 요약에서는 "월말재고"가 들어간 계정을 매출원가에서 자동 마이너스 차감합니다.

do $$
declare
  v_cogs uuid;
  v_inventory uuid;
begin
  select id into v_cogs
  from public.accounts
  where parent_id is null
    and name = '매출원가'
    and account_type = 'expense'
  limit 1;

  if v_cogs is null then
    insert into public.accounts (name, account_type, level, sort_order)
    values ('매출원가', 'expense', 1, 20)
    returning id into v_cogs;
  end if;

  select id into v_inventory
  from public.accounts
  where parent_id = v_cogs
    and name = '월말재고 차감'
    and account_type = 'expense'
  limit 1;

  if v_inventory is null then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_cogs, '월말재고 차감', 'expense', 2, 90)
    returning id into v_inventory;
  end if;

  if not exists (
    select 1 from public.accounts
    where parent_id = v_inventory
      and name = '육류 재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_inventory, '육류 재고 차감', 'expense', 3, 10);
  end if;

  if not exists (
    select 1 from public.accounts
    where parent_id = v_inventory
      and name = '식자재 재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_inventory, '식자재 재고 차감', 'expense', 3, 20);
  end if;

  if not exists (
    select 1 from public.accounts
    where parent_id = v_inventory
      and name = '음료 재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_inventory, '음료 재고 차감', 'expense', 3, 30);
  end if;

  if not exists (
    select 1 from public.accounts
    where parent_id = v_inventory
      and name = '주류 재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_inventory, '주류 재고 차감', 'expense', 3, 40);
  end if;

  if not exists (
    select 1 from public.accounts
    where parent_id = v_inventory
      and name = '기타 재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_inventory, '기타 재고 차감', 'expense', 3, 90);
  end if;
end $$;

select 'OK - 월말재고 차감 세부 계정 생성 완료' as result;
