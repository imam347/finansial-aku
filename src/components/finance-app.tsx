"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { createDemoState } from "@/lib/demo-data";
import { getDashboardRange, toLocalIsoDate } from "@/lib/date-ranges";
import { formatRupiah } from "@/lib/format";
import { enablePushNotifications } from "@/lib/push";
import { createClient as createSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Account, Budget, DashboardPeriod, DashboardSummary, FinanceState, HouseholdMember, Transaction, ViewId } from "@/lib/types";
import { AvatarModal } from "./avatar-modal";
import { DashboardView } from "./dashboard-view";
import { AccountsView, BudgetsView, TransactionsView } from "./detail-views";
import { TransactionModal } from "./transaction-modal";
import { AccountDetailsModal, AccountModal, BudgetModal } from "./setup-modals";
import { TelegramSettings } from "./telegram-settings";
import type { ImportTransactionRow } from "./transaction-sheet-tools";
import { UserAvatar } from "./user-avatar";

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
  avatarUrl?: string;
  role: "owner" | "member";
  members: HouseholdMember[];
}

export function FinanceApp() {
  const router = useRouter();
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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [demoAvatarUrl, setDemoAvatarUrl] = useState<string>();
  const [dark, setDark] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("month");
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>();
  const [transactionRefresh, setTransactionRefresh] = useState(0);
  const [accountFilterRequest, setAccountFilterRequest] = useState<{ accountId: string; token: number }>();
  const [toast, setToast] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [backend, setBackend] = useState<BackendContext | null>(null);
  const hydrated = useRef(false);
  const reloadRef = useRef<() => Promise<void>>(async () => undefined);
  const desktopProfileMenuRef = useRef<HTMLDivElement>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement>(null);

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
      setBalanceVisible(window.localStorage.getItem("finansial-balance-visible") !== "false");
      setInviteCode(window.localStorage.getItem("finansial-demo-invite") ?? "");
      setDemoAvatarUrl(window.localStorage.getItem("finansial-demo-avatar") ?? undefined);
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
        const today = toLocalIsoDate(new Date());
        const month = today.slice(0, 7) + "-01";
        const activityRange = getDashboardRange(dashboardPeriod);
        const [accountsResult, categoriesResult, budgetsResult, notificationsResult, membersResult, householdResult, invitationResult, overviewResult] = await Promise.all([
          supabase.from("accounts").select("*").eq("household_id", householdId).is("archived_at", null).order("created_at"),
          supabase.from("categories").select("*").eq("household_id", householdId).is("archived_at", null).order("created_at"),
          supabase.from("budgets").select("*").eq("household_id", householdId).eq("month", month),
          supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
          supabase.from("household_members").select("user_id,role").eq("household_id", householdId),
          supabase.from("households").select("name").eq("id", householdId).single(),
          supabase.from("invitations").select("code").eq("household_id", householdId).maybeSingle(),
          supabase.rpc("get_finance_overview", { p_household_id: householdId, p_as_of: today, p_activity_from: activityRange.from, p_activity_to: activityRange.to }),
        ]);
        const memberIds = (membersResult.data ?? []).map((member) => member.user_id as string);
        const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id,full_name,avatar_url").in("id", memberIds) : { data: [] };
        const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
        const avatarPaths = (profiles ?? []).map((profile) => profile.avatar_url as string | null).filter((path): path is string => Boolean(path));
        const signedAvatars = avatarPaths.length ? await supabase.storage.from("avatars").createSignedUrls(avatarPaths, 3600) : { data: [] };
        const avatarUrls = new Map((signedAvatars.data ?? []).map((item) => [item.path, item.signedUrl ?? undefined]));
        const userName = names.get(user.id) ?? user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Pengguna";
        const currentMembership = (membersResult.data ?? []).find((member) => member.user_id === user.id);
        const members = (membersResult.data ?? []).map((member) => {
          const profile = (profiles ?? []).find((item) => item.id === member.user_id);
          return { id: member.user_id as string, name: names.get(member.user_id as string) ?? "Anggota", avatarUrl: profile?.avatar_url ? (avatarUrls.get(profile.avatar_url as string) ?? undefined) : undefined };
        });
        const overview = (overviewResult.data ?? {}) as Record<string, unknown>;
        const accountSummaries = new Map(((overview.account_summaries ?? []) as Record<string, unknown>[]).map((item) => [String(item.id), item]));
        const budgetSpent = new Map(((overview.budget_spent ?? []) as Record<string, unknown>[]).map((item) => [String(item.category_id), Number(item.spent)]));
        const currentMember = members.find((member) => member.id === user.id);
        if (!active) return;
        setBackend({ householdId, householdName: householdResult.data?.name ?? "Household", userId: user.id, userName, avatarUrl: currentMember?.avatarUrl, role: currentMembership?.role === "owner" ? "owner" : "member", members });
        setInviteCode(invitationResult.data?.code ?? "");
        setDashboardSummary({
          totalBalance: Number(overview.total_balance ?? 0),
          monthlyIncome: Number(overview.monthly_income ?? 0),
          monthlyExpense: Number(overview.monthly_expense ?? 0),
          budgetTotal: Number(overview.budget_total ?? 0),
          categoryExpenses: ((overview.category_expenses ?? []) as Record<string, unknown>[]).map((item) => ({ categoryId: String(item.category_id), value: Number(item.value) })),
          activity: ((overview.activity ?? []) as Record<string, unknown>[]).map((item) => ({ date: String(item.date), expense: Number(item.expense) })),
        });
        setState({
          accounts: (accountsResult.data ?? []).map((item) => { const summary = accountSummaries.get(item.id); return { id: item.id, name: item.name, kind: item.kind, initialBalance: Number(item.initial_balance), color: item.color, lastFour: item.last_four ?? undefined, balance: Number(summary?.balance ?? item.initial_balance), transactionCount: Number(summary?.transaction_count ?? 0) }; }),
          categories: (categoriesResult.data ?? []).map((item) => ({ id: item.id, name: item.name, type: item.type, color: item.color, icon: item.icon })),
          transactions: ((overview.recent_transactions ?? []) as Record<string, unknown>[]).map((item) => { const member = members.find((entry) => entry.id === item.created_by); return { id: String(item.id), type: item.type as Transaction["type"], amount: Number(item.amount), accountId: String(item.account_id), destinationAccountId: item.destination_account_id ? String(item.destination_account_id) : undefined, categoryId: item.category_id ? String(item.category_id) : undefined, note: String(item.note ?? ""), date: String(item.transaction_date), createdBy: String(item.created_by_name ?? member?.name ?? "Anggota"), createdById: String(item.created_by), createdByAvatarUrl: member?.avatarUrl, createdAt: String(item.created_at) }; }),
          budgets: (budgetsResult.data ?? []).map((item) => ({ id: item.id, categoryId: item.category_id, amount: Number(item.amount), spent: budgetSpent.get(item.category_id) ?? 0 })),
          notifications: (notificationsResult.data ?? []).map((item) => { const actor = members.find((member) => member.id === item.actor_id); return { id: item.id, title: item.title, body: item.body, time: new Intl.RelativeTimeFormat("id", { numeric: "auto" }).format(-Math.max(0, Math.round((Date.now() - new Date(item.created_at).getTime()) / 86_400_000)), "day"), read: Boolean(item.read_at), transactionId: item.transaction_id ?? undefined, actorName: actor?.name ?? "Anggota", actorAvatarUrl: actor?.avatarUrl }; }),
        });
        setTransactionRefresh((value) => value + 1);
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
  }, [dashboardPeriod]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("finansial-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    window.localStorage.setItem("finansial-balance-visible", String(balanceVisible));
  }, [balanceVisible]);

  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileMenuOpen(false); };
    const closeMenuOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (desktopProfileMenuRef.current?.contains(event.target) || mobileProfileMenuRef.current?.contains(event.target)) return;
      setProfileMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("pointerdown", closeMenuOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("pointerdown", closeMenuOnOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unread = state.notifications.filter((notification) => !notification.read).length;
  const currentUserName = backend?.userName ?? "Pengguna";
  const memberList: HouseholdMember[] = backend?.members.length ? backend.members : [{ id: "demo", name: currentUserName, avatarUrl: demoAvatarUrl }];
  const now = new Date();
  const greeting = now.getHours() < 11 ? "Selamat pagi" : now.getHours() < 15 ? "Selamat siang" : now.getHours() < 18 ? "Selamat sore" : "Selamat malam";
  const currentTitle = view === "dashboard"
    ? { eyebrow: new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(now), title: `${greeting}, ${currentUserName.split(" ")[0]}!` }
    : titles[view];
  const calculatedAccountBalance = useMemo(() => {
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
  const accountBalance = backend && dashboardSummary ? dashboardSummary.totalBalance : calculatedAccountBalance;

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
    if (backend) await reloadRef.current();
  };

  const deleteTransaction = async (id: string) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { setToast(`Gagal menghapus: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id) }));
    setToast("Transaksi dihapus");
    if (backend) await reloadRef.current();
  };

  const updateBudget = async (id: string, amount: number) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").update({ amount }).eq("id", id);
      if (error) { setToast(`Gagal mengubah anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: current.budgets.map((budget) => budget.id === id ? { ...budget, amount } : budget) }));
    setToast("Anggaran diperbarui");
    if (backend) await reloadRef.current();
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
    if (backend) await reloadRef.current();
  };

  const addBudget = async (budget: Budget) => {
    if (!budget.amount) { setToast("Masukkan batas anggaran"); return; }
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").insert({ id: budget.id, household_id: backend.householdId, category_id: budget.categoryId, month: new Date().toISOString().slice(0, 7) + "-01", amount: budget.amount });
      if (error) { setToast(`Gagal menambah anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: [...current.budgets, budget] }));
    setBudgetModalOpen(false); setToast("Anggaran berhasil ditambahkan");
    if (backend) await reloadRef.current();
  };

  const deleteBudget = async (id: string) => {
    if (backend) {
      const { error } = await createSupabaseClient().from("budgets").delete().eq("id", id).eq("household_id", backend.householdId);
      if (error) { setToast(`Gagal menghapus anggaran: ${error.message}`); return; }
    }
    setState((current) => ({ ...current, budgets: current.budgets.filter((budget) => budget.id !== id) }));
    setToast("Anggaran dihapus");
    if (backend) await reloadRef.current();
  };

  const openEdit = (transaction: Transaction) => {
    setEditing(transaction);
    setModalOpen(true);
  };

  const navigate = (next: ViewId) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showAccountTransactions = (account: Account) => {
    setAccountDetails(undefined);
    setAccountFilterRequest((current) => ({ accountId: account.id, token: (current?.token ?? 0) + 1 }));
    navigate("transactions");
    setToast(`Menampilkan transaksi ${account.name}`);
  };

  const handleInvitation = async () => {
    if (!backend) {
      const demoCode = inviteCode || `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      setInviteCode(demoCode);
      window.localStorage.setItem("finansial-demo-invite", demoCode);
      await navigator.clipboard?.writeText(demoCode);
      setToast("Kode undangan disalin");
      return;
    }
    if (inviteCode) {
      await navigator.clipboard?.writeText(inviteCode);
      setToast("Kode undangan disalin");
      return;
    }
    const { data, error } = await createSupabaseClient().rpc("create_invitation", { target_household: backend.householdId });
    if (error) { setToast(`Gagal membuat kode: ${error.message}`); return; }
    const code = String(data);
    setInviteCode(code);
    await navigator.clipboard?.writeText(code);
    setToast("Kode undangan dibuat dan disalin");
  };

  const resetInvitation = async () => {
    if (!window.confirm("Ganti kode undangan? Kode lama tidak akan dapat dipakai lagi.")) return;
    if (!backend) {
      const code = `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      setInviteCode(code); window.localStorage.setItem("finansial-demo-invite", code); setToast("Kode undangan diganti"); return;
    }
    const { data, error } = await createSupabaseClient().rpc("reset_invitation", { target_household: backend.householdId });
    if (error) { setToast(`Gagal mengganti kode: ${error.message}`); return; }
    setInviteCode(String(data));
    setToast("Kode undangan diganti");
  };

  const saveAvatar = async (avatar: Blob) => {
    if (!backend) {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Gagal membaca avatar")); reader.readAsDataURL(avatar); });
      window.localStorage.setItem("finansial-demo-avatar", dataUrl);
      setDemoAvatarUrl(dataUrl);
      setToast("Avatar diperbarui");
      return;
    }
    const supabase = createSupabaseClient();
    const path = `${backend.userId}/avatar.webp`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { error: profileError } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", backend.userId);
    if (profileError) throw profileError;
    await reloadRef.current();
    setToast("Avatar diperbarui");
  };

  const logout = async () => {
    setProfileMenuOpen(false);
    document.cookie = "finansial_demo=; path=/; max-age=0; SameSite=Lax";
    if (backend && hasSupabaseConfig) {
      const { error } = await createSupabaseClient().auth.signOut({ scope: "local" });
      if (error) { setToast(`Gagal logout: ${error.message}`); return; }
    }
    router.replace("/login");
    router.refresh();
  };

  const importTransactions = async (rows: ImportTransactionRow[]) => {
    if (backend) {
      const { data, error } = await createSupabaseClient().rpc("import_transactions", { p_household_id: backend.householdId, p_rows: rows });
      if (error) throw error;
      const result = data as { inserted?: number; duplicates?: number; errors?: { row: number; message: string }[] };
      return { inserted: Number(result.inserted ?? 0), duplicates: Number(result.duplicates ?? 0), errors: result.errors ?? [] };
    }
    const created = rows.map<Transaction>((row) => ({ id: crypto.randomUUID(), type: row.type, amount: row.amount, accountId: row.accountId, destinationAccountId: row.destinationAccountId, categoryId: row.categoryId, note: row.note, date: row.date, createdBy: currentUserName, createdById: "demo", createdByAvatarUrl: demoAvatarUrl, createdAt: new Date().toISOString() }));
    setState((current) => ({ ...current, transactions: [...created, ...current.transactions] }));
    const previous = JSON.parse(window.localStorage.getItem("finansial-import-references") ?? "[]") as string[];
    window.localStorage.setItem("finansial-import-references", JSON.stringify([...new Set([...previous, ...rows.map((row) => row.sourceReference)])]));
    setTransactionRefresh((value) => value + 1);
    return { inserted: created.length, duplicates: 0, errors: [] };
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
          <div className="avatar-stack">{memberList.slice(0, 2).map((member) => <UserAvatar key={member.id} name={member.name} src={member.avatarUrl} />)}</div>
          <strong>{backend?.householdName ?? "Household demo"}</strong>
          <p>{memberList.length} anggota aktif</p>
          {(!backend || backend.role === "owner") && memberList.length < 2 && <div className="invite-actions"><button onClick={() => void handleInvitation()}>{inviteCode ? `Salin ${inviteCode}` : "Buat kode undangan"} <ChevronRight size={14} /></button>{inviteCode && <button className="reset-invite" aria-label="Ganti kode undangan" onClick={() => void resetInvitation()}><RotateCcw size={13} /></button>}</div>}
        </div>

        <div className="profile-row" ref={desktopProfileMenuRef}>
          <button className="profile-avatar-button" aria-label="Buka menu akun" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((value) => !value)}><UserAvatar name={currentUserName} src={backend?.avatarUrl ?? demoAvatarUrl} /></button>
          <div><strong>{currentUserName}</strong><small>{backend?.role === "owner" ? "Pemilik household" : "Anggota household"}</small></div>
          <button aria-label="Ganti tema" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          {profileMenuOpen && <div className="profile-menu"><button type="button" onClick={() => { setProfileMenuOpen(false); setAvatarOpen(true); }}><Camera size={16} /> Ganti avatar</button><button type="button" className="danger" onClick={() => void logout()}><LogOut size={16} /> Logout</button></div>}
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
            <div className="mobile-account-menu" ref={mobileProfileMenuRef}>
              <button type="button" className="mobile-account-trigger" aria-label="Buka menu akun" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((value) => !value)}>
                <UserAvatar name={currentUserName} src={backend?.avatarUrl ?? demoAvatarUrl} />
              </button>
              {profileMenuOpen && <div className="profile-menu mobile-profile-menu"><button type="button" onClick={() => { setProfileMenuOpen(false); setAvatarOpen(true); }}><Camera size={16} /> Ganti avatar</button><button type="button" className="danger" onClick={() => void logout()}><LogOut size={16} /> Logout</button></div>}
            </div>
            <button className="icon-button notification-button" aria-label={`${unread} notifikasi belum dibaca`} onClick={() => setNotificationsOpen(true)}>
              <Bell size={20} />{unread > 0 && <i>{unread}</i>}
            </button>
            <button className="primary-button desktop-add" onClick={() => { setEditing(undefined); setModalOpen(true); }}><Plus size={19} /> Catat transaksi</button>
          </div>
        </header>

        {view === "dashboard" && <DashboardView state={state} totalBalance={accountBalance} summary={dashboardSummary} balanceVisible={balanceVisible} onToggleBalance={() => setBalanceVisible((value) => !value)} period={dashboardPeriod} onPeriodChange={setDashboardPeriod} onAdd={() => setModalOpen(true)} onNavigate={navigate} />}
        {view === "transactions" && <TransactionsView state={state} householdId={backend?.householdId} members={memberList} refreshToken={transactionRefresh} accountFilterRequest={accountFilterRequest} onRefresh={() => reloadRef.current()} onToast={setToast} onImport={importTransactions} onAdd={() => setModalOpen(true)} onEdit={openEdit} onDelete={deleteTransaction} />}
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
      {accountDetails && <AccountDetailsModal {...accountDetails} onShowTransactions={() => showAccountTransactions(accountDetails.account)} onClose={() => setAccountDetails(undefined)} onEdit={() => { setEditingAccount(accountDetails.account); setAccountDetails(undefined); setAccountModalOpen(true); }} />}
      {budgetModalOpen && <BudgetModal state={state} onSave={addBudget} onClose={() => setBudgetModalOpen(false)} />}
      {telegramOpen && <TelegramSettings accounts={state.accounts} production={Boolean(backend)} onClose={() => setTelegramOpen(false)} onToast={setToast} />}
      {avatarOpen && <AvatarModal onClose={() => setAvatarOpen(false)} onSave={saveAvatar} />}

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
                  <UserAvatar name={item.actorName ?? "Anggota"} src={item.actorAvatarUrl} className="notification-avatar" />
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
      <span className="sr-only">{balanceVisible ? `Total saldo ${formatRupiah(accountBalance)}` : "Total saldo disembunyikan"}</span>
    </div>
  );
}
