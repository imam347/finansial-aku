"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { createDemoState } from "@/lib/demo-data";
import { formatRupiah, initials } from "@/lib/format";
import { enablePushNotifications } from "@/lib/push";
import { createClient as createSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Account, Budget, FinanceState, Transaction, ViewId } from "@/lib/types";
import { DashboardView } from "./dashboard-view";
import { AccountsView, BudgetsView, TransactionsView } from "./detail-views";
import { TransactionModal } from "./transaction-modal";
import { AccountDetailsModal, AccountModal, BudgetModal } from "./setup-modals";
import { TelegramSettings } from "./telegram-settings";

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { id: "transactions", label: "Transaksi", icon: ReceiptText },
  { id: "budgets", label: "Anggaran", icon: PiggyBank },
  { id: "accounts", label: "Akun", icon: WalletCards },
];

const titles: Record<Exclude<ViewId, "dashboard">, { eyebrow: string; title: string }> = {
  transactions: { eyebrow: "Catatan bersama", title: "Semua transaksi" },
  budgets: { eyebrow: "Rencana bulan ini", title: "Anggaran keluarga" },
  accounts: { eyebrow: "Sumber dana", title: "Akun & saldo" },
};

const STORAGE_KEY = "finansial-aku-demo-v1";

interface BackendContext {
  householdId: string;
  householdName: string;
  userId: string;
  userName: string;
  role: "owner" | "member";
  members: { id: string; name: string }[];
}

