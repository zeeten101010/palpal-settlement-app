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
    const conditions = ["item_type.eq.account", "item_type.eq.out_scheduled"];
    if (month) conditions.push(`settlement_month.eq.${month}`);
    if (cashDate) conditions.push(`record_date.eq.${cashDate}`);
    query = query.or(conditions.join(","));
  } else if (month && includeOpenScheduled) {
    query = query.or(`settlement_month.eq.${month},item_type.eq.out_scheduled`);
  } else if (month) {
    query = query.eq("settlement_month", month);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row: any) => ({
    ...row,
    amount: Number(row.amount || 0),
    exclude_from_cash: Boolean(row.exclude_from_cash)
  }));

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

  const { id } = await req.json();
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("cash_daily_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
