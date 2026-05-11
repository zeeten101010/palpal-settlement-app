import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";

async function guard() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const blocked = await guard();
  if (blocked) return blocked;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data });
}

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      parent_id: body.parent_id || null,
      name: body.name,
      account_type: body.account_type,
      level: body.level,
      sort_order: body.sort_order || 999,
      is_active: true
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const body = await req.json();
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("accounts")
    .update({
      name: body.name,
      sort_order: body.sort_order
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  const { id } = await req.json();
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
