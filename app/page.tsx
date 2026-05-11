"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { Account, Summary, Transaction, TransactionType } from "@/types";
import { calcRate, formatWon, getCurrentMonth, normalizeAmount, toSettlementMonth } from "@/lib/utils";

type Tab = "input" | "list" | "accounts" | "summary";

const typeLabel: Record<TransactionType, string> = {
  revenue: "매출",
  expense: "지출",
  non_profit: "비손익"
};

const paymentMethods = ["현금", "체크카드", "신용카드", "계좌이체", "기타"];

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
  }, [month]);

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
    await Promise.all([loadAccounts(), loadTransactions(), loadSummary()]);
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
        <section className="card">
          <div className="actions no-print">
            <button className="btn btn-ghost" onClick={() => window.print()}>PDF 출력</button>
            <button className="btn btn-dark" onClick={exportSummaryExcel}>Excel 다운로드</button>
          </div>

          <h2 className="section-title">{month} 결산 요약</h2>

          <div className="grid summary-grid">
            <div className="summary-card">
              <div className="label">매출</div>
              <div className="value">{formatWon(summary?.totalRevenue || 0)}</div>
            </div>
            <div className="summary-card">
              <div className="label">지출</div>
              <div className="value">{formatWon(summary?.totalExpense || 0)}</div>
            </div>
            <div className="summary-card profit">
              <div className="label">순이익</div>
              <div className="value">{formatWon(summary?.netProfit || 0)}</div>
            </div>
          </div>

          <div className="grid summary-grid">
            <div className="summary-card">
              <div className="label">원가율</div>
              <div className="value">{summaryRates.cogs}%</div>
            </div>
            <div className="summary-card">
              <div className="label">인건비율</div>
              <div className="value">{summaryRates.labor}%</div>
            </div>
            <div className="summary-card">
              <div className="label">순이익률</div>
              <div className="value">{summaryRates.profit}%</div>
            </div>
          </div>

          <div className="grid summary-grid">
            <div className="summary-card">
              <div className="label">임차료율</div>
              <div className="value">{summaryRates.rent}%</div>
            </div>
            <div className="summary-card">
              <div className="label">배달수수료율</div>
              <div className="value">{summaryRates.deliveryFee}%</div>
            </div>
            <div className="summary-card">
              <div className="label">광고비율</div>
              <div className="value">{summaryRates.ad}%</div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>대분류</th>
                  <th>중분류</th>
                  <th>세부항목</th>
                  <th>금액</th>
                  <th>매출 대비</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.rows || []).map((r, idx) => (
                  <tr key={`${r.main_account_id}-${r.sub_account_id}-${r.detail_account_id}-${idx}`}>
                    <td>{typeLabel[r.transaction_type]}</td>
                    <td>{r.main_account_name || "-"}</td>
                    <td>{r.sub_account_name || "-"}</td>
                    <td>{r.detail_account_name || "-"}</td>
                    <td className={r.transaction_type === "revenue" ? "amount-revenue" : r.transaction_type === "expense" ? "amount-expense" : ""}>
                      {formatWon(r.total_amount)}
                    </td>
                    <td>{calcRate(r.total_amount, summary?.totalRevenue || 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!summary?.rows?.length && <div className="muted" style={{ marginTop: 18 }}>해당 월 결산 데이터가 없습니다.</div>}
        </section>
      )}
    </main>
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
