import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: summaryRows, error: rowsError } = await supabase
    .from("monthly_account_summary")
    .select("*")
    .eq("settlement_month", month);

  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  const isInventoryAdjustment = (row: any) => {
    const names = [
      row.main_account_name,
      row.sub_account_name,
      row.detail_account_name
    ].filter(Boolean).join(" ");
    return row.transaction_type === "expense" && names.includes("월말재고");
  };

  const rows = (summaryRows || []).map((row: any) => {
    const amount = Number(row.total_amount || 0);
    const inventoryAdjustment = isInventoryAdjustment(row);

    return {
      ...row,
      // 월말재고 차감 계정은 월 손익을 왜곡하지 않도록 손익 합계에서는 제외합니다.
      // 원가율은 화면의 원가율 산정표에서 기초재고 + 매입 - 기말재고로 따로 계산합니다.
      total_amount: inventoryAdjustment ? 0 : amount,
      raw_total_amount: amount,
      is_inventory_adjustment: inventoryAdjustment
    };
  });

  const totalRevenue = rows
    .filter((r: any) => r.transaction_type === "revenue")
    .reduce((sum: number, r: any) => sum + r.total_amount, 0);

  const totalExpense = rows
    .filter((r: any) => r.transaction_type === "expense")
    .reduce((sum: number, r: any) => sum + r.total_amount, 0);

  const nonProfitCashFlow = rows
    .filter((r: any) => r.transaction_type === "non_profit")
    .reduce((sum: number, r: any) => sum + r.total_amount, 0);

  return NextResponse.json({
    summary: {
      totalRevenue,
      totalExpense,
      netProfit: totalRevenue - totalExpense,
      nonProfitCashFlow,
      rows
    }
  });
}
