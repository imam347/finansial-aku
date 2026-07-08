"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleDollarSign, Home, Link2, Users } from "lucide-react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<"create" | "join">("create");
  const [householdName, setHouseholdName] = useState("Keluarga Kami");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(hasSupabaseConfig);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data } = await supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1);
      if (data?.length) router.replace("/"); else setLoading(false);
    };
    check();
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!hasSupabaseConfig) return setError("Supabase belum dikonfigurasi.");
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    const result = choice === "create"
      ? await supabase.from("households").insert({ name: householdName.trim(), created_by: user.id })
      : await supabase.rpc("accept_invitation", { invite_code: code.trim().toUpperCase() });
    if (result.error) { setError(result.error.message); setLoading(false); }
    else { router.push("/"); router.refresh(); }
  };

  if (loading) return <main className="loading-page"><CircleDollarSign size={32} /><p>Menyiapkan household...</p></main>;
  return (
    <main className="onboarding-page">
      <div className="auth-brand"><span><CircleDollarSign size={24} /></span> finansial<em>aku</em></div>
      <form className="onboarding-card" onSubmit={submit}>
        <div className="onboarding-icon"><Users size={27} /></div><p className="eyebrow">SATU LANGKAH LAGI</p><h1>Kelola uang dengan siapa?</h1><p>Pilih cara memulai household keuangan Anda.</p>
        <div className="choice-grid">
          <button type="button" className={choice === "create" ? "active" : ""} onClick={() => setChoice("create")}><span><Home size={21} /></span><strong>Buat household</strong><small>Saya akan mengundang pasangan</small></button>
          <button type="button" className={choice === "join" ? "active" : ""} onClick={() => setChoice("join")}><span><Link2 size={21} /></span><strong>Masukkan kode</strong><small>Pasangan sudah membuatnya</small></button>
        </div>
        {choice === "create" ? <label><span>Nama household</span><input required minLength={2} value={householdName} onChange={(event) => setHouseholdName(event.target.value)} /></label> : <label><span>Kode undangan</span><input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="KITA-2841" maxLength={9} /></label>}
        {error && <p className="auth-message">{error}</p>}
        <button className="primary-button auth-submit">Lanjutkan <ArrowRight size={17} /></button>
      </form>
    </main>
  );
}
