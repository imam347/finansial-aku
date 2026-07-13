import type { DashboardPeriod, TransactionDatePreset } from "./types";

export function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()));
}

export function getDashboardRange(period: DashboardPeriod, now = new Date(), customFrom?: string, customTo?: string) {
  if (period === "custom" && isIsoDate(customFrom) && isIsoDate(customTo) && customFrom! <= customTo!) {
    return { from: customFrom!, to: customTo! };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  if (period === "week") {
    const mondayOffset = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - mondayOffset);
    to.setDate(from.getDate() + 6);
  } else {
    from.setDate(1);
    to.setMonth(to.getMonth() + 1, 0);
  }
  return { from: toLocalIsoDate(from), to: toLocalIsoDate(to) };
}

export function getTransactionDateRange(preset: TransactionDatePreset, now = new Date(), customFrom?: string, customTo?: string) {
  if (preset === "all") return {};
  if (preset === "custom") return { from: customFrom, to: customTo };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    const value = toLocalIsoDate(today);
    return { from: value, to: value };
  }
  if (preset === "week") return getDashboardRange("week", today);
  if (preset === "month") return getDashboardRange("month", today);
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: toLocalIsoDate(from), to: toLocalIsoDate(today) };
}
