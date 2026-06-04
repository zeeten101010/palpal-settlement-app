import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";

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

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("cost_inventory_items")
    .select("*")
    .eq("settlement_month", month)
    .order("sort_order", { ascending: true })
    .order("category", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row: any) => ({
    ...row,
    beginning_inventory: Number(row.beginning_inventory || 0),
    ending_inventory: Number(row.ending_inventory || 0)
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const month = body.month;
  const rows = body.rows || [];

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const payload = rows.map((row: any, index: number) => ({
    settlement_month: month,
    category: row.category,
    beginning_inventory: Number(row.beginning_inventory || 0),
    ending_inventory: Number(row.ending_inventory || 0),
    memo: row.memo || null,
    sort_order: index + 1
  }));

  const { data, error } = await supabase
    .from("cost_inventory_items")
    .upsert(payload, { onConflict: "settlement_month,category" })
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}
