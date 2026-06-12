import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { toSettlementMonth } from "@/lib/utils";

async function guard() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const cashDate = searchParams.get("cashDate");
  const dashboard = searchParams.get("dashboard") === "true";
  const includeOpenScheduled = searchParams.get("includeOpenScheduled") === "true";

  const supabase = supabaseAdmin();
  let query = supabase
    .from("cash_daily_items")
    .select("*")
    .is("deleted_at", null)
    .order("record_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (dashboard) {
    const conditions = ["item_type.eq.out_scheduled"];
    if (month) conditions.push(`settlement_month.eq.${month}`);
    if (cashDate) {
      conditions.push(`record_date.eq.${cashDate}`);
      conditions.push(`and(item_type.eq.account,record_date.eq.${cashDate})`);
    } else {
      conditions.push("item_type.eq.account");
    }
    query = query.or(conditions.join(","));
  } else if (month && includeOpenScheduled) {
    query = query.or(`settlement_month.eq.${month},item_type.eq.out_scheduled`);
  } else if (month) {
    query = query.eq("settlement_month", month);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalizedItems = (data || []).map((row: any) => ({
    ...row,
    amount: Number(row.amount || 0),
    exclude_from_cash: Boolean(row.exclude_from_cash)
  }));

  // 자금현황 계좌는 잔액 기록이 여러 번 남아도 화면에는 계좌별 최신 1건만 내려줍니다.
  const accountMap = new Map<string, any>();
  const nonAccountItems: any[] = [];

  normalizedItems.forEach((item: any) => {
    if (item.item_type !== "account") {
      nonAccountItems.push(item);
      return;
    }

    const key = item.account_number || `${item.group_name || "기타"}-${item.bank || ""}-${item.account_name || ""}`;
    const current = accountMap.get(key);
    const nextStamp = `${item.record_date || ""}-${item.updated_at || ""}-${item.created_at || ""}-${item.id || ""}`;
    const currentStamp = current ? `${current.record_date || ""}-${current.updated_at || ""}-${current.created_at || ""}-${current.id || ""}` : "";

    if (!current || nextStamp >= currentStamp) {
      accountMap.set(key, item);
    }
  });

  const items = [...nonAccountItems, ...Array.from(accountMap.values())];

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const date = body.record_date;

  if (!date) {
    return NextResponse.json({ error: "record_date is required" }, { status: 400 });
  }

  if (!body.item_type) {
    return NextResponse.json({ error: "item_type is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("cash_daily_items")
    .insert({
      record_date: date,
      settlement_month: body.settlement_month || toSettlementMonth(date),
      item_type: body.item_type,
      group_name: body.group_name || "팔팔",
      category: body.category || null,
      vendor: body.vendor || null,
      amount: Number(body.amount || 0),
      account_name: body.account_name || null,
      bank: body.bank || null,
      account_number: body.account_number || null,
      status: body.status || null,
      memo: body.memo || null,
      exclude_from_cash: Boolean(body.exclude_from_cash)
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const date = body.record_date;

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (!date) {
    return NextResponse.json({ error: "record_date is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("cash_daily_items")
    .update({
      record_date: date,
      settlement_month: body.settlement_month || toSettlementMonth(date),
      item_type: body.item_type,
      group_name: body.group_name || "팔팔",
      category: body.category || null,
      vendor: body.vendor || null,
      amount: Number(body.amount || 0),
      account_name: body.account_name || null,
      bank: body.bank || null,
      account_number: body.account_number || null,
      status: body.status || null,
      memo: body.memo || null,
      exclude_from_cash: Boolean(body.exclude_from_cash)
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const supabase = supabaseAdmin();

  if (body.item_type === "account") {
    if (!body.record_date) {
      return NextResponse.json({ error: "record_date is required for account reset" }, { status: 400 });
    }

    const { error } = await supabase
      .from("cash_daily_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("item_type", "account")
      .eq("record_date", body.record_date)
      .is("deleted_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cash_daily_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
