# SIKADES — Panduan Instalasi (Backend GAS + Frontend GitHub Pages)

Arsitektur: **Google Apps Script** = API (menyimpan data di Google Sheets) · **GitHub Pages** = tampilan aplikasi.
Kerjakan **BACKEND dulu**, baru frontend.

---

## BAGIAN A — BACKEND (Google Apps Script)

1. Buka https://script.google.com → **Proyek baru**.
2. Hapus isi `Code.gs`, ganti nama file menjadi `Kode`, lalu **tempel seluruh isi `Kode.gs`**. Simpan (Ctrl+S).
3. **Jalankan setup — SEKALI SAJA:** pilih fungsi `setupAppEnvironment` di dropdown → **▶ Jalankan** → izinkan akses (Drive & Sheets). Cek *Execution log* sampai muncul ✅. Di Google Drive akan terbentuk folder `SIKADES_Kas_Desa` berisi spreadsheet `DB_SIKADES`.
   - Opsional: jalankan `isiDataContoh` untuk data percobaan (hapus nanti dengan `hapusDataContoh`).
4. **Deploy:** *Deploy → Deployment baru → Jenis: Aplikasi web*
   - Jalankan sebagai: **Saya (Me)**
   - Yang memiliki akses: **Siapa saja (Anyone)**
   - Klik **Deploy** → **salin URL yang berakhiran `/exec`**.
5. Tes cepat: buka URL `/exec` di browser. Harus tampil teks JSON seperti `{"success":true,...,"message":"API SIKADES aktif."}`.

> **Memperbarui kode backend nanti:** *Deploy → Kelola deployment → ✏️ (edit) → Versi: Versi baru → Deploy*. **Jangan** membuat "Deployment baru" karena URL berubah dan aplikasi berhenti bekerja.

> Sudah memakai versi lama (google.script.run)? Cukup tempel `Kode.gs` baru di proyek yang sama, lalu deploy versi baru. Data tetap aman. Semua pengguna perlu login ulang satu kali.

---

## BAGIAN B — FRONTEND (GitHub Pages)

Folder kerja Anda adalah **hasil ekstrak `sikades-frontend.zip`**, yaitu folder yang **langsung berisi `index.html`, `css`, `js`**. Folder inilah tempat `git init` dijalankan — bukan folder di atasnya.

### B1. Isi alamat backend (sebelum upload)
Buka `js/config.js` dengan Notepad, ganti alamat berikut dengan URL `/exec` dari langkah A4:
```js
GAS_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
```
Simpan.

### B2. Install Git (sekali)
Windows: https://git-scm.com/download/win (pengaturan default). Lalu buka PowerShell dan cek: `git --version`.
```
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### B3. Buat repository di GitHub
github.com → **+ → New repository** → nama mis. `sikades` → **Public** → **jangan** centang README/.gitignore/license → Create.

### B4. Masuk ke folder yang benar & cek isinya
Di File Explorer, buka folder hasil ekstrak (yang ada `index.html`), klik address bar, ketik `powershell`, Enter. Lalu:
```
dir
```
**Wajib terlihat:** `index.html`, folder `css`, folder `js`. Jika yang terlihat malah folder lain (mis. `frontend`), masuklah dulu ke folder itu (`cd namafolder`). **Jangan lanjut sebelum `index.html` terlihat.**

### B5. Upload (jalankan satu per satu)
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
Saat diminta password, tempel **Personal Access Token** (bukan password GitHub). Layar tampak kosong saat mengetik/menempel — itu normal, tekan Enter.
Membuat token: https://github.com/settings/tokens → *Generate new token (classic)* → centang **repo** → salin token (`ghp_…`, hanya tampil sekali).
Alternatif tanpa terminal: **GitHub Desktop** (Add Local Repository → Publish).

> Jangan upload lewat tombol "Upload files" di web GitHub — struktur folder `css/` dan `js/` bisa rusak.

### B6. Aktifkan Pages
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch **main** / **(root)** → Save. Tunggu 1–2 menit; alamat situs: `https://USERNAME.github.io/NAMA-REPO/`. Centang **Enforce HTTPS**.

### B7. Update nanti
```
git add .
git commit -m "Perubahan"
git push
```
Jika tampilan lama masih muncul: **Ctrl+Shift+R**.

---

## BAGIAN C — Pemakaian pertama
1. Masuk dengan akun bawaan: `admin / admin123`, `bendahara / bendahara123`, `sekdes / sekdes123`, `kades / kades123`.
2. **Segera ganti password** semua akun (Menu → Ganti password; Superuser bisa mereset di menu Pengguna).
3. Superuser: isi **saldo awal** Kas Bank & Kas Tunai (Master Data → Rekening) dan data desa (Pengaturan).
4. **Tarik tunai di bank:** satu penarikan (mis. ADD) bisa disalurkan ke **beberapa kegiatan** (tiap baris: kegiatan, pelaksana, jumlah, kategori) dan ada potongan pajak. Uang yang belum diserahkan **tidak perlu diisi** — otomatis tetap di Kas Tunai bendahara.
5. Alur bulanan: Bendahara catat → Sekdes verifikasi → Bendahara ajukan tutup bulan → Sekdes periksa → Kades setujui.

## Catatan keamanan & perilaku
- Token login berlaku **24 jam**, ditandatangani di server. Keluar (logout) mencabut token pengguna itu di semua perangkat.
- Data terakhir disimpan di peramban perangkat agar aplikasi terbuka instan; dihapus saat Keluar. Hindari login di perangkat umum.
- Data di server di-cache ±5 menit. Jika Anda mengedit langsung isi spreadsheet, tekan tombol muat ulang (⟳) setelah beberapa menit, atau lakukan satu transaksi/perubahan lewat aplikasi.
- Jangan membagikan spreadsheet `DB_SIKADES` kepada orang lain.

## Masalah umum
| Gejala | Penyebab / solusi |
|---|---|
| "Alamat server (GAS_URL) belum diisi" | `js/config.js` belum diubah / belum di-push |
| "Server membalas format tak dikenal" | Deploy belum "Anyone", atau URL bukan `/exec`, atau lupa Deploy versi baru |
| Situs GitHub 404 | `index.html` tidak di root repo (git init di folder yang salah) → lihat langkah B4 |
| Tampil tanpa styling | Folder `css/`/`js/` tidak ikut ter-upload |
| Lama saat pertama dibuka | Normal (server GAS "bangun" 1–4 detik); berikutnya cepat |
| "Sesi berakhir" | Token 24 jam habis / akun diubah Superuser → login ulang |
