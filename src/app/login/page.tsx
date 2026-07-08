"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleDollarSign, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasSupabaseConfig) return setMessage("Supabase belum dikonfigurasi. Gunakan mode demo untuk melihat aplikasi.");
    setLoading(true); setMessage("");
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else { router.push("/onboarding"); router.refresh(); }
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) setMessage(error.message);
      else setMessage("Akun berhasil dibuat. Periksa email jika konfirmasi diaktifkan.");
    }
    setLoading(false);
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><span><CircleDollarSign size={24} /></span> finansial<em>aku</em></div>
        <div className="story-copy"><p>KEUANGAN BERDUA</p><h1>Lebih tenang karena semuanya <span>tercatat.</span></h1><p className="story-body">Satu tempat sederhana untuk Anda dan pasangan memahami uang, tanpa spreadsheet yang melelahkan.</p></div>
        <div className="story-stat"><div className="avatar-stack"><span>IM</span><span>AL</span></div><div><strong>Dibuat untuk dikelola berdua</strong><small>Sinkron, transparan, dan tetap terasa personal.</small></div></div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-icon"><ShieldCheck size={23} /></div>
          <p className="eyebrow">SELAMAT DATANG</p><h2>{mode === "login" ? "Masuk ke household Anda" : "Mulai keuangan bersama"}</h2><p className="auth-lead">{mode === "login" ? "Lanjutkan mencatat perjalanan finansial keluarga." : "Buat akun pribadi Anda terlebih dahulu."}</p>
          {mode === "signup" && <label><span>Nama lengkap</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" /></label>}
          <label><span>Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" /></label>
          <label><span>Kata sandi</span><div className="password-field"><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {message && <p className="auth-message">{message}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? "Memproses..." : mode === "login" ? "Masuk" : "Buat akun"}<ArrowRight size={17} /></button>
          <p className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Daftar sekarang" : "Masuk"}</button></p>
          {!hasSupabaseConfig && <><div className="demo-divider"><span>atau</span></div><Link className="demo-link" href="/">Lihat mode demo tanpa login <ArrowRight size={15} /></Link></>}
        </form>
      </section>
    </main>
  );
}
