"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Link2, Send, ShieldCheck, Unlink, X } from "lucide-react";
import type { Account } from "@/lib/types";

interface PairingStatus {
  connected: boolean;
  botUsername: string | null;
  connection?: { telegram_username: string | null; default_account_id: string; connected_at: string } | null;
}

export function TelegramSettings({ accounts, production, onClose, onToast }: { accounts: Account[]; production: boolean; onClose: () => void; onToast: (message: string) => void }) {
  const [status, setStatus] = useState<PairingStatus>({ connected: false, botUsername: null });
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pairing, setPairing] = useState<{ code: string; deepLink: string | null }>();
  const [loading, setLoading] = useState(production);

  useEffect(() => {
    if (!production) return;
    const load = async () => {
      const response = await fetch("/api/telegram/pairing");
      if (response.ok) {
        const data = await response.json() as PairingStatus;
        setStatus(data);
        if (data.connection?.default_account_id) setAccountId(data.connection.default_account_id);
      }
      setLoading(false);
    };
    void load();
  }, [production]);

  useEffect(() => {
    if (!pairing || !production) return;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/telegram/pairing");
      if (!response.ok) return;
      const data = await response.json() as PairingStatus;
      if (data.connected) { setStatus(data); setPairing(undefined); onToast("Telegram berhasil terhubung"); }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [onToast, pairing, production]);

  const createPairing = async () => {
    setLoading(true);
    const response = await fetch("/api/telegram/pairing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultAccountId: accountId }) });
    const data = await response.json() as { code?: string; deepLink?: string | null; error?: string };
    setLoading(false);
    if (!response.ok || !data.code) return onToast(data.error ?? "Gagal membuat kode pairing");
    setPairing({ code: data.code, deepLink: data.deepLink ?? null });
  };

  const saveDefault = async () => {
    const response = await fetch("/api/telegram/pairing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultAccountId: accountId }) });
    onToast(response.ok ? "Akun default Telegram diperbarui" : "Gagal memperbarui akun default");
  };

  const disconnect = async () => {
    const response = await fetch("/api/telegram/pairing", { method: "DELETE" });
    if (response.ok) { setStatus({ ...status, connected: false, connection: null }); setPairing(undefined); onToast("Telegram diputuskan dari akun"); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="transaction-modal telegram-modal" role="dialog" aria-modal="true" aria-labelledby="telegram-title">
      <div className="modal-heading"><div><p>INTEGRASI BOT</p><h2 id="telegram-title">Catat lewat Telegram</h2></div><button className="icon-button" onClick={onClose}><X size={21} /></button></div>
      <div className="telegram-hero"><span><Send size={25} /></span><div><strong>Chat saja, transaksi langsung tercatat</strong><p>Template diproses lokal. Bahasa bebas dibantu GLM gratis.</p></div></div>
      {!production ? <div className="telegram-demo"><Bot size={28} /><h3>Hubungkan Supabase terlebih dahulu</h3><p>Pairing Telegram tersedia setelah aplikasi memakai akun production. Konfigurasi environment mengikuti README.</p></div> : loading ? <div className="telegram-demo"><Bot className="bot-pulse" size={28} /><p>Memuat status Telegram...</p></div> : status.connected ? <>
        <div className="connection-status"><span><Check size={17} /></span><div><strong>Telegram terhubung</strong><p>{status.connection?.telegram_username ? `@${status.connection.telegram_username}` : "Akun Telegram pribadi"}</p></div><small>AKTIF</small></div>
        <label className="full-field"><span>Akun default untuk transaksi Anda</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
        <div className="telegram-actions"><button className="secondary-button danger-button" onClick={() => void disconnect()}><Unlink size={16} /> Putuskan</button><button className="primary-button" onClick={() => void saveDefault()}><Check size={16} /> Simpan default</button></div>
      </> : <>
        <div className="pairing-steps"><div><span>1</span><p>Pilih akun yang paling sering Anda pakai.</p></div><div><span>2</span><p>Buat kode lalu buka bot Telegram.</p></div><div><span>3</span><p>Kirim kode melalui tombol yang tersedia.</p></div></div>
        <label className="full-field"><span>Akun default Anda</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
        {pairing ? <div className="pairing-code"><p>KODE PAIRING · BERLAKU 10 MENIT</p><strong>{pairing.code}</strong><div><button onClick={() => { void navigator.clipboard.writeText(pairing.code); onToast("Kode pairing disalin"); }}><Copy size={15} /> Salin</button>{pairing.deepLink && <a href={pairing.deepLink} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka bot</a>}</div></div> : <button className="primary-button pairing-button" disabled={!accountId} onClick={() => void createPairing()}><Link2 size={17} /> Buat kode pairing</button>}
      </>}
      <div className="telegram-security"><ShieldCheck size={17} /><p>Hanya chat pribadi dari akun Telegram yang sudah dipasangkan yang dapat menulis transaksi.</p></div>
    </section>
  </div>;
}
