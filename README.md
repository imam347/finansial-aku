# Finansial Aku

PWA untuk mencatat dan memahami keuangan rumah tangga bersama pasangan. UI memakai Bahasa Indonesia, IDR, dan zona waktu perangkat (default penggunaan Asia/Jakarta).

## Yang sudah tersedia

- Dashboard saldo, arus kas, grafik tren, kategori, dan transaksi terbaru.
- Pemasukan, pengeluaran, transfer antarakun, pencarian, filter, edit, dan soft delete.
- Akun bank/e-wallet/tunai dan anggaran per kategori.
- Dua akun pengguna dalam satu household lewat kode undangan sekali pakai.
- Inbox realtime dan Web Push untuk transaksi baru dari pasangan.
- Bot Telegram pribadi dengan parser template, klasifikasi GLM gratis, konfirmasi transaksi, dan `/undo`.
- Supabase Auth, PostgreSQL, Row Level Security, trigger notifikasi, dan isolasi data household.
- Installable PWA, responsive mobile/desktop, mode gelap, dan cache app shell.
- Mode demo persisten di `localStorage` apabila Supabase belum dikonfigurasi.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Tanpa environment variables, halaman utama langsung menjalankan mode demo. Data demo dapat ditambah, diedit, dan dihapus serta tetap tersimpan setelah refresh.

## Konfigurasi production

1. Buat project Supabase, lalu jalankan seluruh SQL dalam `supabase/migrations/` secara berurutan melalui SQL Editor atau Supabase CLI.
2. Salin `.env.example` menjadi `.env.local` dan isi URL, anon key, serta service-role key Supabase.
3. Buat VAPID keys:

   ```bash
   npx web-push generate-vapid-keys
   ```

4. Isi VAPID keys dan `PUSH_WEBHOOK_SECRET` di `.env.local`.
5. Di Supabase, aktifkan Realtime untuk tabel `transactions` dan `notifications`.
6. Buat Database Webhook pada event `INSERT` tabel `notifications` menuju `https://DOMAIN/api/push/send`. Tambahkan header `Authorization: Bearer PUSH_WEBHOOK_SECRET`.
7. Deploy ke Vercel dan salin seluruh environment variables ke konfigurasi project.

Alur production dimulai dari `/login`. Pengguna pertama membuat household di `/onboarding`; pasangan mendaftar sendiri lalu memasukkan kode undangan yang dibuat pemilik.

## Bot Telegram gratis

Bot memakai parser lokal terlebih dahulu. Pesan bahasa natural baru dikirim ke `GLM-4.7-Flash`, yang tercantum gratis pada [pricing resmi Z.AI](https://docs.z.ai/guides/overview/pricing). Jika model tidak tersedia, bot meminta template dan tidak berpindah otomatis ke model berbayar.

1. Buat bot melalui [@BotFather](https://t.me/BotFather), lalu ambil token dan username bot.
2. Buat API key di Z.AI dan isi konfigurasi Telegram/Z.AI pada `.env.local` berdasarkan `.env.example`.
3. Buat `TELEGRAM_WEBHOOK_SECRET` acak berisi huruf, angka, `_`, atau `-`.
4. Pastikan `NEXT_PUBLIC_APP_URL` menggunakan domain HTTPS production tanpa trailing slash.
5. Setelah deploy, daftarkan webhook dan command bot:

   ```bash
   npm run telegram:setup
   ```

6. Dari aplikasi, buka ikon Telegram/Pengaturan, pilih akun default masing-masing, buat kode pairing, lalu tekan “Buka bot”. Anda dan pasangan melakukan pairing secara terpisah.

Format tanpa AI:

```text
keluar 50rb makan dari BCA kopi
masuk 10jt gaji ke BCA
transfer 500rb dari BCA ke Jago
```

Pesan natural seperti `tadi ngopi 25 ribu pake gopay` diklasifikasi GLM. Hasil dengan confidence di bawah `0.85` menunggu tombol konfirmasi. Batas default adalah 50 panggilan AI per pengguna per hari dan dapat diubah melalui `TELEGRAM_AI_DAILY_LIMIT`.

## Perintah pemeriksaan

```bash
npm run lint
npm test
npm run build
```

Push notification membutuhkan HTTPS (kecuali `localhost`) dan izin pengguna. Apabila push ditolak atau tidak didukung, notifikasi tetap tersimpan di inbox aplikasi.
