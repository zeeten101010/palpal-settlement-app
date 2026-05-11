export function getCurrentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatWon(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return `${n.toLocaleString("ko-KR")}원`;
}

export function calcRate(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function normalizeAmount(value: string) {
  return Number(String(value).replace(/[^\d]/g, "")) || 0;
}

export function toSettlementMonth(date: string) {
  return date.slice(0, 7);
}