export function FinanceApp() {
  const [state, setState] = useState<FinanceState>(() => createDemoState());
  const [view, setView] = useState<ViewId>("dashboard");
  const [modalOpen, setModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [editingAccount, setEditingAccount] = useState<Account | undefined>();
  const [accountDetails, setAccountDetails] = useState<{ account: Account; balance: number; transactions: number }>();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [backend, setBackend] = useState<BackendContext | null>(null);
  const hydrated = useRef(false);
  const reloadRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const hydrate = () => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setState(JSON.parse(saved) as FinanceState);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      const savedTheme = window.localStorage.getItem("finansial-theme");
      setDark(savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches));
      hydrated.current = true;
    };
    const timer = window.setTimeout(hydrate, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated.current && !backend) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, backend]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const supabase = createSupabaseClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data: membership } = await supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (!membership) { window.location.assign("/onboarding"); return; }
      const householdId = membership.household_id as string;
      const loadFinanceData = async () => {
        const month = new Date().toISOString().slice(0, 7) + "-01";
        const [accountsResult, categoriesResult, transactionsResult, budgetsResult, notificationsResult, membersResult, householdResult] = await Promise.all([
          supabase.from("accounts").select("*").eq("household_id", householdId).is("archived_at", null).order("created_at"),
          supabase.from("categories").select("*").eq("household_id", householdId).is("archived_at", null).order("created_at"),
          supabase.from("transactions").select("*").eq("household_id", householdId).is("deleted_at", null).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
          supabase.from("budgets").select("*").eq("household_id", householdId).eq("month", month),
          supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
          supabase.from("household_members").select("user_id,role").eq("household_id", householdId),
          supabase.from("households").select("name").eq("id", householdId).single(),
        ]);
        const memberIds = (membersResult.data ?? []).map((member) => member.user_id as string);
        const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id,full_name").in("id", memberIds) : { data: [] };
        const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
        const userName = names.get(user.id) ?? user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Pengguna";
        const currentMembership = (membersResult.data ?? []).find((member) => member.user_id === user.id);
        const members = (membersResult.data ?? []).map((member) => ({ id: member.user_id as string, name: names.get(member.user_id as string) ?? "Anggota" }));
        if (!active) return;
        setBackend({ householdId, householdName: householdResult.data?.name ?? "Household", userId: user.id, userName, role: currentMembership?.role === "owner" ? "owner" : "member", members });
        setState({
          accounts: (accountsResult.data ?? []).map((item) => ({ id: item.id, name: item.name, kind: item.kind, initialBalance: Number(item.initial_balance), color: item.color, lastFour: item.last_four ?? undefined })),
          categories: (categoriesResult.data ?? []).map((item) => ({ id: item.id, name: item.name, type: item.type, color: item.color, icon: item.icon })),
          transactions: (transactionsResult.data ?? []).map((item) => ({ id: item.id, type: item.type, amount: Number(item.amount), accountId: item.account_id, destinationAccountId: item.destination_account_id ?? undefined, categoryId: item.category_id ?? undefined, note: item.note, date: item.transaction_date, createdBy: names.get(item.created_by) ?? "Pasangan", createdAt: item.created_at })),
          budgets: (budgetsResult.data ?? []).map((item) => ({ id: item.id, categoryId: item.category_id, amount: Number(item.amount) })),
          notifications: (notificationsResult.data ?? []).map((item) => ({ id: item.id, title: item.title, body: item.body, time: new Intl.RelativeTimeFormat("id", { numeric: "auto" }).format(-Math.max(0, Math.round((Date.now() - new Date(item.created_at).getTime()) / 86_400_000)), "day"), read: Boolean(item.read_at), transactionId: item.transaction_id ?? undefined, actorName: names.get(item.actor_id) ?? "Anggota" })),
        });
      };
      reloadRef.current = loadFinanceData;
      await loadFinanceData();
      channel = supabase.channel(`household:${householdId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `household_id=eq.${householdId}` }, () => void loadFinanceData())
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void loadFinanceData())
        .subscribe();
    };
    void initialize();
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("finansial-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unread = state.notifications.filter((notification) => !notification.read).length;
  const currentUserName = backend?.userName ?? "Pengguna";
  const memberList = backend?.members.length ? backend.members : [{ id: "demo", name: currentUserName }];
  const now = new Date();
  const greeting = now.getHours() < 11 ? "Selamat pagi" : now.getHours() < 15 ? "Selamat siang" : now.getHours() < 18 ? "Selamat sore" : "Selamat malam";
  const currentTitle = view === "dashboard"
    ? { eyebrow: new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(now), title: `${greeting}, ${currentUserName.split(" ")[0]}!` }
    : titles[view];
  const accountBalance = useMemo(() => {
    return state.accounts.reduce((total, account) => {
      const movement = state.transactions.reduce((sum, item) => {
        if (item.type === "income" && item.accountId === account.id) return sum + item.amount;
        if (item.type === "expense" && item.accountId === account.id) return sum - item.amount;
        if (item.type === "transfer" && item.accountId === account.id) return sum - item.amount;
        if (item.type === "transfer" && item.destinationAccountId === account.id) return sum + item.amount;
        return sum;
      }, 0);
      return total + account.initialBalance + movement;
    }, 0);
  }, [state.accounts, state.transactions]);

  const saveTransaction = async (transaction: Transaction) => {
    const savedTransaction = backend ? { ...transaction, createdBy: editing?.createdBy ?? backend.userName } : transaction;
    if (backend) {
      const supabase = createSupabaseClient();
      const payload = { id: transaction.id, household_id: backend.householdId, type: transaction.type, amount: transaction.amount, account_id: transaction.accountId, destination_account_id: transaction.destinationAccountId ?? null, category_id: transaction.categoryId ?? null, note: transaction.note, transaction_date: transaction.date, created_by: backend.userId };
      const { error } = editing
        ? await supabase.from("transactions").update(payload).eq("id", transaction.id)
        : await supabase.from("transactions").insert(payload);
      if (error) { setToast(`Gagal menyimpan: ${error.message}`); return; }
    }
    setState((current) => ({
      ...current,
      transactions: editing
        ? current.transactions.map((item) => (item.id === transaction.id ? savedTransaction : item))
        : [savedTransaction, ...current.transactions],
    }));
    setToast(editing ? "Perubahan transaksi disimpan" : "Transaksi berhasil dicatat");
    setEditing(undefined);
    setModalOpen(false);
  };

  const deleteTransaction = async (id: string) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { setToast(`Gagal menghapus: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id) }));
    setToast("Transaksi dihapus");
  };

  const updateBudget = async (id: string, amount: number) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").update({ amount }).eq("id", id);
      if (error) { setToast(`Gagal mengubah anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: current.budgets.map((budget) => budget.id === id ? { ...budget, amount } : budget) }));
    setToast("Anggaran diperbarui");
  };

  const saveAccount = async (account: Account) => {
    if (backend) {
      const payload = { name: account.name, kind: account.kind, initial_balance: account.initialBalance, color: account.color, last_four: account.lastFour ?? null };
      const { error } = editingAccount
        ? await createSupabaseClient().from("accounts").update(payload).eq("id", account.id).eq("household_id", backend.householdId)
        : await createSupabaseClient().from("accounts").insert({ id: account.id, household_id: backend.householdId, ...payload });
      if (error) { setToast(`Gagal menyimpan akun: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, accounts: editingAccount ? current.accounts.map((item) => item.id === account.id ? account : item) : [...current.accounts, account] }));
    setEditingAccount(undefined);
    setAccountModalOpen(false);
    setToast(editingAccount ? "Perubahan akun disimpan" : "Akun baru ditambahkan");
  };

  const addBudget = async (budget: Budget) => {
    if (!budget.amount) { setToast("Masukkan batas anggaran"); return; }
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").insert({ id: budget.id, household_id: backend.householdId, category_id: budget.categoryId, month: new Date().toISOString().slice(0, 7) + "-01", amount: budget.amount });
      if (error) { setToast(`Gagal menambah anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: [...current.budgets, budget] }));
    setBudgetModalOpen(false); setToast("Anggaran berhasil ditambahkan");
  };

  const deleteBudget = async (id: string) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").delete().eq("id", id).eq("household_id", backend.householdId);
      if (error) { setToast(`Gagal menghapus anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: current.budgets.filter((budget) => budget.id !== id) }));
    setToast("Anggaran dihapus");
  };

  const openEdit = (transaction: Transaction) => {
    setEditing(transaction);
    setModalOpen(true);
  };

  const navigate = (next: ViewId) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleInvitation = async () => {
    if (!backend) {
      const demoCode = inviteCode || `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      setInviteCode(demoCode);
      await navigator.clipboard?.writeText(demoCode);
      setToast("Kode undangan disalin");
      return;
    }
    const { data, error } = await createSupabaseClient().rpc("create_invitation", { target_household: backend.householdId });
    if (error) { setToast(`Gagal membuat kode: ${error.message}`); return; }
    const code = String(data);
    setInviteCode(code);
    await navigator.clipboard?.writeText(code);
    setToast("Kode baru dibuat dan disalin");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><CircleDollarSign size={23} /></span>
          <span>finansial<span>aku</span></span>
        </div>

        <nav className="side-nav" aria-label="Navigasi utama">
          <p className="nav-label">MENU UTAMA</p>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}>
              <Icon size={19} />
              <span>{label}</span>
              {id === "transactions" && <small>{state.transactions.length}</small>}
            </button>
          ))}
          <p className="nav-label second">LAINNYA</p>
          <button onClick={() => setNotificationsOpen(true)}>
            <Bell size={19} /><span>Notifikasi</span>{unread > 0 && <small className="coral">{unread}</small>}
          </button>
          <button onClick={() => setTelegramOpen(true)}><Settings size={19} /><span>Pengaturan</span></button>
        </nav>

        <div className="household-card">
          <div className="avatar-stack">{memberList.slice(0, 2).map((member) => <span key={member.id}>{initials(member.name)}</span>)}</div>
          <strong>{backend?.householdName ?? "Household demo"}</strong>
          <p>{memberList.length} anggota aktif</p>
          <button onClick={() => void handleInvitation()}>
            {inviteCode ? `Kode: ${inviteCode}` : "Buat kode undangan"} <ChevronRight size={14} />
          </button>
        </div>

        <div className="profile-row">
          <span className="avatar">{initials(currentUserName)}</span>
          <div><strong>{currentUserName}</strong><small>{backend?.role === "owner" ? "Pemilik household" : "Anggota household"}</small></div>
          <button aria-label="Ganti tema" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p>{currentTitle.eyebrow}</p>
            <h1>{currentTitle.title} <span aria-hidden="true">{view === "dashboard" ? "👋" : ""}</span></h1>
          </div>
          <div className="top-actions">
            <label className="search-box"><Search size={18} /><input aria-label="Cari transaksi" placeholder="Cari transaksi..." /></label>
            <button className="icon-button" aria-label="Pengaturan bot Telegram" onClick={() => setTelegramOpen(true)}><Send size={18} /></button>
            <button className="icon-button theme-mobile" aria-label="Ganti tema" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <button className="icon-button notification-button" aria-label={`${unread} notifikasi belum dibaca`} onClick={() => setNotificationsOpen(true)}>
              <Bell size={20} />{unread > 0 && <i>{unread}</i>}
            </button>
            <button className="primary-button desktop-add" onClick={() => { setEditing(undefined); setModalOpen(true); }}><Plus size={19} /> Catat transaksi</button>
          </div>
        </header>

        {view === "dashboard" && <DashboardView state={state} totalBalance={accountBalance} onAdd={() => setModalOpen(true)} onNavigate={navigate} />}
        {view === "transactions" && <TransactionsView state={state} onAdd={() => setModalOpen(true)} onEdit={openEdit} onDelete={deleteTransaction} />}
        {view === "budgets" && <BudgetsView state={state} setState={setState} onAdd={() => setBudgetModalOpen(true)} onBudgetUpdate={updateBudget} onBudgetDelete={deleteBudget} />}
        {view === "accounts" && <AccountsView state={state} onAdd={() => { setEditingAccount(undefined); setAccountModalOpen(true); }} onEdit={(account) => { setEditingAccount(account); setAccountModalOpen(true); }} onDetail={(account, balance, transactions) => setAccountDetails({ account, balance, transactions })} />}
      </main>

      <nav className="bottom-nav" aria-label="Navigasi mobile">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>
        ))}
      </nav>
      <button className="mobile-fab" aria-label="Catat transaksi" onClick={() => { setEditing(undefined); setModalOpen(true); }}><Plus size={27} /></button>

      {modalOpen && <TransactionModal state={state} editing={editing} currentUserName={currentUserName} onSave={saveTransaction} onClose={() => { setEditing(undefined); setModalOpen(false); }} />}
      {accountModalOpen && <AccountModal account={editingAccount} onSave={saveAccount} onClose={() => { setEditingAccount(undefined); setAccountModalOpen(false); }} />}
      {accountDetails && <AccountDetailsModal {...accountDetails} onClose={() => setAccountDetails(undefined)} onEdit={() => { setEditingAccount(accountDetails.account); setAccountDetails(undefined); setAccountModalOpen(true); }} />}
      {budgetModalOpen && <BudgetModal state={state} onSave={addBudget} onClose={() => setBudgetModalOpen(false)} />}
      {telegramOpen && <TelegramSettings accounts={state.accounts} production={Boolean(backend)} onClose={() => setTelegramOpen(false)} onToast={setToast} />}

      {notificationsOpen && (
        <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setNotificationsOpen(false)}>
          <aside className="notification-sheet">
            <div className="sheet-heading"><div><p>AKTIVITAS BERSAMA</p><h2>Notifikasi</h2></div><button className="icon-button" onClick={() => setNotificationsOpen(false)}><X size={21} /></button></div>
            <button className="push-card" onClick={async () => {
              const result = await enablePushNotifications();
              setToast(result.message);
            }}>
              <span><Bell size={19} /></span><div><strong>Aktifkan push notification</strong><p>Dapatkan kabar saat anggota household mencatat transaksi.</p></div><ChevronRight size={18} />
            </button>
            <div className="notification-list">
              {state.notifications.map((item) => (
                <button key={item.id} className={!item.read ? "unread" : ""} onClick={() => setState((current) => ({ ...current, notifications: current.notifications.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification) }))}>
                  <span className="notification-avatar">{initials(item.actorName ?? "Anggota")}</span>
                  <div><strong>{item.title}</strong><p>{item.body}</p><small>{item.time}</small></div>
                  {!item.read && <i />}
                </button>
              ))}
            </div>
            <button className="mark-read" onClick={() => setState((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) }))}>Tandai semua sudah dibaca</button>
          </aside>
        </div>
      )}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      <span className="sr-only">Total saldo {formatRupiah(accountBalance)}</span>
    </div>
  );
}
