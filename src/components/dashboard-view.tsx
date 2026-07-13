"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatDate, formatRupiah } from "@/lib/format";
import { getDashboardRange } from "@/lib/date-ranges";
import { getBudgetUsage } from "@/lib/budget-usage";
import { getDashboardActivity, getDashboardCategoryExpenses } from "@/lib/dashboard-aggregation";
import type { DashboardActivityFilter, DashboardPeriod, DashboardSummary, FinanceState, ViewId } from "@/lib/types";
import { CategoryIcon } from "./category-icon";
import { UserAvatar } from "./user-avatar";

interface DashboardViewProps {
  state: FinanceState;
  totalBalance: number;
  summary?: DashboardSummary;
  balanceVisible: boolean;
  onToggleBalance: () => void;
  activityFilter: DashboardActivityFilter;
  onActivityFilterChange: (filter: DashboardActivityFilter) => void;
  onAdd: () => void;
  onNavigate: (view: ViewId) => void;
}

export function DashboardView({ state, totalBalance, summary, balanceVisible, onToggleBalance, activityFilter, onActivityFilterChange, onAdd, onNavigate }: DashboardViewProps) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthly = state.transactions.filter((item) => item.date.startsWith(currentMonth));
  const income = summary?.monthlyIncome ?? monthly.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = summary?.monthlyExpense ?? monthly.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);

  const categoryData = getDashboardCategoryExpenses(state, currentMonth, summary?.categoryExpenses, expense);
  const fallbackRange = getDashboardRange(activityFilter.period, new Date(), activityFilter.dateFrom, activityFilter.dateTo);
  const fallbackActivity = getDashboardActivity(state, fallbackRange);
  const activityData = (summary?.activity ?? fallbackActivity).map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(`${item.date}T00:00:00`)),
  }));
  const activityTitle = activityFilter.period === "week" ? "Tren minggu berjalan" : activityFilter.period === "month" ? "Tren bulan berjalan" : "Tren rentang pilihan";
  const customDateInvalid = activityFilter.period === "custom" && Boolean(activityFilter.dateFrom && activityFilter.dateTo && activityFilter.dateFrom > activityFilter.dateTo);
  const categoryTotal = Math.max(0, expense);
  const updateActivityPeriod = (period: DashboardPeriod) => {
    if (period === "custom") {
      const monthRange = getDashboardRange("month");
      onActivityFilterChange({ period, dateFrom: activityFilter.dateFrom ?? monthRange.from, dateTo: activityFilter.dateTo ?? monthRange.to });
      return;
    }
    onActivityFilterChange({ period });
  };

  const budgetUsage = getBudgetUsage(state, currentMonth);
  const budgetTotal = budgetUsage.total;
  const budgetPercent = budgetUsage.percent;

  return (
    <div className="page dashboard-page">
      <section className="hero-balance">
        <div className="hero-decoration one" /><div className="hero-decoration two" />
        <div className="hero-copy">
          <p><span className="status-dot" /> Total saldo keluarga <button className="balance-toggle" type="button" onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan total saldo" : "Tampilkan total saldo"}>{balanceVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button></p>
          <h2 aria-live="polite">{balanceVisible ? formatRupiah(totalBalance) : "Rp ••••••••"}</h2>
          <div className="hero-trend"><TrendingUp size={15} /><strong>8,4%</strong><span>dari bulan lalu</span></div>
        </div>
        <div className="hero-actions">
          <button onClick={onAdd}><span><Plus size={21} /></span><small>Catat baru</small></button>
          <button onClick={() => onNavigate("accounts")}><span><Wallet size={20} /></span><small>Lihat akun</small></button>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card income">
          <div className="metric-icon"><ArrowDownLeft size={21} /></div>
          <div><p>Pemasukan bulan ini</p><h3>{formatRupiah(income)}</h3><small><TrendingUp size={13} /> 12,5% <span>vs bulan lalu</span></small></div>
          <button aria-label="Rincian pemasukan"><MoreHorizontal size={20} /></button>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon"><ArrowUpRight size={21} /></div>
          <div><p>Pengeluaran bulan ini</p><h3>{formatRupiah(expense)}</h3><small><TrendingDown size={13} /> 4,2% <span>lebih hemat</span></small></div>
          <button aria-label="Rincian pengeluaran"><MoreHorizontal size={20} /></button>
        </article>
        <article className="metric-card budget-metric">
          <div className="metric-top"><p>Anggaran terpakai</p><strong>{budgetPercent}%</strong></div>
          <h3>{formatRupiah(budgetUsage.spent)} <span>/ {formatRupiah(budgetTotal, true)}</span></h3>
          <div className="progress"><i style={{ width: `${budgetPercent}%` }} /></div>
          <small>Masih aman untuk bulan ini</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading activity-heading"><div><p>AKTIVITAS PENGELUARAN</p><h3>{activityTitle}</h3></div><div className="activity-filter-controls"><select aria-label="Periode aktivitas pengeluaran" value={activityFilter.period} onChange={(event) => updateActivityPeriod(event.target.value as DashboardPeriod)}><option value="week">Minggu Ini</option><option value="month">Bulan Ini</option><option value="custom">Bebas tanggal</option></select></div></div>
          {activityFilter.period === "custom" && <div className={`activity-custom-panel ${customDateInvalid ? "invalid" : ""}`}><div><strong>Rentang tanggal</strong><small>Data otomatis mengikuti tanggal yang dipilih.</small></div><div className="activity-date-range"><label><span>Dari</span><input type="date" value={activityFilter.dateFrom ?? fallbackRange.from} onChange={(event) => onActivityFilterChange({ ...activityFilter, dateFrom: event.target.value })} /></label><label><span>Sampai</span><input type="date" value={activityFilter.dateTo ?? fallbackRange.to} onChange={(event) => onActivityFilterChange({ ...activityFilter, dateTo: event.target.value })} /></label></div><button type="button" className="secondary-button" onClick={() => onActivityFilterChange({ period: "month" })}>Reset</button>{customDateInvalid && <p>Tanggal awal tidak boleh melewati tanggal akhir. Sementara grafik memakai bulan berjalan.</p>}</div>}
          <div className="activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData} margin={{ top: 15, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#197253" stopOpacity={0.28} /><stop offset="100%" stopColor="#197253" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval={activityFilter.period === "week" ? 0 : 4} dy={8} />
                <Tooltip formatter={(value) => formatRupiah(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} />
                <Area type="monotone" dataKey="expense" stroke="#197253" strokeWidth={3} fill="url(#expenseGradient)" dot={{ r: 3, fill: "#197253", strokeWidth: 3, stroke: "var(--surface)" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel category-panel">
          <div className="panel-heading"><div><p>PENGELUARAN</p><h3>Berdasarkan kategori</h3></div><button onClick={() => onNavigate("transactions")} className="text-link">Detail <ArrowRight size={15} /></button></div>
          <div className="category-content">
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={categoryData} dataKey="value" innerRadius={55} outerRadius={76} paddingAngle={3} stroke="none">{categoryData.map((entry) => <Cell key={entry.id} fill={entry.color} />)}</Pie></PieChart>
              </ResponsiveContainer>
              <div><small>Total</small><strong>{formatRupiah(categoryTotal, true)}</strong></div>
            </div>
            <div className="category-legend">
              {categoryData.slice(0, 4).map((category) => (
                <div key={category.id}><i style={{ background: category.color }} /><span>{category.name}</span><strong>{Math.round((category.value / Math.max(categoryTotal, 1)) * 100)}%</strong></div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-heading"><div><p>CATATAN TERKINI</p><h3>Transaksi terbaru</h3></div><button onClick={() => onNavigate("transactions")} className="text-link">Lihat semua <ArrowRight size={15} /></button></div>
        <div className="transaction-list compact-list">
          {state.transactions.slice(0, 5).map((item) => {
            const category = state.categories.find((entry) => entry.id === item.categoryId);
            const account = state.accounts.find((entry) => entry.id === item.accountId);
            return (
              <div className="transaction-row" key={item.id}>
                <span className="category-symbol" style={{ color: category?.color, background: `${category?.color}18` }}><CategoryIcon name={category?.icon} /></span>
                <div className="transaction-main"><strong>{item.note}</strong><small>{category?.name ?? "Transfer"} · {account?.name}</small></div>
                <div className="transaction-person"><UserAvatar name={item.createdBy} src={item.createdByAvatarUrl} className="mini-avatar" /><small>{item.createdBy}</small></div>
                <div className="transaction-value"><strong className={item.type}>{item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}{formatRupiah(item.amount)}</strong><small>{formatDate(item.date)}</small></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
