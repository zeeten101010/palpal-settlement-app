"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { Account, Summary, Transaction, TransactionType } from "@/types";
import { calcRate, formatWon, getCurrentMonth, normalizeAmount, toSettlementMonth } from "@/lib/utils";

type Tab = "input" | "list" | "accounts" | "summary" | "analysis" | "cash";

const typeLabel: Record<TransactionType, string> = {
  revenue: "매출",
  expense: "지출",
  non_profit: "비손익"
};

const paymentMethods = ["현금", "체크카드", "신용카드", "계좌이체", "기타"];


type CashItemType = "account" | "out_done" | "out_scheduled" | "in_scheduled";

type CashItem = {
  id: string;
  record_date: string;
  settlement_month: string;
  item_type: CashItemType;
  group_name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  account_name: string | null;
  bank: string | null;
  account_number: string | null;
  status: string | null;
  memo: string | null;
  exclude_from_cash: boolean;
};

type CashForm = {
  id: string;
  record_date: string;
  settlement_month: string;
  item_type: CashItemType;
  group_name: string;
  category: string;
  vendor: string;
  amount: string;
  account_name: string;
  bank: string;
  account_number: string;
  status: string;
  memo: string;
  exclude_from_cash: boolean;
};

type QuickCashRow = {
  id: string;
  record_date: string;
  item_type: CashItemType;
  group_name: string;
  category: string;
  vendor: string;
  amount: string;
  account_name: string;
  bank: string;
  account_number: string;
  status: string;
  memo: string;
  exclude_from_cash: boolean;
  row_key: string;
};

const fixedCashAccounts: Omit<QuickCashRow, "id" | "record_date" | "item_type" | "category" | "vendor" | "amount" | "status">[] = [
  {
    row_key: "palpal-main",
    group_name: "팔팔",
    bank: "우리은행",
    account_name: "팔팔 운영계좌",
    account_number: "1005-005-660774",
    memo: "",
    exclude_from_cash: false
  },
  {
    row_key: "prewar-main",
    group_name: "프워",
    bank: "우리은행",
    account_name: "프워 운영계좌",
    account_number: "1005-104-658386",
    memo: "",
    exclude_from_cash: false
  },
  {
    row_key: "prewar-order",
    group_name: "프워",
    bank: "우리은행",
    account_name: "발주고",
    account_number: "1005-504-786466",
    memo: "",
    exclude_from_cash: false
  },
  {
    row_key: "prewar-deposit",
    group_name: "프워",
    bank: "우리은행",
    account_name: "예치금",
    account_number: "1005-104-806357",
    memo: "예치금 제외",
    exclude_from_cash: true
  }
];

const cashTypeLabel: Record<CashItemType, string> = {
  account: "자금현황",
  out_done: "출금완료",
  out_scheduled: "출금예정",
  in_scheduled: "입금예정"
};

const cashGroups = ["팔팔", "프워", "공통", "기타"];
const cashCategories = ["식자재", "월세", "인건비", "세금", "보험", "배달정산", "카드정산", "기타"];
const cashStatuses = ["예정", "보류", "완료"];

const blankCashForm = (month: string): CashForm => ({
  id: "",
  record_date: getTodayDate().startsWith(month) ? getTodayDate() : `${month}-01`,
  settlement_month: month,
  item_type: "out_scheduled",
  group_name: "팔팔",
  category: "식자재",
  vendor: "",
  amount: "",
  account_name: "팔팔",
  bank: "",
  account_number: "",
  status: "예정",
  memo: "",
  exclude_from_cash: false
});

function getTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function quickRowFromCashItem(item: CashItem): QuickCashRow {
  return {
    id: item.id,
    record_date: item.record_date,
    item_type: item.item_type,
    group_name: item.group_name || "팔팔",
    category: item.category || "식자재",
    vendor: item.vendor || "",
    amount: item.amount ? String(item.amount) : "",
    account_name: item.account_name || "",
    bank: item.bank || "",
    account_number: item.account_number || "",
    status: item.status || (item.item_type === "out_done" ? "완료" : "예정"),
    memo: item.memo || "",
    exclude_from_cash: Boolean(item.exclude_from_cash),
    row_key: item.id
  };
}

function blankQuickCashRow(itemType: CashItemType, month: string, date: string, index: number): QuickCashRow {
  return {
    id: "",
    record_date: date || `${month}-01`,
    item_type: itemType,
    group_name: "팔팔",
    category: "식자재",
    vendor: "",
    amount: "",
    account_name: "팔팔",
    bank: "",
    account_number: "",
    status: itemType === "out_done" ? "완료" : "예정",
    memo: "",
    exclude_from_cash: false,
    row_key: `new-${itemType}-${index}-${Date.now()}`
  };
}


const blankForm = (month: string) => ({
  id: "",
  transaction_date: `${month}-01`,
  settlement_month: month,
  transaction_type: "expense" as TransactionType,
  main_account_id: "",
  sub_account_id: "",
  detail_account_id: "",
  vendor: "",
  amount: "",
  payment_method: "신용카드",
  memo: ""
});


function getPrevMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const d = new Date(year, monthNumber - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sumSummaryRows(summary: Summary | null, matcher: (row: Summary["rows"][number]) => boolean) {
  if (!summary) return 0;
  return summary.rows.filter(matcher).reduce((sum, row) => sum + row.total_amount, 0);
}

function formatChange(value: number) {
  if (value > 0) return `+${formatWon(value)}`;
  if (value < 0) return `-${formatWon(Math.abs(value))}`;
  return "변동 없음";
}

function formatPoint(value: number) {
  if (value > 0) return `+${value.toFixed(1)}%p`;
  if (value < 0) return `${value.toFixed(1)}%p`;
  return "0.0%p";
}

type AnalysisItem = {
  title: string;
  level: "good" | "warning" | "danger";
  body: string;
};

function buildMonthlyAnalysis(summary: Summary | null, prevSummary: Summary | null, transactions: Transaction[]) {
  if (!summary || summary.totalRevenue <= 0) {
    return {
      headline: "아직 분석할 매출 데이터가 없습니다.",
      verdict: "이번 달 매출과 지출을 먼저 입력하면 자동으로 문제점과 다음달 액션이 나옵니다.",
      problems: [] as AnalysisItem[],
      actions: [] as AnalysisItem[],
      nextMonth: [] as string[],
      numbers: [] as { label: string; value: string }[]
    };
  }

  const revenue = summary.totalRevenue;
  const expense = summary.totalExpense;
  const profit = summary.netProfit;
  const profitRate = calcRate(profit, revenue);

  const cogs = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.main_account_name === "매출원가");
  const labor = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.main_account_name === "인건비");
  const fixed = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.main_account_name === "고정비");
  const variable = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.main_account_name === "변동비");
  const operating = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.main_account_name === "운영비");

  const deliveryRevenue = sumSummaryRows(summary, (r) => r.transaction_type === "revenue" && r.sub_account_name === "배달매출");
  const hallRevenue = sumSummaryRows(summary, (r) => r.transaction_type === "revenue" && r.sub_account_name === "홀매출");
  const deliveryFee = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.detail_account_name === "배달앱 수수료");
  const cardFee = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.detail_account_name === "카드수수료");
  const ad = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.sub_account_name === "광고선전비");
  const rent = sumSummaryRows(summary, (r) => r.transaction_type === "expense" && r.sub_account_name === "임차료");

  const cogsRate = calcRate(cogs, revenue);
  const laborRate = calcRate(labor, revenue);
  const fixedRate = calcRate(fixed, revenue);
  const variableRate = calcRate(variable, revenue);
  const operatingRate = calcRate(operating, revenue);
  const deliveryShare = calcRate(deliveryRevenue, revenue);
  const deliveryFeeRate = calcRate(deliveryFee, revenue);
  const adRate = calcRate(ad, revenue);
  const rentRate = calcRate(rent, revenue);

  const prevRevenue = prevSummary?.totalRevenue || 0;
  const prevProfit = prevSummary?.netProfit || 0;
  const prevProfitRate = prevRevenue ? calcRate(prevProfit, prevRevenue) : 0;
  const prevCogsRate = prevRevenue ? calcRate(sumSummaryRows(prevSummary, (r) => r.transaction_type === "expense" && r.main_account_name === "매출원가"), prevRevenue) : 0;
  const prevLaborRate = prevRevenue ? calcRate(sumSummaryRows(prevSummary, (r) => r.transaction_type === "expense" && r.main_account_name === "인건비"), prevRevenue) : 0;

  const problems: AnalysisItem[] = [];
  const actions: AnalysisItem[] = [];

  if (profitRate < 5) {
    problems.push({
      level: "danger",
      title: "순이익률이 위험합니다.",
      body: `이번 달 순이익률은 ${profitRate}%입니다. 식당 운영 기준으로 5% 미만이면 매출은 있어도 실제로 남는 돈이 거의 없는 구조입니다.`
    });
    actions.push({
      level: "danger",
      title: "다음달은 비용 절감보다 '남는 메뉴/시간대'를 먼저 봐야 합니다.",
      body: "원가 높은 메뉴, 배달 할인, 피크타임 인력 배치를 같이 줄여야 합니다. 단순히 매출만 올리면 수수료와 원가도 같이 올라갈 수 있습니다."
    });
  } else if (profitRate < 10) {
    problems.push({
      level: "warning",
      title: "순이익률이 낮습니다.",
      body: `이번 달 순이익률은 ${profitRate}%입니다. 안정권으로 보려면 최소 10% 이상, 목표는 12~15%로 잡는 게 좋습니다.`
    });
  } else if (profitRate >= 15) {
    problems.push({
      level: "good",
      title: "순이익률은 좋은 편입니다.",
      body: `이번 달 순이익률은 ${profitRate}%입니다. 이 상태에서는 비용 절감보다 매출 확대와 재방문 관리가 더 중요합니다.`
    });
  }

  if (cogsRate > 40) {
    problems.push({
      level: "danger",
      title: "원가율이 높습니다.",
      body: `매출원가율이 ${cogsRate}%입니다. 국밥/한식 매장 기준으로 40%를 넘으면 판매가, 양, 로스, 서비스 제공량 중 하나는 반드시 점검해야 합니다.`
    });
    actions.push({
      level: "danger",
      title: "원가율 목표를 35~37%로 낮추세요.",
      body: `현재 매출 기준 목표 원가는 약 ${formatWon(Math.round(revenue * 0.36))}입니다. 이번 달 원가에서 ${formatWon(Math.max(0, cogs - revenue * 0.36))} 정도 줄이는 게 1차 목표입니다.`
    });
  } else if (cogsRate > 35) {
    problems.push({
      level: "warning",
      title: "원가율이 약간 높습니다.",
      body: `매출원가율이 ${cogsRate}%입니다. 나쁘진 않지만 35% 아래로 잡으면 순이익이 훨씬 편해집니다.`
    });
  }

  if (laborRate > 28) {
    problems.push({
      level: "danger",
      title: "인건비율이 높습니다.",
      body: `인건비율이 ${laborRate}%입니다. 대표가 직접 일하는 매장인데 이 정도면 스케줄, 휴게시간, 피크타임 배치 재조정이 필요합니다.`
    });
    actions.push({
      level: "danger",
      title: "인건비는 매출 시간대별로 다시 짜야 합니다.",
      body: "점심/저녁 피크에는 유지하고, 준비·마감·브레이크 타임 인력을 줄이는 방식이 현실적입니다. 전체 인원을 자르는 것보다 비피크 시간 누수를 줄이는 게 먼저입니다."
    });
  } else if (laborRate > 24) {
    problems.push({
      level: "warning",
      title: "인건비율이 관리 필요 구간입니다.",
      body: `인건비율이 ${laborRate}%입니다. 22~24% 안쪽으로 들어오면 손익이 훨씬 안정됩니다.`
    });
  }

  if (deliveryShare > 45 && deliveryFeeRate > 7) {
    problems.push({
      level: "warning",
      title: "배달 비중과 수수료 부담을 같이 봐야 합니다.",
      body: `배달매출 비중은 ${deliveryShare}%, 배달앱 수수료율은 ${deliveryFeeRate}%입니다. 배달이 매출을 키우지만 순이익을 깎는 구조일 수 있습니다.`
    });
    actions.push({
      level: "warning",
      title: "배달 할인은 무조건 줄이지 말고 메뉴별로 분리하세요.",
      body: "객단가 높은 메뉴에는 할인 유지, 마진 낮은 메뉴에는 쿠폰/배달팁 지원을 줄이는 방식이 좋습니다. 최소주문금액도 같이 점검하세요."
    });
  }

  if (adRate > 6) {
    problems.push({
      level: "warning",
      title: "광고비율이 높습니다.",
      body: `광고비율이 ${adRate}%입니다. 광고를 끄는 게 답은 아니지만, 매출 대비 광고비가 5~6%를 넘으면 효율 검증이 필요합니다.`
    });
    actions.push({
      level: "warning",
      title: "광고는 시간대별로 끊어서 보세요.",
      body: "점심·저녁 피크 전환율이 좋은 시간만 남기고, 주문 전환이 약한 시간대 광고는 줄이는 게 좋습니다."
    });
  }

  if (rentRate > 10) {
    problems.push({
      level: "warning",
      title: "임차료 부담이 큽니다.",
      body: `임차료율이 ${rentRate}%입니다. 임차료는 줄이기 어렵기 때문에 필요한 월매출 기준을 역산해야 합니다.`
    });
    actions.push({
      level: "warning",
      title: "임차료 8% 기준 필요 매출을 잡으세요.",
      body: `현재 임차료 기준으로 임차료율 8%를 맞추려면 월매출 약 ${formatWon(Math.round(rent / 0.08))}이 필요합니다.`
    });
  }

  if (prevRevenue > 0) {
    const revenueDiff = revenue - prevRevenue;
    const profitDiff = profit - prevProfit;
    const profitRateDiff = profitRate - prevProfitRate;
    const cogsRateDiff = cogsRate - prevCogsRate;
    const laborRateDiff = laborRate - prevLaborRate;

    if (revenueDiff > 0 && profitDiff <= 0) {
      problems.push({
        level: "danger",
        title: "매출은 올랐는데 이익이 늘지 않았습니다.",
        body: `전월 대비 매출은 ${formatChange(revenueDiff)}인데 순이익은 ${formatChange(profitDiff)}입니다. 할인, 원가, 인건비, 수수료가 매출 증가분을 먹은 구조입니다.`
      });
    }

    if (cogsRateDiff > 3) {
      problems.push({
        level: "warning",
        title: "전월 대비 원가율이 상승했습니다.",
        body: `원가율이 전월보다 ${formatPoint(cogsRateDiff)} 올랐습니다. 주요 식자재 단가나 로스, 서비스 제공량을 확인해야 합니다.`
      });
    }

    if (laborRateDiff > 3) {
      problems.push({
        level: "warning",
        title: "전월 대비 인건비율이 상승했습니다.",
        body: `인건비율이 전월보다 ${formatPoint(laborRateDiff)} 올랐습니다. 매출 감소 때문인지, 근무시간 증가 때문인지 분리해서 봐야 합니다.`
      });
    }
  }

  if (problems.length === 0) {
    problems.push({
      level: "good",
      title: "큰 위험 신호는 없습니다.",
      body: "현재 입력된 데이터 기준으로 원가, 인건비, 수수료가 치명적인 구간은 아닙니다. 다음달은 비용 절감보다 매출 확대와 재방문율 관리에 집중해도 됩니다."
    });
  }

  if (actions.length === 0) {
    actions.push({
      level: "good",
      title: "다음달은 매출 확대 중심으로 가도 됩니다.",
      body: "핵심 비용률이 무너지지 않았다면 할인 확대보다 리뷰, 재방문, 피크타임 회전율 개선이 더 좋습니다."
    });
  }

  const targetRevenue = Math.max(revenue * 1.05, expense / 0.88);
  const targetProfit = targetRevenue * 0.12;

  const nextMonth = [
    `다음달 목표 매출: ${formatWon(Math.round(targetRevenue))}`,
    `다음달 목표 순이익: ${formatWon(Math.round(targetProfit))} 이상`,
    `원가율 목표: 35~37% 이하`,
    `인건비율 목표: 22~24% 이하`,
    `광고비율 목표: 5% 이하`,
    `배달앱 수수료율은 매출 대비 7~8% 안쪽으로 관리`
  ];

  const verdict =
    profitRate < 5
      ? "이번 달은 이익 구조가 위험합니다. 다음달은 매출 확대보다 원가·인건비·배달비 누수부터 막아야 합니다."
      : profitRate < 10
      ? "이번 달은 버는 구조는 있지만 안정적이지 않습니다. 다음달은 비용률을 2~3%p 낮추는 게 핵심입니다."
      : profitRate >= 15
      ? "이번 달은 손익 구조가 좋습니다. 다음달은 비용 절감보다 매출 확대와 재방문 유지가 우선입니다."
      : "이번 달은 기본 손익 구조는 괜찮습니다. 다음달은 원가율과 인건비율만 더 조이면 안정권입니다.";

  return {
    headline: "월결산 분석",
    verdict,
    problems,
    actions,
    nextMonth,
    numbers: [
      { label: "매출", value: formatWon(revenue) },
      { label: "지출", value: formatWon(expense) },
      { label: "순이익", value: formatWon(profit) },
      { label: "순이익률", value: `${profitRate}%` },
      { label: "원가율", value: `${cogsRate}%` },
      { label: "인건비율", value: `${laborRate}%` },
      { label: "배달매출 비중", value: `${deliveryShare}%` },
      { label: "배달수수료율", value: `${deliveryFeeRate}%` }
    ]
  };
}



type ReportRow = {
  label: string;
  amount: number;
  rate: number;
  note?: string;
};

