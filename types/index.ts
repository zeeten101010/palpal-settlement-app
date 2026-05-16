export type TransactionType = "revenue" | "expense" | "non_profit";

export type Account = {
  id: string;
  parent_id: string | null;
  name: string;
  account_type: TransactionType;
  level: 1 | 2 | 3;
  sort_order: number;
  is_active: boolean;
};

export type Transaction = {
  id: string;
  transaction_date: string;
  settlement_month: string;
  transaction_type: TransactionType;
  main_account_id: string | null;
  sub_account_id: string | null;
  detail_account_id: string | null;
  vendor: string | null;
  amount: number;
  payment_method: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  main_account_name?: string | null;
  sub_account_name?: string | null;
  detail_account_name?: string | null;
};

export type SummaryRow = {
  transaction_type: TransactionType;
  main_account_id: string | null;
  sub_account_id: string | null;
  detail_account_id: string | null;
  main_account_name: string | null;
  sub_account_name: string | null;
  detail_account_name: string | null;
  total_amount: number;
  is_inventory_adjustment?: boolean;
};

export type Summary = {
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  nonProfitCashFlow: number;
  rows: SummaryRow[];
};
