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

  const supabase = supabaseAdmin();
  let query = supabase
    .from("transactions")
    .select(`
      *,
      main:main_account_id(name),
      sub:sub_account_id(name),
      detail:detail_account_id(name)
    `)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (month) query = query.eq("settlement_month", month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []).map((row: any) => ({
    ...row,
    amount: Number(row.amount || 0),
    main_account_name: row.main?.name || null,
    sub_account_name: row.sub?.name || null,
    detail_account_name: row.detail?.name || null
  }));

  return NextResponse.json({ transactions: rows });
}

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const supabase = supabaseAdmin();
  const date = body.transaction_date;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      transaction_date: date,
      settlement_month: body.settlement_month || toSettlementMonth(date),
      transaction_type: body.transaction_type,
      main_account_id: body.main_account_id || null,
      sub_account_id: body.sub_account_id || null,
      detail_account_id: body.detail_account_id || null,
      vendor: body.vendor || null,
      amount: Number(body.amount || 0),
      payment_method: body.payment_method || "현금",
      memo: body.memo || null
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction: data });
}

export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const supabase = supabaseAdmin();
  const date = body.transaction_date;

  const { data, error } = await supabase
    .from("transactions")
    .update({
      transaction_date: date,
      settlement_month: body.settlement_month || toSettlementMonth(date),
      transaction_type: body.transaction_type,
      main_account_id: body.main_account_id || null,
      sub_account_id: body.sub_account_id || null,
      detail_account_id: body.detail_account_id || null,
      vendor: body.vendor || null,
      amount: Number(body.amount || 0),
      payment_method: body.payment_method || "현금",
      memo: body.memo || null
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction: data });
}

export async function DELETE(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const { id } = await req.json();
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