function buildReportData(summary: Summary | null, prevSummary: Summary | null) {
  const rows = summary?.rows || [];
  const revenue = summary?.totalRevenue || 0;
  const expense = summary?.totalExpense || 0;
  const profit = summary?.netProfit || 0;
  const profitRate = calcRate(profit, revenue);

  const groupBy = (
    filter: (row: Summary["rows"][number]) => boolean,
    labeler: (row: Summary["rows"][number]) => string
  ) => {
    const map = new Map<string, number>();
    rows.filter(filter).forEach((row) => {
      const label = labeler(row) || "기타";
      map.set(label, (map.get(label) || 0) + row.total_amount);
    });

    return Array.from(map.entries())
      .map(([label, amount]) => ({
        label,
        amount,
        rate: calcRate(amount, revenue)
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const sumByMain = (name: string) =>
    rows
      .filter((r) => r.transaction_type === "expense" && r.main_account_name === name)
      .reduce((sum, r) => sum + r.total_amount, 0);

  const sumBySub = (name: string) =>
    rows
      .filter((r) => r.transaction_type === "expense" && r.sub_account_name === name)
      .reduce((sum, r) => sum + r.total_amount, 0);

  const sumByDetail = (name: string) =>
    rows
      .filter((r) => r.transaction_type === "expense" && r.detail_account_name === name)
      .reduce((sum, r) => sum + r.total_amount, 0);

  const revenueRows: ReportRow[] = groupBy(
    (r) => r.transaction_type === "revenue",
    (r) => r.sub_account_name || r.main_account_name || "매출"
  );

  const expenseRows: ReportRow[] = [
    { label: "매출원가", amount: sumByMain("매출원가"), rate: calcRate(sumByMain("매출원가"), revenue), note: "식자재·주류·음료 원가" },
    { label: "인건비", amount: sumByMain("인건비"), rate: calcRate(sumByMain("인건비"), revenue), note: "급여·알바비·4대보험 등" },
    { label: "고정비", amount: sumByMain("고정비"), rate: calcRate(sumByMain("고정비"), revenue), note: "임차료·관리비·수도광열비 등" },
    { label: "변동비", amount: sumByMain("변동비"), rate: calcRate(sumByMain("변동비"), revenue), note: "배달앱·카드수수료·광고 등" },
    { label: "운영비", amount: sumByMain("운영비"), rate: calcRate(sumByMain("운영비"), revenue), note: "소모품·통신·수선·접대 등" },
    { label: "기타비용", amount: sumByMain("기타비용"), rate: calcRate(sumByMain("기타비용"), revenue), note: "잡비·예비비" }
  ].filter((row) => row.amount > 0);

  const keyCostRows: ReportRow[] = [
    { label: "원가율", amount: sumByMain("매출원가"), rate: calcRate(sumByMain("매출원가"), revenue), note: "목표 35~37% 이하" },
    { label: "인건비율", amount: sumByMain("인건비"), rate: calcRate(sumByMain("인건비"), revenue), note: "목표 22~24% 이하" },
    { label: "임차료율", amount: sumBySub("임차료"), rate: calcRate(sumBySub("임차료"), revenue), note: "목표 8~10% 이하" },
    { label: "배달수수료율", amount: sumByDetail("배달앱 수수료"), rate: calcRate(sumByDetail("배달앱 수수료"), revenue), note: "목표 7~8% 이하" },
    { label: "광고비율", amount: sumBySub("광고선전비"), rate: calcRate(sumBySub("광고선전비"), revenue), note: "목표 5% 이하" }
  ];

  const nonProfitRows: ReportRow[] = groupBy(
    (r) => r.transaction_type === "non_profit",
    (r) => r.detail_account_name || r.sub_account_name || r.main_account_name || "비손익거래"
  );

  const prevRevenue = prevSummary?.totalRevenue || 0;
  const prevExpense = prevSummary?.totalExpense || 0;
  const prevProfit = prevSummary?.netProfit || 0;

  const compareRows = [
    { label: "매출", current: revenue, previous: prevRevenue, diff: revenue - prevRevenue },
    { label: "지출", current: expense, previous: prevExpense, diff: expense - prevExpense },
    { label: "순이익", current: profit, previous: prevProfit, diff: profit - prevProfit }
  ];

  return {
    revenue,
    expense,
    profit,
    profitRate,
    nonProfitCashFlow: summary?.nonProfitCashFlow || 0,
    revenueRows,
    expenseRows,
    keyCostRows,
    nonProfitRows,
    compareRows
  };
}

function getReportJudgement(label: string, rate: number) {
  if (label === "원가율") {
    if (rate > 40) return "위험";
    if (rate > 35) return "관리";
    return "양호";
  }
  if (label === "인건비율") {
    if (rate > 28) return "위험";
    if (rate > 24) return "관리";
    return "양호";
  }
  if (label === "임차료율") {
    if (rate > 10) return "관리";
    return "양호";
  }
  if (label === "배달수수료율") {
    if (rate > 8) return "관리";
    return "양호";
  }
  if (label === "광고비율") {
    if (rate > 6) return "관리";
    return "양호";
  }
  return "-";
}


function buildCashReport(items: CashItem[], todayDate: string) {
  const activeScheduled = items.filter((item) => item.item_type === "out_scheduled" && item.status !== "완료");
  const accounts = items.filter((item) => item.item_type === "account");
  const paidToday = items.filter((item) => item.item_type === "out_done" && item.record_date === todayDate);

  const totalCash = accounts
    .filter((item) => !item.exclude_from_cash)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidTodayTotal = paidToday.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const scheduledTotal = activeScheduled.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expectedBalance = totalCash - scheduledTotal;

  const vendorMap = new Map<string, number>();
  activeScheduled.forEach((item) => {
    const key = item.vendor || "미지정";
    vendorMap.set(key, (vendorMap.get(key) || 0) + Number(item.amount || 0));
  });

  const vendorSummary = Array.from(vendorMap.entries())
    .map(([vendor, amount]) => ({ vendor, amount }))
    .sort((a, b) => b.amount - a.amount);

  const groupMap = new Map<string, number>();
  accounts.filter((item) => !item.exclude_from_cash).forEach((item) => {
    const key = item.group_name || "기타";
    groupMap.set(key, (groupMap.get(key) || 0) + Number(item.amount || 0));
  });

  const groupSummary = Array.from(groupMap.entries())
    .map(([group, amount]) => ({ group, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    accounts,
    paidToday,
    scheduled: activeScheduled,
    paidTodayTotal,
    totalCash,
    scheduledTotal,
    expectedBalance,
    vendorSummary,
    groupSummary
  };
}


function buildCashAiAnalysis(cashReport: ReturnType<typeof buildCashReport>) {
  const shortage = Math.max(0, Math.abs(Math.min(cashReport.expectedBalance, 0)));
  const coverageRate = cashReport.scheduledTotal > 0 ? Math.round((cashReport.totalCash / cashReport.scheduledTotal) * 100) : 100;
  const biggestVendor = cashReport.vendorSummary[0];
  const secondVendor = cashReport.vendorSummary[1];

  const riskLevel =
    cashReport.expectedBalance < 0 ? "위험" :
    cashReport.expectedBalance < cashReport.scheduledTotal * 0.15 ? "주의" :
    "양호";

  const headline =
    riskLevel === "위험"
      ? `현재 출금예정 대비 ${formatWon(shortage)} 부족합니다.`
      : riskLevel === "주의"
      ? "출금 후 남는 여유자금이 얇습니다."
      : "현재 자금흐름은 안정권입니다.";

  const problem =
    riskLevel === "위험"
      ? `보유자금은 출금예정의 ${coverageRate}% 수준입니다. 출금예정 전액을 처리하면 잔액이 마이너스로 내려갑니다.`
      : riskLevel === "주의"
      ? `출금예정 처리 후 남는 금액이 크지 않습니다. 추가 식자재 발주나 세금 납부가 생기면 바로 부족해질 수 있습니다.`
      : `출금예정을 반영해도 현금 여유가 남습니다. 다만 큰 발주나 세금 일정이 추가되면 다시 점검해야 합니다.`;

  const priority = biggestVendor
    ? `${biggestVendor.vendor} ${formatWon(biggestVendor.amount)}이 가장 큰 지급 부담입니다.${secondVendor ? ` 다음은 ${secondVendor.vendor} ${formatWon(secondVendor.amount)}입니다.` : ""}`
    : "출금예정 거래처가 없습니다.";

  const action =
    riskLevel === "위험"
      ? "1순위는 큰 거래처 지급일 분산, 2순위는 팔팔 운영계좌 보강, 3순위는 보류 가능한 지출 선별입니다."
      : riskLevel === "주의"
      ? "지급일이 몰린 거래처를 먼저 확인하고, 추가 발주 전 예상잔액을 다시 확인하세요."
      : "현재는 지급 가능 구간입니다. 단, 예치금 제외 기준을 유지하고 출금예정 누락 여부만 확인하면 됩니다.";

  const bullets = [
    problem,
    priority,
    action
  ];

  return {
    riskLevel,
    headline,
    shortage,
    coverageRate,
    biggestVendor,
    bullets
  };
}


export default function Page() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [month, setMonth] = useState(getCurrentMonth());
  const [tab, setTab] = useState<Tab>("input");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null);
  const [cashItems, setCashItems] = useState<CashItem[]>([]);
  const [cashDate, setCashDate] = useState(getTodayDate());
  const [cashForm, setCashForm] = useState<CashForm>(blankCashForm(getCurrentMonth()));
  const [cashSaving, setCashSaving] = useState(false);
  const [bulkCashSaving, setBulkCashSaving] = useState(false);
  const [accountGridRows, setAccountGridRows] = useState<QuickCashRow[]>([]);
  const [todayOutGridRows, setTodayOutGridRows] = useState<QuickCashRow[]>([]);
  const [scheduledGridRows, setScheduledGridRows] = useState<QuickCashRow[]>([]);
  const [form, setForm] = useState(blankForm(getCurrentMonth()));
  const [saving, setSaving] = useState(false);

  const [newAccount, setNewAccount] = useState({
    parent_id: "",
    name: "",
    account_type: "expense" as TransactionType,
    level: 1
  });

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => setAuthed(Boolean(d.authed)))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      settlement_month: month,
      transaction_date: f.id ? f.transaction_date : `${month}-01`
    }));
    setCashForm((f) => ({
      ...f,
      settlement_month: month,
      record_date: f.id ? f.record_date : (getTodayDate().startsWith(month) ? getTodayDate() : `${month}-01`)
    }));
  }, [month]);

  useEffect(() => {
    const nextAccounts = fixedCashAccounts.map((fixed) => {
      const found = cashItems.find((item) =>
        item.item_type === "account" &&
        ((fixed.account_number && item.account_number === fixed.account_number) || item.account_name === fixed.account_name)
      );

      return {
        ...fixed,
        id: found?.id || "",
        record_date: found?.record_date || (getTodayDate().startsWith(month) ? getTodayDate() : `${month}-01`),
        item_type: "account" as CashItemType,
        category: "계좌",
        vendor: "",
        amount: found?.amount ? String(found.amount) : "",
        status: "",
        memo: found?.memo || fixed.memo || "",
        exclude_from_cash: fixed.exclude_from_cash
      };
    });

    setAccountGridRows(nextAccounts);
  }, [cashItems, month]);

  useEffect(() => {
    const existing = cashItems
      .filter((item) => item.item_type === "out_done" && item.record_date === cashDate)
      .map(quickRowFromCashItem);

    const blankCount = Math.max(3, 6 - existing.length);
    const blanks = Array.from({ length: blankCount }, (_, index) => blankQuickCashRow("out_done", month, cashDate, index));
    setTodayOutGridRows([...existing, ...blanks]);
  }, [cashItems, cashDate, month]);

  useEffect(() => {
    const existing = cashItems
      .filter((item) => item.item_type === "out_scheduled" && item.status !== "완료")
      .map(quickRowFromCashItem);

    const blankCount = Math.max(3, 8 - existing.length);
    const blanks = Array.from({ length: blankCount }, (_, index) => blankQuickCashRow("out_scheduled", month, `${month}-01`, index));
    setScheduledGridRows([...existing, ...blanks]);
  }, [cashItems, month]);

  useEffect(() => {
    if (!authed) return;
    refreshAll();
  }, [authed, month]);

  const mainAccounts = useMemo(
    () => accounts.filter((a) => a.level === 1),
    [accounts]
  );

  const subAccounts = useMemo(
    () => accounts.filter((a) => a.parent_id === form.main_account_id),
    [accounts, form.main_account_id]
  );

  const detailAccounts = useMemo(
    () => accounts.filter((a) => a.parent_id === form.sub_account_id),
    [accounts, form.sub_account_id]
  );

  const selectedMain = accounts.find((a) => a.id === form.main_account_id);
  const selectedSub = accounts.find((a) => a.id === form.sub_account_id);

  async function api(path: string, options?: RequestInit) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setAuthed(true);
    } catch (e: any) {
      setLoginError(e.message);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  }

  async function refreshAll() {
    await Promise.all([loadAccounts(), loadTransactions(), loadSummary(), loadPrevSummary(), loadCashItems()]);
  }

  async function loadAccounts() {
    const data = await api("/api/accounts");
    setAccounts(data.accounts || []);
  }

  async function loadTransactions() {
    const data = await api(`/api/transactions?month=${month}`);
    setTransactions(data.transactions || []);
  }

  async function loadSummary() {
    const data = await api(`/api/summary?month=${month}`);
    setSummary(data.summary);
  }

  async function loadPrevSummary() {
    const data = await api(`/api/summary?month=${getPrevMonth(month)}`);
    setPrevSummary(data.summary);
  }

  async function loadCashItems() {
    try {
      const data = await api(`/api/cash-items?month=${month}`);
      setCashItems(data.items || []);
    } catch (e) {
      setCashItems([]);
    }
  }

  function updateForm(key: string, value: string) {
    setForm((prev) => {
      const next: any = { ...prev, [key]: value };

      if (key === "transaction_date") {
        next.settlement_month = toSettlementMonth(value);
      }

      if (key === "main_account_id") {
        const acc = accounts.find((a) => a.id === value);
        next.transaction_type = acc?.account_type || prev.transaction_type;
        next.sub_account_id = "";
        next.detail_account_id = "";
      }

      if (key === "sub_account_id") {
        next.detail_account_id = "";
      }

      return next;
    });
  }

  async function saveTransaction(e: React.FormEvent) {
    e.preventDefault();

    if (!form.transaction_date) return alert("날짜를 입력하세요.");
    if (!form.main_account_id) return alert("대분류를 선택하세요.");
    if (!form.amount || normalizeAmount(form.amount) <= 0) return alert("금액을 입력하세요.");

    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: normalizeAmount(form.amount),
        transaction_type: selectedMain?.account_type || form.transaction_type,
        settlement_month: toSettlementMonth(form.transaction_date)
      };

      await api("/api/transactions", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });

      setForm(blankForm(month));
      await refreshAll();
      setTab("list");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function editTransaction(t: Transaction) {
    setForm({
      id: t.id,
      transaction_date: t.transaction_date,
      settlement_month: t.settlement_month,
      transaction_type: t.transaction_type,
      main_account_id: t.main_account_id || "",
      sub_account_id: t.sub_account_id || "",
      detail_account_id: t.detail_account_id || "",
      vendor: t.vendor || "",
      amount: String(t.amount || ""),
      payment_method: t.payment_method || "현금",
      memo: t.memo || ""
    });
    setTab("input");
  }

  async function deleteTransaction(id: string) {
    if (!confirm("이 거래를 삭제할까요?")) return;
    await api("/api/transactions", {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    await refreshAll();
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();

    if (!newAccount.name.trim()) return alert("계정명을 입력하세요.");

    let parent: Account | undefined;
    if (newAccount.parent_id) {
      parent = accounts.find((a) => a.id === newAccount.parent_id);
    }

    const payload = {
      parent_id: newAccount.parent_id || null,
      name: newAccount.name.trim(),
      account_type: parent?.account_type || newAccount.account_type,
      level: parent ? parent.level + 1 : 1,
      sort_order: 999
    };

    if (payload.level > 3) return alert("세부항목 아래에는 추가할 수 없습니다.");

    await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setNewAccount({
      parent_id: "",
      name: "",
      account_type: "expense",
      level: 1
    });
    await loadAccounts();
  }

  async function deleteAccount(id: string) {
    if (!confirm("계정과목을 삭제할까요? 기존 거래에 연결된 계정은 삭제되지 않을 수 있습니다.")) return;
    await api("/api/accounts", {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    await loadAccounts();
  }


  function updateCashForm(key: keyof CashForm, value: string | boolean) {
    setCashForm((prev) => {
      const next = { ...prev, [key]: value } as CashForm;
      if (key === "record_date" && typeof value === "string") {
        next.settlement_month = toSettlementMonth(value);
      }
      if (key === "item_type") {
        if (value === "account") {
          next.category = "계좌";
          next.status = "";
        } else if (value === "out_done") {
          next.status = "완료";
          next.category = next.category === "계좌" ? "식자재" : next.category;
        } else if (value === "out_scheduled") {
          next.status = "예정";
          next.category = next.category === "계좌" ? "식자재" : next.category;
        } else if (value === "in_scheduled") {
          next.status = "예정";
          next.category = "배달정산";
        }
      }
      return next;
    });
  }

  async function saveCashItem(e: React.FormEvent) {
    e.preventDefault();

    if (!cashForm.record_date) return alert("날짜를 입력하세요.");
    if (!cashForm.amount || normalizeAmount(cashForm.amount) <= 0) return alert("금액을 입력하세요.");

    if (cashForm.item_type === "account" && !cashForm.account_name.trim()) {
      return alert("계좌명을 입력하세요.");
    }

    if (cashForm.item_type !== "account" && !cashForm.vendor.trim()) {
      return alert("거래처/입금처를 입력하세요.");
    }

    setCashSaving(true);
    try {
      const payload = {
        ...cashForm,
        amount: normalizeAmount(cashForm.amount),
        settlement_month: toSettlementMonth(cashForm.record_date)
      };

      await api("/api/cash-items", {
        method: cashForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });

      setCashForm(blankCashForm(month));
      await loadCashItems();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCashSaving(false);
    }
  }

  function editCashItem(item: CashItem) {
    setCashForm({
      id: item.id,
      record_date: item.record_date,
      settlement_month: item.settlement_month,
      item_type: item.item_type,
      group_name: item.group_name || "팔팔",
      category: item.category || "",
      vendor: item.vendor || "",
      amount: String(item.amount || ""),
      account_name: item.account_name || "",
      bank: item.bank || "",
      account_number: item.account_number || "",
      status: item.status || "",
      memo: item.memo || "",
      exclude_from_cash: Boolean(item.exclude_from_cash)
    });
    setTab("cash");
  }

  async function deleteCashItem(id: string) {
    if (!confirm("이 자금일보 항목을 삭제할까요?")) return;
    await api("/api/cash-items", {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    await loadCashItems();
  }

  function updateGridRow(
    setter: React.Dispatch<React.SetStateAction<QuickCashRow[]>>,
    index: number,
    key: keyof QuickCashRow,
    value: string | boolean
  ) {
    setter((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  function addGridRows(
    setter: React.Dispatch<React.SetStateAction<QuickCashRow[]>>,
    itemType: CashItemType,
    count: number
  ) {
    const date = itemType === "out_done" ? cashDate : `${month}-01`;
    setter((prev) => [
      ...prev,
      ...Array.from({ length: count }, (_, index) => blankQuickCashRow(itemType, month, date, prev.length + index))
    ]);
  }

  async function saveCashGridRows(rows: QuickCashRow[], itemType: CashItemType) {
    setBulkCashSaving(true);
    try {
      for (const row of rows) {
        const amount = normalizeAmount(row.amount);
        const isAccount = itemType === "account";
        const hasRequiredText = isAccount ? row.account_name.trim() : row.vendor.trim();

        if (!hasRequiredText && amount <= 0 && !row.id) continue;

        if (!isAccount && row.id && !row.vendor.trim() && amount <= 0) {
          await api("/api/cash-items", {
            method: "DELETE",
            body: JSON.stringify({ id: row.id })
          });
          continue;
        }

        if (!isAccount && (!row.vendor.trim() || amount <= 0)) continue;

        const payload = {
          id: row.id,
          record_date: row.record_date || (itemType === "out_done" ? cashDate : `${month}-01`),
          settlement_month: toSettlementMonth(row.record_date || (itemType === "out_done" ? cashDate : `${month}-01`)),
          item_type: itemType,
          group_name: row.group_name || "팔팔",
          category: row.category || (isAccount ? "계좌" : "식자재"),
          vendor: isAccount ? "" : row.vendor,
          amount,
          account_name: row.account_name || row.group_name,
          bank: row.bank,
          account_number: row.account_number,
          status: isAccount ? "" : itemType === "out_done" ? "완료" : row.status || "예정",
          memo: row.memo,
          exclude_from_cash: isAccount ? row.exclude_from_cash : false
        };

        await api("/api/cash-items", {
          method: row.id ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        });
      }

      await loadCashItems();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBulkCashSaving(false);
    }
  }


  function exportExcel() {
    const rows = transactions.map((t) => ({
      날짜: t.transaction_date,
      구분: typeLabel[t.transaction_type],
      대분류: t.main_account_name || "",
      중분류: t.sub_account_name || "",
      세부항목: t.detail_account_name || "",
      거래처: t.vendor || "",
      금액: t.amount,
      결제수단: t.payment_method,
      메모: t.memo || ""
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래내역");
    XLSX.writeFile(wb, `팔팔너구리해장_거래내역_${month}.xlsx`);
  }

  function exportSummaryExcel() {
    const s = summary;
    if (!s) return;

    const rows = [
      { 항목: "총매출", 금액: s.totalRevenue },
      { 항목: "총지출", 금액: s.totalExpense },
      { 항목: "순이익", 금액: s.netProfit },
      { 항목: "비손익 현금흐름", 금액: s.nonProfitCashFlow },
      {},
      ...s.rows.map((r) => ({
        구분: typeLabel[r.transaction_type],
        대분류: r.main_account_name || "",
        중분류: r.sub_account_name || "",
        세부항목: r.detail_account_name || "",
        금액: r.total_amount
      }))
    ];

    const ws = XLSX.utils.json_to_sheet(rows as any);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "결산요약");
    XLSX.writeFile(wb, `팔팔너구리해장_결산요약_${month}.xlsx`);
  }

  const groupedTransactions = useMemo(() => {
    return transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
      acc[t.transaction_date] ||= [];
      acc[t.transaction_date].push(t);
      return acc;
    }, {});
  }, [transactions]);

  const summaryRates = useMemo(() => {
    const s = summary;
    if (!s) return { cogs: 0, labor: 0, rent: 0, deliveryFee: 0, ad: 0, profit: 0 };

    const sumByMain = (name: string) =>
      s.rows
        .filter((r) => r.transaction_type === "expense" && r.main_account_name === name)
        .reduce((sum, r) => sum + r.total_amount, 0);

    const sumBySub = (name: string) =>
      s.rows
        .filter((r) => r.transaction_type === "expense" && r.sub_account_name === name)
        .reduce((sum, r) => sum + r.total_amount, 0);

    const sumByDetail = (name: string) =>
      s.rows
        .filter((r) => r.transaction_type === "expense" && r.detail_account_name === name)
        .reduce((sum, r) => sum + r.total_amount, 0);

    return {
      cogs: calcRate(sumByMain("매출원가"), s.totalRevenue),
      labor: calcRate(sumByMain("인건비"), s.totalRevenue),
      rent: calcRate(sumBySub("임차료"), s.totalRevenue),
      deliveryFee: calcRate(sumByDetail("배달앱 수수료"), s.totalRevenue),
      ad: calcRate(sumBySub("광고선전비"), s.totalRevenue),
      profit: calcRate(s.netProfit, s.totalRevenue)
    };
  }, [summary]);


  const monthlyAnalysis = useMemo(() => {
    return buildMonthlyAnalysis(summary, prevSummary, transactions);
  }, [summary, prevSummary, transactions]);

  const reportData = useMemo(() => {
    return buildReportData(summary, prevSummary);
  }, [summary, prevSummary]);

  const cashReport = useMemo(() => {
    return buildCashReport(cashItems, cashDate);
  }, [cashItems, cashDate]);

  const cashAiAnalysis = useMemo(() => {
    return buildCashAiAnalysis(cashReport);
  }, [cashReport]);

  if (checking) {
    return <div className="login-wrap"><div className="muted">불러오는 중...</div></div>;
  }

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={login}>
          <div className="logo">팔팔너구리해장 월결산</div>
          <div className="subtitle">식당 손익 확인용 결산 시스템</div>

          <div style={{ height: 28 }} />

          <div className="field">
            <label>접속 비밀번호</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="비밀번호 입력"
            />
          </div>

          <div style={{ height: 16 }} />
          <button className="btn btn-blue full" type="submit">접속하기</button>

          {loginError && <div className="error">{loginError}</div>}
        </form>
      </div>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <div className="logo">팔팔너구리해장 월결산</div>
          <div className="subtitle">거래 기반 매장 손익 확인 시스템</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }} className="no-print">
          <input
            className="month-select"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button className="btn btn-ghost" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <nav className="tabs no-print">
        <button className={`tab ${tab === "input" ? "active" : ""}`} onClick={() => setTab("input")}>📝 거래 입력</button>
        <button className={`tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>📋 거래 목록</button>
        <button className={`tab ${tab === "accounts" ? "active" : ""}`} onClick={() => setTab("accounts")}>⚙️ 계정 관리</button>
        <button className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>📊 결산 요약</button>
        <button className={`tab ${tab === "analysis" ? "active" : ""}`} onClick={() => setTab("analysis")}>🧠 월결산 분석</button>
        <button className={`tab ${tab === "cash" ? "active" : ""}`} onClick={() => setTab("cash")}>💰 자금일보</button>
      </nav>

      {tab === "input" && (
        <section className="card">
          <h2 className="section-title">{form.id ? "거래 수정" : "새 거래 입력"}</h2>

          <form onSubmit={saveTransaction}>
            <div className="grid form-grid">
              <div className="field">
                <label>날짜 *</label>
                <input
                  className="input"
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => updateForm("transaction_date", e.target.value)}
                />
              </div>

              <div className="field">
                <label>구분</label>
                <select
                  className="select"
                  value={form.transaction_type}
                  onChange={(e) => {
                    const nextType = e.target.value as TransactionType;
                    setForm((prev) => ({
                      ...prev,
                      transaction_type: nextType,
                      main_account_id: "",
                      sub_account_id: "",
                      detail_account_id: ""
                    }));
                  }}
                >
                  <option value="revenue">매출</option>
                  <option value="expense">지출</option>
                  <option value="non_profit">비손익거래</option>
                </select>
              </div>

              <div className="field">
                <label>대분류 *</label>
                <select
                  className="select"
                  value={form.main_account_id}
                  onChange={(e) => updateForm("main_account_id", e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {mainAccounts
                    .filter((a) => a.account_type === form.transaction_type)
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>중분류</label>
                <select
                  className="select"
                  value={form.sub_account_id}
                  onChange={(e) => updateForm("sub_account_id", e.target.value)}
                >
                  <option value="">해당 없음</option>
                  {subAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>세부항목</label>
                <select
                  className="select"
                  value={form.detail_account_id}
                  onChange={(e) => updateForm("detail_account_id", e.target.value)}
                >
                  <option value="">해당 없음</option>
                  {detailAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div className="grid form-grid-2">
              <div className="field">
                <label>거래처</label>
                <input
                  className="input"
                  value={form.vendor}
                  onChange={(e) => updateForm("vendor", e.target.value)}
                  placeholder="거래처명 입력"
                />
              </div>

              <div className="field">
                <label>금액 *</label>
                <input
                  className="input"
                  value={form.amount ? Number(normalizeAmount(form.amount)).toLocaleString("ko-KR") : ""}
                  onChange={(e) => updateForm("amount", e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="field">
                <label>결제수단</label>
                <select
                  className="select"
                  value={form.payment_method}
                  onChange={(e) => updateForm("payment_method", e.target.value)}
                >
                  {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="field">
                <label>메모</label>
                <input
                  className="input"
                  value={form.memo}
                  onChange={(e) => updateForm("memo", e.target.value)}
                  placeholder="메모 입력"
                />
              </div>
            </div>

            <div style={{ height: 22 }} />

            <button className="btn btn-green full" type="submit" disabled={saving}>
              {saving ? "저장 중..." : form.id ? "거래 수정 저장" : "+ 거래 추가"}
            </button>

            {form.id && (
              <>
                <div style={{ height: 10 }} />
                <button
                  className="btn btn-ghost full"
                  type="button"
                  onClick={() => setForm(blankForm(month))}
                >
                  수정 취소
                </button>
              </>
            )}
          </form>
        </section>
      )}

      {tab === "list" && (
        <section className="card">
          <div className="actions">
            <button className="btn btn-dark" onClick={exportExcel}>거래내역 Excel 다운로드</button>
          </div>

          <h2 className="section-title">거래 내역 ({transactions.length}건)</h2>

          {Object.entries(groupedTransactions).map(([date, rows]) => (
            <div key={date} style={{ marginBottom: 30 }}>
              <h3 style={{ color: "var(--cyan)" }}>📅 {date}</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>대분류</th>
                      <th>중분류</th>
                      <th>세부항목</th>
                      <th>거래처</th>
                      <th>금액</th>
                      <th>결제수단</th>
                      <th>메모</th>
                      <th className="no-print">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <span className={`badge ${
                            t.transaction_type === "revenue"
                              ? "badge-revenue"
                              : t.transaction_type === "expense"
                              ? "badge-expense"
                              : "badge-non"
                          }`}>
                            {typeLabel[t.transaction_type]}
                          </span>
                        </td>
                        <td>{t.main_account_name || "-"}</td>
                        <td>{t.sub_account_name || "-"}</td>
                        <td>{t.detail_account_name || "-"}</td>
                        <td>{t.vendor || "-"}</td>
                        <td className={t.transaction_type === "revenue" ? "amount-revenue" : t.transaction_type === "expense" ? "amount-expense" : ""}>
                          {formatWon(t.amount)}
                        </td>
                        <td>{t.payment_method}</td>
                        <td>{t.memo || ""}</td>
                        <td className="no-print">
                          <button className="btn btn-ghost small" onClick={() => editTransaction(t)}>수정</button>{" "}
                          <button className="btn btn-red small" onClick={() => deleteTransaction(t.id)}>삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {!transactions.length && <div className="muted">해당 월 거래가 없습니다.</div>}
        </section>
      )}

      {tab === "accounts" && (
        <section className="card">
          <h2 className="section-title">계정 관리</h2>

          <form onSubmit={addAccount}>
            <div className="grid form-grid-2">
              <div className="field">
                <label>상위 계정</label>
                <select
                  className="select"
                  value={newAccount.parent_id}
                  onChange={(e) => setNewAccount((p) => ({ ...p, parent_id: e.target.value }))}
                >
                  <option value="">대분류로 추가</option>
                  {accounts
                    .filter((a) => a.level < 3)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {"　".repeat(a.level - 1)}{a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="field">
                <label>구분</label>
                <select
                  className="select"
                  value={newAccount.account_type}
                  disabled={Boolean(newAccount.parent_id)}
                  onChange={(e) => setNewAccount((p) => ({ ...p, account_type: e.target.value as TransactionType }))}
                >
                  <option value="revenue">매출</option>
                  <option value="expense">지출</option>
                  <option value="non_profit">비손익거래</option>
                </select>
              </div>

              <div className="field">
                <label>계정명</label>
                <input
                  className="input"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                  placeholder="예: 대출이자"
                />
              </div>

              <div className="field">
                <label>&nbsp;</label>
                <button className="btn btn-blue full" type="submit">+ 계정 추가</button>
              </div>
            </div>
          </form>

          <div style={{ height: 30 }} />

          {mainAccounts.map((main) => (
            <div className="account-box" key={main.id}>
              <AccountLine account={main} onDelete={deleteAccount} />
              <div className="account-children">
                {accounts.filter((a) => a.parent_id === main.id).map((sub) => (
                  <div key={sub.id}>
                    <AccountLine account={sub} onDelete={deleteAccount} />
                    <div className="account-children">
                      {accounts.filter((a) => a.parent_id === sub.id).map((detail) => (
                        <AccountLine key={detail.id} account={detail} onDelete={deleteAccount} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "summary" && (
        <section className="card report-card">
          <div className="actions no-print">
            <button className="btn btn-ghost" onClick={() => window.print()}>보고서 PDF 출력</button>
            <button className="btn btn-dark" onClick={exportSummaryExcel}>Excel 다운로드</button>
          </div>

          <div className="report-cover">
            <div>
              <div className="report-eyebrow">MONTHLY P&L REPORT</div>
              <h2 className="report-title">{month} 월간 손익 보고서</h2>
              <div className="report-subtitle">식당 운영 손익 확인용 · 세무 신고용 장부 아님</div>
            </div>
            <div className="report-meta">
              <div><span>보고월</span><strong>{month}</strong></div>
              <div><span>작성일</span><strong>{new Date().toLocaleDateString("ko-KR")}</strong></div>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>01</span>
              <h3>핵심 요약</h3>
            </div>

            <div className="report-kpi-grid">
              <div className="report-kpi">
                <div className="label">총매출</div>
                <div className="value">{formatWon(reportData.revenue)}</div>
              </div>
              <div className="report-kpi">
                <div className="label">총지출</div>
                <div className="value expense">{formatWon(reportData.expense)}</div>
              </div>
              <div className="report-kpi">
                <div className="label">순이익</div>
                <div className={reportData.profit >= 0 ? "value profit" : "value loss"}>{formatWon(reportData.profit)}</div>
              </div>
              <div className="report-kpi">
                <div className="label">순이익률</div>
                <div className={reportData.profitRate >= 10 ? "value profit" : "value warning"}>{reportData.profitRate}%</div>
              </div>
            </div>

            <div className="report-comment">
              <strong>총평</strong>
              <p>{monthlyAnalysis.verdict}</p>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>02</span>
              <h3>매출 현황</h3>
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>금액</th>
                    <th>매출 구성비</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.revenueRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num">{formatWon(row.amount)}</td>
                      <td className="num">{row.rate}%</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>총매출</td>
                    <td className="num">{formatWon(reportData.revenue)}</td>
                    <td className="num">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>03</span>
              <h3>비용 현황</h3>
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>대분류</th>
                    <th>내용</th>
                    <th>금액</th>
                    <th>매출 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.expenseRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.note}</td>
                      <td className="num">{formatWon(row.amount)}</td>
                      <td className="num">{row.rate}%</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>총지출</td>
                    <td>손익 계산에 포함되는 비용</td>
                    <td className="num">{formatWon(reportData.expense)}</td>
                    <td className="num">{calcRate(reportData.expense, reportData.revenue)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>04</span>
              <h3>주요 비용률 점검</h3>
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>지표</th>
                    <th>금액</th>
                    <th>비율</th>
                    <th>기준</th>
                    <th>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.keyCostRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num">{formatWon(row.amount)}</td>
                      <td className="num">{row.rate}%</td>
                      <td>{row.note}</td>
                      <td><span className={`report-status ${getReportJudgement(row.label, row.rate)}`}>{getReportJudgement(row.label, row.rate)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>05</span>
              <h3>전월 비교</h3>
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>이번 달</th>
                    <th>전월</th>
                    <th>증감</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.compareRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num">{formatWon(row.current)}</td>
                      <td className="num">{formatWon(row.previous)}</td>
                      <td className={row.diff >= 0 ? "num plus" : "num minus"}>{formatChange(row.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>06</span>
              <h3>비손익거래</h3>
            </div>

            <div className="report-comment light">
              보증금, 부가세, 대출원금, 대표자 인출입처럼 실제 돈은 움직였지만 손익 계산에는 넣지 않는 항목입니다.
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.nonProfitRows.length ? reportData.nonProfitRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num">{formatWon(row.amount)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={2}>해당 월 비손익거래 없음</td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td>비손익 현금흐름 합계</td>
                    <td className="num">{formatWon(reportData.nonProfitCashFlow)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-head">
              <span>07</span>
              <h3>다음달 관리 기준</h3>
            </div>

            <div className="report-next-list">
              {monthlyAnalysis.nextMonth.map((item) => (
                <div key={item}>• {item}</div>
              ))}
            </div>
          </div>

          {!summary?.rows?.length && <div className="muted" style={{ marginTop: 18 }}>해당 월 결산 데이터가 없습니다.</div>}
        </section>
      )}


      
      {tab === "cash" && (
        <section className="card">
          <div className="cash-hero">
            <div>
              <div className="cash-eyebrow">DAILY CASH REPORT</div>
              <h2 className="cash-title">{month} 자금일보</h2>
              <p>자금일보는 월결산 손익과 별개입니다. 계좌 잔액은 고정 계좌에 숫자만 입력하고, 지출은 엑셀처럼 셀에 바로 입력한 뒤 한 번에 저장합니다.</p>
            </div>
            <div className="actions no-print">
              <button className="btn btn-ghost" onClick={() => window.print()}>PDF 출력</button>
            </div>
          </div>

          <div className="cash-date-row no-print">
            <label>금일 출금 기준일</label>
            <input className="input" type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} />
          </div>

          <div className="grid cash-summary-grid daily">
            <div className="cash-summary-card">
              <div className="label">현재 보유자금</div>
              <div className="value cyan">{formatWon(cashReport.totalCash)}</div>
              <div className="sub">예치금 제외 기준</div>
            </div>
            <div className="cash-summary-card">
              <div className="label">금일 출금완료</div>
              <div className="value">{formatWon(cashReport.paidTodayTotal)}</div>
              <div className="sub">{cashDate} 실제 빠져나간 금액</div>
            </div>
            <div className="cash-summary-card">
              <div className="label">출금예정</div>
              <div className="value red">{formatWon(cashReport.scheduledTotal)}</div>
              <div className="sub">앞으로 나갈 금액</div>
            </div>
            <div className="cash-summary-card">
              <div className="label">예상잔액</div>
              <div className={cashReport.expectedBalance < 0 ? "value red" : "value green"}>{formatWon(cashReport.expectedBalance)}</div>
              <div className="sub">보유자금 - 출금예정</div>
            </div>
          </div>

          <div className={cashReport.expectedBalance < 0 ? "cash-alert danger" : "cash-alert good"}>
            <strong>{cashReport.expectedBalance < 0 ? "자금 부족 예상" : "자금 여유 예상"}</strong>
            <span>
              {cashReport.expectedBalance < 0
                ? `현재 기준 약 ${formatWon(Math.abs(cashReport.expectedBalance))}의 자금 부족이 예상됩니다. 지급일 조정 또는 출금예정 금액 재확인이 필요합니다.`
                : `출금예정 반영 후에도 ${formatWon(cashReport.expectedBalance)}의 여유자금이 예상됩니다.`}
            </span>
          </div>

          <div className="cash-ai-card">
            <div className="cash-ai-head">
              <div>
                <div className="cash-ai-eyebrow">AI CASH ANALYSIS</div>
                <h3>{cashAiAnalysis.headline}</h3>
              </div>
              <span className={`cash-ai-badge ${cashAiAnalysis.riskLevel}`}>{cashAiAnalysis.riskLevel}</span>
            </div>
            <div className="cash-ai-grid">
              <div>
                <strong>지급 커버율</strong>
                <span>{cashAiAnalysis.coverageRate}%</span>
              </div>
              <div>
                <strong>부족 예상액</strong>
                <span>{formatWon(cashAiAnalysis.shortage)}</span>
              </div>
              <div>
                <strong>최대 지급처</strong>
                <span>{cashAiAnalysis.biggestVendor ? `${cashAiAnalysis.biggestVendor.vendor} ${formatWon(cashAiAnalysis.biggestVendor.amount)}` : "없음"}</span>
              </div>
            </div>
            <ul className="cash-ai-list">
              {cashAiAnalysis.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>

          <div className="cash-grid-section">
            <div className="cash-panel-head">
              <h3>자금현황</h3>
              <span>계좌는 고정 · 잔액 숫자만 입력</span>
            </div>

            <div className="quick-grid-wrap">
              <table className="quick-grid-table account-grid-table">
                <thead>
                  <tr>
                    <th>소속</th>
                    <th>금융기관</th>
                    <th>계좌명</th>
                    <th>계좌번호</th>
                    <th>잔액</th>
                    <th>합계제외</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {accountGridRows.map((row, index) => (
                    <tr key={row.row_key}>
                      <td>{row.group_name}</td>
                      <td>{row.bank}</td>
                      <td>{row.account_name}</td>
                      <td>{row.account_number}</td>
                      <td>
                        <input
                          className="cell-input amount"
                          value={row.amount ? Number(normalizeAmount(row.amount)).toLocaleString("ko-KR") : ""}
                          onChange={(e) => updateGridRow(setAccountGridRows, index, "amount", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={row.exclude_from_cash}
                          onChange={(e) => updateGridRow(setAccountGridRows, index, "exclude_from_cash", e.target.checked)}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          value={row.memo}
                          onChange={(e) => updateGridRow(setAccountGridRows, index, "memo", e.target.value)}
                          placeholder="메모"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="quick-grid-actions no-print">
              <button className="btn btn-green" disabled={bulkCashSaving} onClick={() => saveCashGridRows(accountGridRows, "account")}>
                자금현황 저장
              </button>
            </div>
          </div>

          <div className="cash-grid-section">
            <div className="cash-panel-head">
              <h3>금일 출금완료</h3>
              <span>{cashDate} 기준 · 합계 {formatWon(cashReport.paidTodayTotal)}</span>
            </div>

            <div className="quick-grid-wrap">
              <table className="quick-grid-table today-out-table">
                <thead>
                  <tr>
                    <th>출금일</th>
                    <th>구분</th>
                    <th>거래처</th>
                    <th>금액</th>
                    <th>결제계좌</th>
                    <th>메모</th>
                    <th className="no-print">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {todayOutGridRows.map((row, index) => (
                    <tr key={row.row_key}>
                      <td><input className="cell-input" type="date" value={row.record_date} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "record_date", e.target.value)} /></td>
                      <td>
                        <select className="cell-input" value={row.category} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "category", e.target.value)}>
                          {cashCategories.filter((c) => c !== "배달정산" && c !== "카드정산").map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </td>
                      <td><input className="cell-input" value={row.vendor} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "vendor", e.target.value)} placeholder="거래처" /></td>
                      <td><input className="cell-input amount" value={row.amount ? Number(normalizeAmount(row.amount)).toLocaleString("ko-KR") : ""} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "amount", e.target.value)} placeholder="0" /></td>
                      <td>
                        <select className="cell-input" value={row.account_name || row.group_name} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "account_name", e.target.value)}>
                          <option>팔팔</option>
                          <option>프워</option>
                          <option>공통</option>
                        </select>
                      </td>
                      <td><input className="cell-input" value={row.memo} onChange={(e) => updateGridRow(setTodayOutGridRows, index, "memo", e.target.value)} placeholder="메모" /></td>
                      <td className="no-print center">
                        {row.id && <button className="cell-delete" onClick={() => deleteCashItem(row.id)}>삭제</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="quick-grid-actions no-print">
              <button className="btn btn-ghost" onClick={() => addGridRows(setTodayOutGridRows, "out_done", 5)}>+ 5행 추가</button>
              <button className="btn btn-green" disabled={bulkCashSaving} onClick={() => saveCashGridRows(todayOutGridRows, "out_done")}>
                금일 출금완료 저장
              </button>
            </div>
          </div>

          <div className="cash-grid-section">
            <div className="cash-panel-head">
              <h3>출금예정</h3>
              <span>합계 {formatWon(cashReport.scheduledTotal)}</span>
            </div>

            <div className="quick-grid-wrap">
              <table className="quick-grid-table scheduled-out-table">
                <thead>
                  <tr>
                    <th>예정일</th>
                    <th>구분</th>
                    <th>거래처</th>
                    <th>미지급잔액</th>
                    <th>결제계좌</th>
                    <th>상태</th>
                    <th>비고</th>
                    <th className="no-print">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledGridRows.map((row, index) => (
                    <tr key={row.row_key}>
                      <td><input className="cell-input" type="date" value={row.record_date} onChange={(e) => updateGridRow(setScheduledGridRows, index, "record_date", e.target.value)} /></td>
                      <td>
                        <select className="cell-input" value={row.category} onChange={(e) => updateGridRow(setScheduledGridRows, index, "category", e.target.value)}>
                          {cashCategories.filter((c) => c !== "배달정산" && c !== "카드정산").map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </td>
                      <td><input className="cell-input" value={row.vendor} onChange={(e) => updateGridRow(setScheduledGridRows, index, "vendor", e.target.value)} placeholder="거래처" /></td>
                      <td><input className="cell-input amount" value={row.amount ? Number(normalizeAmount(row.amount)).toLocaleString("ko-KR") : ""} onChange={(e) => updateGridRow(setScheduledGridRows, index, "amount", e.target.value)} placeholder="0" /></td>
                      <td>
                        <select className="cell-input" value={row.account_name || row.group_name} onChange={(e) => updateGridRow(setScheduledGridRows, index, "account_name", e.target.value)}>
                          <option>팔팔</option>
                          <option>프워</option>
                          <option>공통</option>
                        </select>
                      </td>
                      <td>
                        <select className="cell-input" value={row.status} onChange={(e) => updateGridRow(setScheduledGridRows, index, "status", e.target.value)}>
                          <option>예정</option>
                          <option>보류</option>
                          <option>완료</option>
                        </select>
                      </td>
                      <td><input className="cell-input" value={row.memo} onChange={(e) => updateGridRow(setScheduledGridRows, index, "memo", e.target.value)} placeholder="입고일/비고" /></td>
                      <td className="no-print center">
                        {row.id && <button className="cell-delete" onClick={() => deleteCashItem(row.id)}>삭제</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="quick-grid-actions no-print">
              <button className="btn btn-ghost" onClick={() => addGridRows(setScheduledGridRows, "out_scheduled", 5)}>+ 5행 추가</button>
              <button className="btn btn-green" disabled={bulkCashSaving} onClick={() => saveCashGridRows(scheduledGridRows, "out_scheduled")}>
                출금예정 저장
              </button>
            </div>
          </div>

          <div className="cash-panel vendor-summary">
            <div className="cash-panel-head">
              <h3>미지급 거래처 요약</h3>
              <span>출금예정 거래처별 자동 합산</span>
            </div>
            <div className="vendor-grid">
              {cashReport.vendorSummary.length ? cashReport.vendorSummary.map((row) => (
                <div className="vendor-card" key={row.vendor}>
                  <div>{row.vendor}</div>
                  <strong>{formatWon(row.amount)}</strong>
                  <span>출금예정 자동 합산</span>
                </div>
              )) : <div className="muted">출금예정 항목이 없습니다.</div>}
            </div>
          </div>

          <div className="cash-print-report">
            <div className="cash-print-header">
              <div>
                <div className="cash-print-eyebrow">DAILY CASH REPORT</div>
                <h1>자금일보 요약</h1>
                <p>내부 자금흐름 확인용 · 월결산 손익과 별도</p>
              </div>
              <div>
                <b>기준일</b> {cashDate}<br />
                <b>매장</b> 팔팔너구리해장
              </div>
            </div>

            <div className="cash-print-kpis">
              <div><span>현재 보유자금</span><strong>{formatWon(cashReport.totalCash)}</strong></div>
              <div><span>금일 출금완료</span><strong>{formatWon(cashReport.paidTodayTotal)}</strong></div>
              <div><span>출금예정</span><strong>{formatWon(cashReport.scheduledTotal)}</strong></div>
              <div><span>예상잔액</span><strong>{formatWon(cashReport.expectedBalance)}</strong></div>
            </div>

            <div className={cashReport.expectedBalance < 0 ? "cash-print-alert danger" : "cash-print-alert good"}>
              <b>AI 자금 진단</b> {cashAiAnalysis.headline} {cashAiAnalysis.bullets[1]}
            </div>

            <div className="cash-print-two">
              <div>
                <h2>01 자금현황</h2>
                <table>
                  <thead><tr><th>소속</th><th>계좌</th><th>잔액</th><th>비고</th></tr></thead>
                  <tbody>
                    {cashReport.accounts.slice(0, 5).map((item) => (
                      <tr key={item.id}><td>{item.group_name}</td><td>{item.account_name}</td><td>{formatWon(item.amount)}</td><td>{item.exclude_from_cash ? "제외" : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h2>02 금일 출금완료</h2>
                <table>
                  <thead><tr><th>구분</th><th>거래처</th><th>금액</th><th>계좌</th></tr></thead>
                  <tbody>
                    {cashReport.paidToday.slice(0, 5).map((item) => (
                      <tr key={item.id}><td>{item.category}</td><td>{item.vendor}</td><td>{formatWon(item.amount)}</td><td>{item.account_name}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cash-print-section">
              <h2>03 출금예정</h2>
              <table>
                <thead><tr><th>예정일</th><th>구분</th><th>거래처</th><th>미지급잔액</th><th>계좌</th><th>비고</th></tr></thead>
                <tbody>
                  {cashReport.scheduled.slice(0, 8).map((item) => (
                    <tr key={item.id}><td>{item.record_date}</td><td>{item.category}</td><td>{item.vendor}</td><td>{formatWon(item.amount)}</td><td>{item.account_name}</td><td>{item.memo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cash-print-two compact">
              <div>
                <h2>04 미지급 거래처 요약</h2>
                <div className="cash-print-vendors">
                  {cashReport.vendorSummary.slice(0, 6).map((row) => (
                    <div key={row.vendor}><span>{row.vendor}</span><strong>{formatWon(row.amount)}</strong></div>
                  ))}
                </div>
              </div>
              <div>
                <h2>05 AI 조치사항</h2>
                <ul>
                  {cashAiAnalysis.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>

            <div className="cash-print-footer">본 자료는 내부 자금흐름 확인용이며 세무 신고용 장부가 아닙니다.</div>
          </div>
        </section>
      )}

      {tab === "analysis" && (
        <section className="card">
          <div className="actions no-print">
            <button className="btn btn-ghost" onClick={() => window.print()}>PDF 출력</button>
          </div>

          <h2 className="section-title">{month} 월결산 분석</h2>

          <div className="analysis-hero">
            <div>
              <div className="analysis-label">총평</div>
              <div className="analysis-verdict">{monthlyAnalysis.verdict}</div>
            </div>
          </div>

          <div className="grid analysis-number-grid">
            {monthlyAnalysis.numbers.map((n) => (
              <div className="analysis-number" key={n.label}>
                <div className="label">{n.label}</div>
                <div className="value">{n.value}</div>
              </div>
            ))}
          </div>

          <div style={{ height: 24 }} />

          <div className="analysis-grid">
            <div>
              <h3 className="analysis-title">문제점</h3>
              {monthlyAnalysis.problems.map((item, idx) => (
                <div className={`analysis-item ${item.level}`} key={`${item.title}-${idx}`}>
                  <div className="analysis-item-title">{item.title}</div>
                  <div className="analysis-item-body">{item.body}</div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="analysis-title">개선 방향</h3>
              {monthlyAnalysis.actions.map((item, idx) => (
                <div className={`analysis-item ${item.level}`} key={`${item.title}-${idx}`}>
                  <div className="analysis-item-title">{item.title}</div>
                  <div className="analysis-item-body">{item.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 24 }} />

          <div className="next-plan">
            <h3 className="analysis-title">다음달 실행 기준</h3>
            <ul>
              {monthlyAnalysis.nextMonth.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="analysis-note">
            이 분석은 세무회계가 아니라 식당 손익 관리 기준입니다. 입력한 거래 데이터가 정확할수록 분석 품질이 좋아집니다.
          </div>
        </section>
      )}

    </main>
  );
}


function CashTable({
  columns,
  rows,
  empty,
  renderRow
}: {
  columns: string[];
  rows: CashItem[];
  empty: string;
  renderRow: (item: CashItem) => React.ReactNode;
}) {
  return (
    <div className="cash-table-wrap">
      <table className="cash-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((item) => renderRow(item)) : (
            <tr>
              <td colSpan={columns.length} className="empty-cell">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


function AccountLine({ account, onDelete }: { account: Account; onDelete: (id: string) => void }) {
  return (
    <div className="account-row">
      <div>
        <strong>{account.name}</strong>{" "}
        <span className={`badge ${
          account.account_type === "revenue" ? "badge-revenue" : account.account_type === "expense" ? "badge-expense" : "badge-non"
        }`}>
          {typeLabel[account.account_type]}
        </span>
      </div>
      <button className="btn btn-red small" onClick={() => onDelete(account.id)}>삭제</button>
    </div>
  );
}
