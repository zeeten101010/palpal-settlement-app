-- v15 월말재고 차감 계정 추가
-- 기존 거래/자금일보 데이터는 건드리지 않습니다.
-- Supabase SQL Editor에서 1번만 실행하세요.
-- 사용법: 월말재고 금액은 지출 > 매출원가 > 월말재고 차감에 "양수"로 입력합니다.
-- 앱 요약에서는 자동으로 매출원가에서 마이너스 차감됩니다.

do $$
declare
  v_cogs uuid;
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

  if not exists (
    select 1
    from public.accounts
    where parent_id = v_cogs
      and name = '월말재고 차감'
      and account_type = 'expense'
  ) then
    insert into public.accounts (parent_id, name, account_type, level, sort_order)
    values (v_cogs, '월말재고 차감', 'expense', 2, 90);
  end if;
end $$;

select 'OK - 월말재고 차감 계정 생성 완료' as result;
