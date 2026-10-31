/**
 * ============================================================
 * SIKADES — Frontend (JavaScript.html)
 * SPA murni: URL tidak pernah berubah, token sesi hanya di memori/localStorage.
 * Satu panggilan awal memuat semua data; setelah itu hanya "delta" dari server,
 * sehingga perpindahan menu terasa instan.
 * ============================================================
 */
(function () {
'use strict';
const A = {};
window.A = A;

// ════════════════════════════════════════════════════════
// BAGIAN 1: UTILITAS
// ════════════════════════════════════════════════════════
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => (n < 10 ? '0' : '') + n;
const fmtNum = n => { n = Math.round(Number(n) || 0); const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '-' : '') + s; };
const rp = n => 'Rp ' + fmtNum(n);
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtTgl = s => s ? (+s.slice(8, 10)) + ' ' + BLN[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4) : '';
const labelPer = p => BULAN[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4);
const shortPer = p => BLN[+p.slice(5, 7) - 1] + ' ' + p.slice(2, 4);
const prevPer = (p, n) => { let y = +p.slice(0, 4), m = +p.slice(5, 7) - (n || 1); while (m < 1) { m += 12; y--; } return y + '-' + pad(m); };
const diffHari = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } };
const icon = (n, c) => '<svg class="ic ' + (c || '') + '"><use href="#i-' + n + '"/></svg>';
const by = (arr, k) => { const m = {}; arr.forEach(x => { m[x[k || 'ID']] = x; }); return m; };

const S = {
  token: null, user: null, B: null, I: null, calc: null, page: 'dashboard', per: null, hist: [], loadedAt: 0,
  f: { per: null, jenis: '', rek: '', status: '', sis: '', q: '', limit: 60 },
  cache: {}, pj: { tab: 'belum', sel: {} }, lap: { type: 'BKU', per: null, data: null }, masterTab: 'kategori', ignorePop: 0
};
const JENIS = { TERIMA: 'Penerimaan', KELUAR: 'Pengeluaran', TARIK: 'Tarik Tunai', SETOR: 'Setor Tunai', BAYAR_PAJAK: 'Setor Pajak' };
const ROLE = { SUPERUSER: 'Superuser', BENDAHARA: 'Bendahara', SEKDES: 'Sekretaris Desa', KADES: 'Kepala Desa' };
const REK = { TUNAI: 'Kas Tunai', BANK: 'Kas Bank' };
const can = (...roles) => !!S.user && (S.user.role === 'SUPERUSER' || roles.indexOf(S.user.role) >= 0);
const isSU = () => !!S.user && S.user.role === 'SUPERUSER';
const hariIni = () => (S.B && S.B.hariIni) || (new Date().getFullYear() + '-' + pad(new Date().getMonth() + 1) + '-' + pad(new Date().getDate()));

// ── Tema (terang/gelap), disimpan di localStorage ──
function terapkanTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  lsSet('sk_theme', t);
  const b = $('#btnTheme use');
  if (b) b.setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon');
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'dark' ? '#0c1518' : '#0f766e');
}
function temaSekarang() { return document.documentElement.getAttribute('data-theme') || 'light'; }
A.toggleTema = () => terapkanTema(temaSekarang() === 'dark' ? 'light' : 'dark');
function temaAwal() {
  let t = lsGet('sk_theme');
  if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  terapkanTema(t);
}

// ── Toast ──
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.innerHTML = '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'err' ? 5200 : 3000);
}

// ── Pemanggilan server (Promise). Semua lewat satu pintu: api(token, aksi, payload) ──
// Transport fetch (timeout, retry, reqId idempoten) ada di js/api.js → window.SkApi
async function api(action, payload, opt) {
  const res = await SkApi.call(action, payload || {}, opt);
  if (res && res.code === 'AUTH') { paksaKeluar('Sesi berakhir, silakan masuk kembali.'); throw new Error(res.message); }
  if (!res || !res.success) { const e = new Error((res && res.message) || 'Terjadi kesalahan.'); e.network = !!(res && res.network); throw e; }
  if (!/^(bootstrap|getBukti|getLaporan|exportLaporan|daftarUser|getAudit)$/.test(action)) S.cache = {}; // data berubah → cache menu Superuser dibuang
  return res;
}
async function withBusy(btn, fn) {
  if (btn && btn.disabled) return;
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Memproses…'; }
  try { await fn(); } catch (e) { toast(e.message || 'Terjadi kesalahan', 'err'); } finally {
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = old; }
  }
}

// ── Modal (bottom-sheet di HP, dialog di desktop) + dukungan tombol Back Android ──
const Modal = {
  stack: [],
  open(o) {
    const ov = document.createElement('div');
    ov.className = 'ov';
    ov.style.zIndex = 100 + this.stack.length * 2;
    ov.innerHTML = '<div class="sheet ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">'
      + '<div class="sheet-h"><h3>' + esc(o.title) + '</h3><button class="iconbtn" data-x aria-label="Tutup">' + icon('x') + '</button></div>'
      + '<div class="sheet-b">' + o.body + '</div>' + (o.footer ? '<div class="sheet-f">' + o.footer + '</div>' : '') + '</div>';
    ov.addEventListener('click', e => { if (e.target === ov) Modal.close(); });
    $('[data-x]', ov).onclick = () => Modal.close();
    $('#modalRoot').appendChild(ov);
    let pushed = false;
    try { history.pushState({ sk: 1 }, ''); pushed = true; } catch (e) { /* abaikan */ }
    this.stack.push({ el: ov, pushed: pushed });
    document.body.style.overflow = 'hidden';
    return ov;
  },
  close(dariPop) {
    const m = this.stack.pop();
    if (!m) return;
    m.el.remove();
    if (m.pushed && !dariPop) { S.ignorePop++; try { history.back(); } catch (e) { S.ignorePop--; } }
    if (!this.stack.length) document.body.style.overflow = '';
  },
  closeAll() {
    let n = 0;
    while (this.stack.length) { const m = this.stack.pop(); m.el.remove(); if (m.pushed) n++; }
    document.body.style.overflow = '';
    if (n) { S.ignorePop++; try { history.go(-n); } catch (e) { S.ignorePop--; } }
  }
};
window.addEventListener('popstate', () => {
  if (S.ignorePop > 0) { S.ignorePop--; return; }
  if (Modal.stack.length) { Modal.close(true); return; }
  if (S.hist.length && S.user) { go(S.hist.pop(), { nopush: true }); } else { try { history.pushState({ sk: 1 }, ''); } catch (e) { /* abaikan */ } }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && Modal.stack.length) Modal.close(); });

function konfirmasi(pesan, tombol, onOk, bahaya) {
  const ov = Modal.open({
    title: 'Konfirmasi', body: '<p style="margin:0">' + esc(pesan) + '</p>',
    footer: '<button class="btn" data-no>Batal</button><button class="btn ' + (bahaya ? 'dng' : 'pri') + '" data-ok>' + esc(tombol || 'Ya, lanjutkan') + '</button>'
  });
  $('[data-no]', ov).onclick = () => Modal.close();
  $('[data-ok]', ov).onclick = function () { withBusy(this, async () => { await onOk(); }); };
  return ov;
}
function mintaCatatan(judul, label, wajib, tombol, onOk) {
  const ov = Modal.open({
    title: judul, body: '<div class="field"><label for="mcText">' + esc(label) + '</label><textarea class="inp" id="mcText" maxlength="200"></textarea></div>',
    footer: '<button class="btn" data-no>Batal</button><button class="btn pri" data-ok>' + esc(tombol) + '</button>'
  });
  $('[data-no]', ov).onclick = () => Modal.close();
  $('[data-ok]', ov).onclick = function () {
    const v = $('#mcText', ov).value.trim();
    if (wajib && !v) { toast('Catatan wajib diisi.', 'err'); return; }
    withBusy(this, async () => { await onOk(v); });
  };
}

// ════════════════════════════════════════════════════════
// BAGIAN 2: DATA, INDEKS, DAN PERHITUNGAN (semua di klien → instan)
// ════════════════════════════════════════════════════════
function efek(t) {
  const j = Number(t.Jumlah) || 0, sg = t.KoreksiDari ? -1 : 1, r = { TUNAI: 0, BANK: 0 };
  if (t.Jenis === 'TERIMA') { if (r[t.RekeningID] !== undefined) r[t.RekeningID] += j * sg; }
  else if (t.Jenis === 'KELUAR' || t.Jenis === 'BAYAR_PAJAK') { if (r[t.RekeningID] !== undefined) r[t.RekeningID] -= j * sg; }
  else if (t.Jenis === 'TARIK') { r.BANK -= j * sg; r.TUNAI += j * sg; }
  else if (t.Jenis === 'SETOR') { r.TUNAI -= j * sg; r.BANK += j * sg; }
  return r;
}
// ── Snapshot di perangkat (per pengguna): layar langsung tampil dari cache, lalu disegarkan di latar ──
const SNAP_KEY = 'sikades:v2:snap';
let _snapT = null;
function simpanSnap() {
  clearTimeout(_snapT);
  _snapT = setTimeout(() => { if (S.B && S.user) lsSet(SNAP_KEY, JSON.stringify({ u: S.user.username, t: S.loadedAt, b: S.B })); }, 500);
}
function bacaSnap() {
  try { const s = JSON.parse(lsGet(SNAP_KEY) || 'null'); return s && s.b && s.u ? s : null; } catch (e) { return null; }
}
function hapusSnap() { clearTimeout(_snapT); lsDel(SNAP_KEY); }
function setBoot(b) { b.penyaluran = b.penyaluran || []; S.B = b; S.loadedAt = Date.now(); reindex(); }
function reindex() {
  const B = S.B;
  simpanSnap();
  S.I = { kat: by(B.kategori), sd: by(B.sumberDana), jp: by(B.jenisPajak), tx: by(B.transaksi), rek: by(B.rekening), per: by(B.periode, 'Periode') };
  const awal = { TUNAI: 0, BANK: 0 };
  B.rekening.forEach(r => { if (awal[r.ID] !== undefined) awal[r.ID] = Number(r.SaldoAwal) || 0; });
  const now = { TUNAI: awal.TUNAI, BANK: awal.BANK }, bulan = {};
  B.transaksi.forEach(t => {
    const e = efek(t); now.TUNAI += e.TUNAI; now.BANK += e.BANK;
    const m = bulan[t.Periode] || (bulan[t.Periode] = { masuk: 0, keluar: 0, kat: {}, n: 0, draft: 0, tolak: 0 });
    m.n++;
    if (t.Status === 'DRAFT') m.draft++;
    if (t.Status === 'DITOLAK') m.tolak++;
    const j = (Number(t.Jumlah) || 0) * (t.KoreksiDari ? -1 : 1);
    if (t.Jenis === 'TERIMA') m.masuk += j;
    else if (t.Jenis === 'KELUAR' || t.Jenis === 'BAYAR_PAJAK') {
      m.keluar += j;
      const nm = t.Jenis === 'BAYAR_PAJAK' ? 'Setoran pajak' : (S.I.kat[t.KategoriID] ? S.I.kat[t.KategoriID].Nama : 'Lainnya');
      m.kat[nm] = (m.kat[nm] || 0) + j;
    }
  });
  const titipan = B.pajak.filter(x => x.Status === 'BELUM').reduce((a, x) => a + x.Jumlah, 0);
  const belumSerah = (B.penyaluran || []).filter(x => x.Status === 'BELUM').reduce((a, x) => a + x.Jumlah, 0);
  const sisTx = B.transaksi.filter(t => t.Jenis === 'KELUAR' && !t.KoreksiDari && !t.DikoreksiID && t.Siskeudes === 'BELUM'), sisSl = (B.penyaluran || []).filter(x => x.Status === 'BELUM' && x.Siskeudes === 'BELUM');
  S.calc = { awal: awal, now: now, bulan: bulan, titipan: titipan, belumSerah: belumSerah, sisTx: sisTx, sisSl: sisSl, sisJml: sisTx.concat(sisSl).reduce((a, x) => a + x.Jumlah, 0) };
}
function saldoSampai(filter) {
  const r = { TUNAI: S.calc.awal.TUNAI, BANK: S.calc.awal.BANK };
  S.B.transaksi.forEach(t => { if (filter(t)) { const e = efek(t); r.TUNAI += e.TUNAI; r.BANK += e.BANK; } });
  return r;
}
function periodeStatus(p) { const r = S.I.per[p]; return r ? r.Status : 'BUKA'; }
function periodOptions() {
  const set = {}, cur = hariIni().slice(0, 7);
  set[cur] = 1;
  if (S.per) set[S.per] = 1;
  S.B.transaksi.forEach(t => { set[t.Periode] = 1; });
  S.B.periode.forEach(p => { set[p.Periode] = 1; });
  let d = cur;
  for (let i = 0; i < 5; i++) { d = prevPer(d); set[d] = 1; }
  return Object.keys(set).sort().reverse();
}
function perSelect(handler, val, withAll) {
  return '<select class="inp" aria-label="Periode" onchange="' + handler + '(this.value)">'
    + (withAll ? '<option value="ALL"' + (val === 'ALL' ? ' selected' : '') + '>Semua periode</option>' : '')
    + periodOptions().map(p => '<option value="' + p + '"' + (p === val ? ' selected' : '') + '>' + labelPer(p) + '</option>').join('') + '</select>';
}
function applyDelta(d) {
  if (!d) return;
  const B = S.B;
  const up = (arr, rows, key) => { (rows || []).forEach(r => { const i = arr.findIndex(x => x[key || 'ID'] === r[key || 'ID']); if (i >= 0) arr[i] = r; else arr.push(r); }); };
  if (d.delTx && d.delTx.length) B.transaksi = B.transaksi.filter(t => d.delTx.indexOf(t.ID) < 0);
  if (d.delPajak && d.delPajak.length) B.pajak = B.pajak.filter(t => d.delPajak.indexOf(t.ID) < 0);
  if (!B.penyaluran) B.penyaluran = [];
  if (d.delPenyaluran && d.delPenyaluran.length) B.penyaluran = B.penyaluran.filter(t => d.delPenyaluran.indexOf(t.ID) < 0);
  up(B.penyaluran, d.penyaluran);
  up(B.transaksi, d.tx); up(B.pajak, d.pajak); up(B.periode, d.periode, 'Periode'); up(B.rekonsiliasi, d.rekon); up(B.opname, d.opname);
  reindex();
}
function rerender() {
  const y = window.scrollY;
  renderChrome();
  PAGES[S.page]();
  window.scrollTo(0, y);
}
async function muatUlang(diam) {
  try {
    const res = await api('bootstrap');
    setBoot(res.data);
    S.user = res.data.user;
    if (!diam) toast('Data diperbarui.', 'ok');
    const aktif = document.activeElement;
    if (Modal.stack.length === 0 && !(aktif && /INPUT|SELECT|TEXTAREA/.test(aktif.tagName))) rerender(); else renderChrome();
  } catch (e) { if (!diam) toast(e.message, 'err'); }
}
A.refresh = () => { const b = $('#btnRefresh'); b.disabled = true; muatUlang(false).then(() => { b.disabled = false; }); };

// ════════════════════════════════════════════════════════
// BAGIAN 3: LOGIN, MASUK, KELUAR
// ════════════════════════════════════════════════════════
function tampilLogin(pesan) {
  $('#splash').classList.add('hide');
  $('#app').classList.add('hide');
  $('#loginView').classList.remove('hide');
  $('#lErr').textContent = pesan || '';
  setTimeout(() => { const u = $('#lUser'); if (u && !u.value) u.focus(); }, 50);
}
function paksaKeluar(pesan) {
  lsDel('sk_token'); hapusSnap(); S.cache = {};
  S.token = null; S.user = null; S.B = null;
  Modal.closeAll();
  tampilLogin(pesan);
}
function masukAplikasi(boot) {
  setBoot(boot);
  S.user = boot.user;
  S.per = hariIni().slice(0, 7);
  S.f.per = S.per; S.lap.per = S.per; S.hist = [];
  $('#splashRetry').classList.add('hide');
  document.title = (boot.config.appName || 'SIKADES') + ' — Kas Desa';
  $('#splash').classList.add('hide');
  $('#loginView').classList.add('hide');
  $('#app').classList.remove('hide');
  go('dashboard', { nopush: true });
  if (isSU()) prefetchSU();
}
/** Superuser: ambil daftar pengguna + audit sekaligus (1 panggilan) saat idle → menu langsung terisi. */
function prefetchSU() {
  const run = () => SkApi.call('batch', { calls: [{ action: 'daftarUser' }, { action: 'getAudit' }] }).then(r => {
    if (r && r.success) Object.keys(r.data).forEach(k => { if (r.data[k] && r.data[k].success) S.cache[k] = { t: Date.now(), d: r.data[k].data }; });
  }).catch(() => {});
  (window.requestIdleCallback || setTimeout)(run, 1500);
}
/** Tampilkan cache lebih dulu (bila ada), segarkan di latar; render ulang hanya bila datanya berbeda. */
async function swr(key, action, render, fresh) {
  const c = S.cache[key];
  if (c) render(c.d);
  if (c && Date.now() - c.t < (fresh || 60000)) return;
  const res = await api(action);
  const sama = c && JSON.stringify(c.d) === JSON.stringify(res.data);
  S.cache[key] = { t: Date.now(), d: res.data };
  if (!sama) render(res.data);
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#lBtn');
  const u = $('#lUser').value.trim(), p = $('#lPass').value;
  if (!u || !p) { $('#lErr').textContent = 'Isi username dan password.'; return; }
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Memeriksa…'; $('#lErr').textContent = '';
  try {
    const res = await SkApi.call('login', { username: u, password: p }, { timeout: 45000 });
    if (!res || !res.success) { $('#lErr').textContent = (res && res.message) || 'Gagal masuk.'; return; }
    S.token = res.data.token; SkApi.setToken(S.token); lsSet('sk_token', S.token);
    $('#lPass').value = '';
    hapusSnap();
    masukAplikasi(res.data.boot);
  } catch (err) { $('#lErr').textContent = (err && err.message) || 'Koneksi bermasalah.'; }
  finally { btn.disabled = false; btn.textContent = 'Masuk'; }
});
A.keluar = () => {
  konfirmasi('Keluar dari aplikasi?', 'Keluar', async () => {
    try { SkApi.call('logout', {}, { quiet: true, timeout: 8000 }); } catch (e) { /* abaikan */ }
    paksaKeluar('');
  });
};

// ════════════════════════════════════════════════════════
// BAGIAN 4: NAVIGASI SPA
// ════════════════════════════════════════════════════════
const NAV = [
  { id: 'dashboard', l: 'Beranda', i: 'home' }, { id: 'transaksi', l: 'Transaksi', i: 'list' }, { id: 'pajak', l: 'Pajak', i: 'percent' },
  { id: 'laporan', l: 'Laporan', i: 'file' }, { id: 'tutup', l: 'Tutup Bulan', i: 'lock', desk: true },
  { id: 'master', l: 'Master Data', i: 'book', su: true, desk: true }, { id: 'pengguna', l: 'Pengguna', i: 'users', su: true, desk: true },
  { id: 'pengaturan', l: 'Pengaturan', i: 'sliders', su: true, desk: true }, { id: 'audit', l: 'Audit Log', i: 'shield', su: true, desk: true }
];
const TITLES = { dashboard: 'Beranda', transaksi: 'Transaksi Kas', pajak: 'Pajak', laporan: 'Laporan', tutup: 'Tutup Bulan', menu: 'Menu', master: 'Master Data', pengguna: 'Pengguna', pengaturan: 'Pengaturan', audit: 'Audit Log' };
function badge(id) {
  if (!S.B) return 0;
  if (id === 'transaksi') {
    const dr = S.B.transaksi.filter(t => t.Status === 'DRAFT').length, tl = S.B.transaksi.filter(t => t.Status === 'DITOLAK').length;
    if (can('SEKDES') && !can('BENDAHARA')) return dr;
    if (can('BENDAHARA') && !can('SEKDES')) return tl;
    return dr + tl;
  }
  if (id === 'pajak' && can('BENDAHARA')) return S.B.pajak.filter(x => x.Status === 'BELUM').length;
  return 0;
}
function renderChrome() {
  const p = S.page, cfg = S.B.config;
  $('#pageTitle').textContent = TITLES[p] || '';
  $('#pageSub').textContent = (cfg.namaDesa || '') + ' · ' + (ROLE[S.user.role] || '');
  const nv = NAV.filter(n => !n.su || isSU());
  const logo = cfg.logoUrl ? '<img src="' + esc(cfg.logoUrl) + '" alt="" onerror="this.remove()">' : icon('coins', 'lg');
  $('#side').innerHTML = '<div class="brand"><div class="brand-mark">' + logo + '</div><div><h1 style="font-size:17px">' + esc(cfg.appName || 'SIKADES') + '</h1><p>Kas Desa</p></div></div>'
    + nv.map(n => { const b = badge(n.id); return '<button class="nv ' + (p === n.id ? 'on' : '') + '" onclick="A.go(\'' + n.id + '\')">' + icon(n.i) + '<span class="grow">' + n.l + '</span>' + (b ? '<span class="pill bad">' + b + '</span>' : '') + '</button>'; }).join('')
    + '<div class="sep"></div><button class="nv" onclick="A.formPassword()">' + icon('shield') + 'Ganti password</button>'
    + '<button class="nv" onclick="A.toggleTema()">' + icon('moon') + 'Tema terang/gelap</button><button class="nv" onclick="A.keluar()">' + icon('logout') + 'Keluar (' + esc(S.user.username) + ')</button>';
  const ids = ['dashboard', 'transaksi', 'pajak', 'laporan', 'menu'], lbl = { dashboard: 'Beranda', transaksi: 'Transaksi', pajak: 'Pajak', laporan: 'Laporan', menu: 'Menu' }, ic = { dashboard: 'home', transaksi: 'list', pajak: 'percent', laporan: 'file', menu: 'more' };
  const grupMenu = ['menu', 'tutup', 'master', 'pengguna', 'pengaturan', 'audit'];
  $('#bnav').innerHTML = ids.map(id => {
    const on = id === 'menu' ? grupMenu.indexOf(p) >= 0 : p === id, b = badge(id);
    return '<button class="' + (on ? 'on' : '') + '" onclick="A.go(\'' + id + '\')">' + icon(ic[id]) + '<span>' + lbl[id] + '</span>' + (b ? '<span class="dot">' + b + '</span>' : '') + '</button>';
  }).join('');
  $('#fab').classList.toggle('hide', !(can('BENDAHARA') && p === 'transaksi'));
}
function go(page, opt) {
  opt = opt || {};
  if (!PAGES[page]) page = 'dashboard';
  if (!opt.nopush && page !== S.page) { S.hist.push(S.page); try { history.pushState({ sk: 1 }, ''); } catch (e) { /* abaikan */ } }
  S.page = page;
  renderChrome();
  PAGES[page]();
  window.scrollTo(0, 0);
}
A.go = p => { if (Modal.stack.length) Modal.closeAll(); go(p); };

// ════════════════════════════════════════════════════════
// BAGIAN 5: KOMPONEN TAMPILAN
// ════════════════════════════════════════════════════════
const STATUS_TX = { DRAFT: ['wr', 'Draft'], DITOLAK: ['bad', 'Ditolak'], VERIFIED: ['ok', 'Terverifikasi'] };
const STATUS_PER = { BUKA: ['', 'Terbuka'], DIAJUKAN: ['wr', 'Diajukan'], DIPERIKSA: ['wr', 'Diperiksa Sekdes'], DITUTUP: ['ok', 'Ditutup'] };
function pill(cls, txt) { return '<span class="pill ' + cls + '">' + esc(txt) + '</span>'; }
function jenisLabel(t) { return (t.KoreksiDari ? 'Koreksi · ' : '') + JENIS[t.Jenis]; }
function ketKas(t) {
  if (t.Jenis === 'TARIK') return 'Bank → Tunai';
  if (t.Jenis === 'SETOR') return 'Tunai → Bank';
  return REK[t.RekeningID] || '';
}
function txRow(t) {
  const e = efek(t), net = e.TUNAI + e.BANK, mut = t.Jenis === 'TARIK' || t.Jenis === 'SETOR';
  const ic = mut ? 'swap' : (net >= 0 ? 'in' : 'out');
  const amt = mut ? '<span class="amt mv">' + fmtNum(t.Jumlah) + '</span>' : '<span class="amt ' + (net >= 0 ? 'in' : '') + '">' + (net >= 0 ? '+' : '−') + fmtNum(Math.abs(net)) + '</span>';
  const st = t.Status !== 'VERIFIED' ? pill(STATUS_TX[t.Status][0], STATUS_TX[t.Status][1]) : '';
  const kor = t.KoreksiDari ? pill('bad', 'Koreksi') : (t.DikoreksiID ? pill('', 'Dikoreksi') : '');
  const lamp = t.BuktiID ? icon('clip', 'sm') : '';
  const sis = (t.Jenis === 'KELUAR' && !t.KoreksiDari && !t.DikoreksiID) ? (t.Siskeudes === 'SUDAH' ? pill('ok', 'Siskeudes ✓') : (t.Siskeudes === 'BELUM' ? pill('wr', 'Belum cair Siskeudes') : '')) : '';
  return '<button class="item" onclick="A.detailTx(\'' + t.ID + '\')"><span class="ico ' + (ic === 'in' ? 'in' : '') + '">' + icon(ic) + '</span>'
    + '<span class="grow"><span class="t1">' + esc(t.Uraian) + '</span><span class="t2"><span>' + esc(t.NoBukti) + '</span><span>' + esc(ketKas(t)) + '</span>' + lamp + st + kor + sis + '</span></span>' + amt + '</button>';
}
function urutTx(a, b) { return a.Tanggal !== b.Tanggal ? (a.Tanggal < b.Tanggal ? 1 : -1) : (a.DibuatPada < b.DibuatPada ? 1 : -1); }
function listHari(arr) {
  let h = '', last = '';
  arr.forEach(t => { if (t.Tanggal !== last) { last = t.Tanggal; h += '<div class="daystamp">' + fmtTgl(last) + '</div>'; } h += txRow(t); });
  return h;
}
function kpi(label, ic, val, sub, cls, click) {
  return '<div class="kpi ' + (cls || '') + '"' + (click ? ' style="cursor:pointer" onclick="' + click + '"' : '') + '><div class="k-l">' + (ic ? icon(ic, 'sm') : '') + esc(label) + '</div><div class="k-v">' + String(val).replace(/^Rp /, '<span class="cur">Rp</span> ') + '</div>' + (sub ? '<div class="k-s">' + sub + '</div>' : '') + '</div>';
}
function skeleton(n) { let h = ''; for (let i = 0; i < (n || 4); i++) h += '<div class="skel mb"></div>'; return h; }

// ── Grafik batang SVG ringan (tanpa library) ──
function chartSvg(series) {
  const W = 340, H = 160, pl = 6, pr = 6, pt = 10, pb = 24, n = series.length;
  const max = Math.max(1, ...series.map(s => Math.max(s.m, s.k))) * 1.08;
  const gw = (W - pl - pr) / n, bw = Math.min(18, gw * 0.32), ih = H - pt - pb;
  let g = '<line class="grid-l" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '"/>';
  series.forEach((s, i) => {
    const cx = pl + gw * i + gw / 2, hm = ih * s.m / max, hk = ih * s.k / max;
    g += '<g class="col" onclick="A.chartTap(' + i + ')"><rect x="' + (cx - gw / 2) + '" y="' + pt + '" width="' + gw + '" height="' + (ih + pb) + '" fill="transparent"/>'
      + '<rect class="bar-in" x="' + (cx - bw - 1) + '" y="' + (H - pb - hm) + '" width="' + bw + '" height="' + (s.m > 0 ? Math.max(hm, 2) : 0) + '" rx="3"/>'
      + '<rect class="bar-out" x="' + (cx + 1) + '" y="' + (H - pb - hk) + '" width="' + bw + '" height="' + (s.k > 0 ? Math.max(hk, 2) : 0) + '" rx="3"/>'
      + '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(s.l) + '</text></g>';
  });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik penerimaan dan pengeluaran enam bulan">' + g + '</svg>';
}
let _seri = [];
A.chartTap = i => {
  const s = _seri[i], el = $('#chartCap');
  if (s && el) el.innerHTML = '<b>' + esc(s.full) + '</b> · Penerimaan ' + rp(s.m) + ' · Pengeluaran ' + rp(s.k);
};

// ── Analisis otomatis (panel Insight) ──
function buatInsight() {
  const out = [], p = S.per, c = S.calc, m = c.bulan[p] || { masuk: 0, keluar: 0, kat: {}, n: 0 }, pv = c.bulan[prevPer(p)];
  if (m.n === 0) out.push({ t: 'Belum ada transaksi pada ' + labelPer(p) + '.' });
  else { const d = m.masuk - m.keluar; out.push({ t: 'Pada ' + labelPer(p) + ', penerimaan ' + rp(m.masuk) + ' dan pengeluaran ' + rp(m.keluar) + '; kas ' + (d >= 0 ? 'bertambah ' : 'berkurang ') + rp(Math.abs(d)) + '.' }); }
  if (pv && pv.keluar > 0 && m.keluar > 0) {
    const ch = (m.keluar - pv.keluar) / pv.keluar * 100;
    if (Math.abs(ch) >= 5) out.push({ t: 'Pengeluaran ' + (ch > 0 ? 'naik ' : 'turun ') + Math.abs(ch).toFixed(0) + '% dibanding ' + labelPer(prevPer(p)) + '.' });
  }
  const kats = Object.keys(m.kat).map(k => [k, m.kat[k]]).sort((a, b) => b[1] - a[1]);
  if (kats.length && m.keluar > 0 && kats[0][1] > 0) out.push({ t: 'Pengeluaran terbesar: ' + kats[0][0] + ' (' + (kats[0][1] / m.keluar * 100).toFixed(0) + '% dari total pengeluaran bulan ini).' });
  const batas = Number(S.B.config.batasKasTunai) || 0;
  if (batas > 0 && c.now.TUNAI > batas) out.push({ w: 1, t: 'Saldo kas tunai ' + rp(c.now.TUNAI) + ' melebihi batas ' + rp(batas) + '. Pertimbangkan menyetor ke bank.' });
  const belum = S.B.pajak.filter(x => x.Status === 'BELUM');
  if (belum.length) {
    const tua = Math.max.apply(null, belum.map(x => diffHari(x.TanggalPotong, hariIni())));
    out.push({ w: tua > 14, t: belum.length + ' potongan pajak senilai ' + rp(c.titipan) + ' belum disetor' + (tua > 0 ? ' (yang tertua ' + tua + ' hari)' : '') + '.' });
    const bebas = c.now.TUNAI - c.titipan - c.belumSerah;
    out.push({ w: bebas < 0, t: 'Dari kas tunai ' + rp(c.now.TUNAI) + ', ' + rp(c.titipan) + ' adalah titipan pajak' + (c.belumSerah > 0 ? ' dan ' + rp(c.belumSerah) + ' dana kegiatan belum diserahkan' : '') + '. Dana tunai yang bebas dipakai: ' + rp(bebas) + '.' });
  }
  if (c.sisTx.length + c.sisSl.length) out.push({ t: (c.sisTx.length + c.sisSl.length) + ' kegiatan/pengeluaran senilai ' + rp(c.sisJml) + ' belum dicairkan di Siskeudes.' });
  const bs = S.B.penyaluran.filter(x => x.Status === 'BELUM');
  if (bs.length) {
    const tua2 = Math.max.apply(null, bs.map(x => diffHari(x.Tanggal, hariIni())));
    out.push({ w: tua2 > 14, t: bs.length + ' kegiatan senilai ' + rp(c.belumSerah) + ' dananya belum diserahkan ke pelaksana (yang tertua ' + tua2 + ' hari di kas tunai).' });
  }
  const dr = S.B.transaksi.filter(t => t.Status === 'DRAFT').length, tl = S.B.transaksi.filter(t => t.Status === 'DITOLAK').length;
  if (dr) out.push({ t: dr + ' transaksi menunggu verifikasi Sekretaris Desa.' });
  if (tl) out.push({ w: 1, t: tl + ' transaksi ditolak dan perlu diperbaiki bendahara.' });
  const cur = hariIni().slice(0, 7), lama = Object.keys(c.bulan).filter(k => k < cur && periodeStatus(k) !== 'DITUTUP').sort();
  if (lama.length) out.push({ w: 1, t: 'Periode ' + lama.slice(0, 2).map(labelPer).join(' dan ') + (lama.length > 2 ? ' (dan ' + (lama.length - 2) + ' lainnya)' : '') + ' belum ditutup.' });
  const rk = S.B.rekonsiliasi.slice().sort((a, b) => a.Periode < b.Periode ? 1 : -1)[0];
  if (rk && rk.Selisih !== 0) out.push({ w: 1, t: 'Rekonsiliasi bank ' + labelPer(rk.Periode) + ' masih selisih ' + rp(rk.Selisih) + '.' });
  return out.slice(0, 8);
}

// ════════════════════════════════════════════════════════
// BAGIAN 6: HALAMAN
// ════════════════════════════════════════════════════════
const PAGES = {};
const V = () => $('#view');

// ── Beranda / Dashboard ──
PAGES.dashboard = function () {
  const c = S.calc, p = S.per, m = c.bulan[p] || { masuk: 0, keluar: 0, n: 0 }, st = periodeStatus(p);
  const total = c.now.TUNAI + c.now.BANK, bebas = c.now.TUNAI - c.titipan - c.belumSerah;
  _seri = [];
  for (let i = 5; i >= 0; i--) { const q = prevPer(p, i), b = c.bulan[q] || { masuk: 0, keluar: 0 }; _seri.push({ l: BLN[+q.slice(5, 7) - 1], full: labelPer(q), m: Math.max(b.masuk, 0), k: Math.max(b.keluar, 0) }); }
  const belumN = S.B.pajak.filter(x => x.Status === 'BELUM').length;
  const ins = buatInsight();
  const recent = S.B.transaksi.slice().sort(urutTx).slice(0, 5);
  let h = '';
  if (S.user.pwBawaan) h += '<div class="banner">' + icon('alert') + '<div><b>Password masih bawaan.</b> Segera ganti agar akun aman. <a href="javascript:void(0)" onclick="A.formPassword()">Ganti sekarang</a></div></div>';
  h += '<div class="row mb"><div class="grow">' + perSelect('A.setPer', p) + '</div>' + pill(STATUS_PER[st][0], 'Periode ' + STATUS_PER[st][1].toLowerCase()) + '</div>';
  h += '<div class="grid g2">'
    + kpi('Total kas saat ini', 'coins', rp(total), 'Bank + tunai per ' + fmtTgl(hariIni()), 'hero')
    + kpi('Kas Bank', 'bank', rp(c.now.BANK))
    + kpi('Kas Tunai', 'wallet', rp(c.now.TUNAI), c.titipan + c.belumSerah > 0 ? 'Bebas dipakai ' + rp(bebas) : '')
    + kpi('Penerimaan ' + shortPer(p), 'in', rp(m.masuk))
    + kpi('Pengeluaran ' + shortPer(p), 'out', rp(m.keluar))
    + '</div>';
  if (c.titipan > 0) h += '<div class="mt">' + kpi('Titipan pajak belum disetor', 'percent', rp(c.titipan), belumN + ' potongan · ketuk untuk melihat', 'warn', 'A.go(\'pajak\')') + '</div>';
  if (c.belumSerah > 0) h += '<div class="mt">' + kpi('Dana kegiatan belum diserahkan', 'users', rp(c.belumSerah), S.B.penyaluran.filter(x => x.Status === 'BELUM').length + ' kegiatan · ketuk untuk melihat', 'warn', 'A.formSerah()') + '</div>';
  if (c.sisTx.length + c.sisSl.length > 0) h += '<div class="mt">' + kpi('Belum dicairkan di Siskeudes', 'file', rp(c.sisJml), (c.sisTx.length + c.sisSl.length) + ' kegiatan/pengeluaran · ketuk untuk melihat', 'warn', 'A.formSis()') + '</div>';
  if (can('BENDAHARA')) h += '<div class="sectionhead"><h2>Catat cepat</h2></div><div class="chooser">' + chooserBtns() + '</div>';
  h += '<div class="sectionhead"><h2>Tren 6 bulan</h2><div class="legend"><span><i style="background:var(--accent)"></i>Terima</span><span><i style="background:var(--muted);opacity:.55"></i>Keluar</span></div></div>'
    + '<div class="card">' + chartSvg(_seri) + '<div class="xs muted center" id="chartCap">Ketuk batang untuk melihat nilainya</div></div>';
  h += '<div class="sectionhead"><h2>Analisis otomatis</h2></div><div class="insight"><h3>' + icon('spark') + 'Ringkasan & peringatan</h3><ul>'
    + ins.map(i => '<li class="' + (i.w ? 'w' : '') + '">' + esc(i.t) + '</li>').join('') + '</ul></div>';
  h += '<div class="sectionhead"><h2>Transaksi terbaru</h2><button class="btn sm ghost" onclick="A.go(\'transaksi\')">Lihat semua</button></div>';
  h += recent.length ? '<div class="list">' + recent.map(txRow).join('') + '</div>' : '<div class="card empty">Belum ada transaksi. Mulai dengan mengisi saldo awal di menu Pengaturan, lalu catat transaksi pertama.</div>';
  V().innerHTML = h;
};
A.setPer = p => { S.per = p; S.f.per = p; S.lap.per = p; if (S.page === 'dashboard') PAGES.dashboard(); else if (S.page === 'tutup') PAGES.tutup(); };
function chooserBtns() {
  return '<button onclick="A.formTx(\'TERIMA\')"><span class="ico">' + icon('in') + '</span>Penerimaan<small>Transfer masuk, bunga, dll.</small></button>'
    + '<button onclick="A.formTx(\'KELUAR\')"><span class="ico">' + icon('out') + '</span>Pengeluaran<small>Belanja, biaya bank, pajak bunga</small></button>'
    + '<button onclick="A.formTarik()"><span class="ico">' + icon('wallet') + '</span>Tarik Tunai<small>Bank → tunai, penerima & pajak</small></button>'
    + '<button onclick="A.formTx(\'SETOR\')"><span class="ico">' + icon('bank') + '</span>Setor Tunai<small>Tunai → bank</small></button>';
}
$('#fab').addEventListener('click', () => {
  Modal.open({ title: 'Catat transaksi', body: '<div class="chooser">' + chooserBtns() + '</div>' });
});

// ── Transaksi (Buku Kas) ──
PAGES.transaksi = function () {
  const f = S.f;
  const chips = [['', 'Semua'], ['TERIMA', 'Penerimaan'], ['KELUAR', 'Pengeluaran'], ['MUTASI', 'Tarik/Setor'], ['BAYAR_PAJAK', 'Setor Pajak']];
  let h = '<div class="toolbar t2">' + perSelect('A.fPer', f.per, true)
    + '<div class="row"><div class="grow" style="position:relative"><input class="inp" id="fq" type="search" placeholder="Cari uraian, no. bukti, penerima…" value="' + esc(f.q) + '" oninput="A.fQ(this.value)" style="padding-left:38px"><span style="position:absolute;left:12px;top:13px;color:var(--muted)">' + icon('search') + '</span></div></div></div>';
  h += '<div class="tabs mb">' + chips.map(c => '<button class="chip ' + (f.jenis === c[0] ? 'on' : '') + '" onclick="A.fJenis(\'' + c[0] + '\')">' + c[1] + '</button>').join('') + '</div>';
  h += '<div class="grid g2 mb"><select class="inp" aria-label="Kas" onchange="A.fRek(this.value)"><option value="">Semua kas</option><option value="TUNAI"' + (f.rek === 'TUNAI' ? ' selected' : '') + '>Kas Tunai</option><option value="BANK"' + (f.rek === 'BANK' ? ' selected' : '') + '>Kas Bank</option></select>'
    + '<select class="inp" aria-label="Status" onchange="A.fStatus(this.value)"><option value="">Semua status</option><option value="DRAFT"' + (f.status === 'DRAFT' ? ' selected' : '') + '>Draft</option><option value="DITOLAK"' + (f.status === 'DITOLAK' ? ' selected' : '') + '>Ditolak</option><option value="VERIFIED"' + (f.status === 'VERIFIED' ? ' selected' : '') + '>Terverifikasi</option></select></div>';
  h += '<div class="mb"><select class="inp" aria-label="Siskeudes" onchange="A.fSis(this.value)"><option value="">Semua status Siskeudes</option><option value="BELUM"' + (f.sis === 'BELUM' ? ' selected' : '') + '>Belum dicairkan di Siskeudes</option><option value="SUDAH"' + (f.sis === 'SUDAH' ? ' selected' : '') + '>Sudah dicairkan di Siskeudes</option></select></div>';
  h += '<div id="txbar"></div><div id="txlist"></div>';
  V().innerHTML = h;
  renderTxList();
};
function txTersaring() {
  const f = S.f, q = f.q.trim().toLowerCase();
  return S.B.transaksi.filter(t => {
    if (f.per && f.per !== 'ALL' && t.Periode !== f.per) return false;
    if (f.jenis === 'MUTASI' ? (t.Jenis !== 'TARIK' && t.Jenis !== 'SETOR') : (f.jenis && t.Jenis !== f.jenis)) return false;
    if (f.status && t.Status !== f.status) return false;
    if (f.sis && !(t.Jenis === 'KELUAR' && !t.KoreksiDari && !t.DikoreksiID && t.Siskeudes === f.sis)) return false;
    if (f.rek) { const e = efek(t); if (e[f.rek] === 0) return false; }
    if (q && (t.Uraian + ' ' + t.NoBukti + ' ' + t.Kegiatan + ' ' + t.DiserahkanKepada + ' ' + t.Keterangan).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(urutTx);
}
function renderTxList() {
  const arr = txTersaring(), lim = S.f.limit, el = $('#txlist');
  if (!el) return;
  const drafts = arr.filter(t => t.Status === 'DRAFT');
  const bar = $('#txbar');
  if (bar) bar.innerHTML = (can('SEKDES') && drafts.length)
    ? '<div class="banner" style="background:var(--accent-soft)">' + icon('info') + '<div class="grow"><b>' + drafts.length + ' transaksi menunggu verifikasi.</b></div><button class="btn sm pri" onclick="A.verifSemua()">Verifikasi semua</button></div>' : '';
  if (!arr.length) { el.innerHTML = '<div class="card empty">Tidak ada transaksi yang cocok.</div>'; return; }
  el.innerHTML = '<div class="list">' + listHari(arr.slice(0, lim)) + '</div>' + (arr.length > lim ? '<button class="btn block mt" onclick="A.fMore()">Tampilkan lebih banyak (' + (arr.length - lim) + ')</button>' : '') + '<p class="xs muted center mt">' + arr.length + ' transaksi</p>';
}
A.fPer = v => { S.f.per = v; S.f.limit = 60; renderTxList(); };
A.fJenis = v => { S.f.jenis = v; S.f.limit = 60; PAGES.transaksi(); };
A.fRek = v => { S.f.rek = v; S.f.limit = 60; renderTxList(); };
A.fSis = v => { S.f.sis = v; S.f.limit = 60; renderTxList(); };
A.fStatus = v => { S.f.status = v; S.f.limit = 60; renderTxList(); };
let _qt = null;
A.fQ = v => { S.f.q = v; clearTimeout(_qt); _qt = setTimeout(() => { S.f.limit = 60; renderTxList(); }, 150); };
A.fMore = () => { S.f.limit += 60; renderTxList(); };
A.verifSemua = () => {
  const ids = txTersaring().filter(t => t.Status === 'DRAFT').map(t => t.ID);
  if (!ids.length) return;
  konfirmasi('Verifikasi ' + ids.length + ' transaksi yang berstatus Draft? Transaksi yang sudah diverifikasi akan terkunci.', 'Verifikasi', async () => {
    const res = await api('verifikasi', { ids: ids });
    applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
  });
};

// ── Detail transaksi ──
A.detailTx = id => {
  const t = S.I.tx[id];
  if (!t) return;
  const kat = S.I.kat[t.KategoriID], sd = S.I.sd[t.SumberDanaID];
  const kv = [['No. Bukti', t.NoBukti], ['Tanggal', fmtTgl(t.Tanggal)], ['Jenis', jenisLabel(t)], ['Kas', ketKas(t)], ['Jumlah', '<b>' + rp(t.Jumlah) + '</b>'],
    ['Kategori', kat ? esc(kat.Nama) : ''], ['Sumber dana', sd ? esc(sd.Nama) : ''], ['Kegiatan', esc(t.Kegiatan)], ['Diserahkan kepada', esc(t.DiserahkanKepada)],
    ['Uraian', esc(t.Uraian)], ['Keterangan', esc(t.Keterangan)], ['Pencairan Siskeudes', t.Jenis === 'KELUAR' && !t.KoreksiDari && t.Siskeudes ? (t.Siskeudes === 'SUDAH' ? pill('ok', 'Sudah dicairkan' + (t.TglSiskeudes ? ' · ' + fmtTgl(t.TglSiskeudes) : '')) : pill('wr', 'Belum dicairkan')) : ''], ['Status', pill(STATUS_TX[t.Status][0], STATUS_TX[t.Status][1])], ['Dicatat oleh', esc(t.DibuatOleh)],
    ['Diverifikasi', t.DiverifikasiOleh ? esc(t.DiverifikasiOleh) + ' · ' + esc((t.DiverifikasiPada || '').slice(0, 16)) : ''], ['Catatan', t.Catatan ? '<span style="color:var(--danger)">' + esc(t.Catatan) + '</span>' : '']];
  if (t.KoreksiDari && S.I.tx[t.KoreksiDari]) kv.push(['Koreksi atas', esc(S.I.tx[t.KoreksiDari].NoBukti)]);
  if (t.DikoreksiID && S.I.tx[t.DikoreksiID]) kv.push(['Dikoreksi oleh', esc(S.I.tx[t.DikoreksiID].NoBukti)]);
  let body = '<dl class="kv">' + kv.filter(r => r[1] !== '' && r[1] !== undefined).map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>';
  let pj = [];
  if (t.GrupID && t.Jenis === 'TARIK') pj = S.B.pajak.filter(x => x.GrupID === t.GrupID && x.Status !== 'BATAL');
  if (t.Jenis === 'BAYAR_PAJAK') pj = S.B.pajak.filter(x => x.TransaksiBayarID === t.ID);
  if (pj.length) body += '<div class="sectionhead"><h2>Pajak terkait</h2></div><div class="list">' + pj.map(x => '<div class="item" style="min-height:0"><span class="grow"><span class="t1">' + esc((S.I.jp[x.JenisPajakID] || {}).Nama || 'Pajak') + ' — ' + esc(x.Uraian) + '</span><span class="t2"><span>' + (x.KodeBilling ? 'Billing ' + esc(x.KodeBilling) : 'Kode billing belum diisi') + '</span>' + (x.Status === 'SUDAH' ? pill('ok', 'Dibayar ' + fmtTgl(x.TanggalBayar)) : pill('wr', 'Belum dibayar')) + '</span></span><span class="amt">' + fmtNum(x.Jumlah) + '</span></div>').join('') + '</div>';
  let sl = [];
  if (t.GrupID && t.Jenis === 'TARIK') sl = S.B.penyaluran.filter(x => x.GrupID === t.GrupID && x.Status !== 'BATAL');
  if (t.Jenis === 'KELUAR') sl = S.B.penyaluran.filter(x => x.TransaksiSerahID === t.ID);
  if (sl.length) body += '<div class="sectionhead"><h2>Dana kegiatan belum / sudah diserahkan</h2></div><div class="list">' + sl.map(x => '<div class="item" style="min-height:0"><span class="grow"><span class="t1">' + esc(x.Kegiatan) + ' — ' + esc(x.DiserahkanKepada) + '</span><span class="t2">' + (x.Status === 'SUDAH' ? pill('ok', 'Diserahkan ' + fmtTgl(x.TanggalSerah)) : pill('wr', 'Belum diserahkan')) + '</span></span><span class="amt">' + fmtNum(x.Jumlah) + '</span></div>').join('') + '</div>';
  if (t.BuktiID) body += '<button class="btn block mt" onclick="A.lihatBukti(\'' + t.ID + '\')">' + icon('eye') + 'Lihat lampiran (' + esc(t.BuktiNama || 'bukti') + ')</button>';
  const f = [];
  const editable = ['DRAFT', 'DITOLAK'].indexOf(t.Status) >= 0 && !t.KoreksiDari;
  const anak = t.GrupID && t.Jenis !== 'TARIK';
  if (can('BENDAHARA') && editable) {
    if (anak) f.push('<button class="btn" onclick="A.detailTx(\'' + t.GrupID + '\')">Buka penarikan induk</button>');
    else {
      if (t.Jenis !== 'BAYAR_PAJAK') f.push('<button class="btn" onclick="A.ubahTx(\'' + t.ID + '\')">' + icon('edit') + 'Ubah</button>');
      f.push('<button class="btn dng" onclick="A.hapusTx(\'' + t.ID + '\')">' + icon('trash') + 'Hapus</button>');
    }
  }
  if (can('SEKDES') && t.Status === 'DRAFT') {
    f.push('<button class="btn dng" onclick="A.tolakTx(\'' + t.ID + '\')">Tolak</button>');
    f.push('<button class="btn pri" onclick="A.verifTx(\'' + t.ID + '\')">' + icon('check') + 'Verifikasi</button>');
  }
  if (can('BENDAHARA') && t.Jenis === 'KELUAR' && !t.KoreksiDari && !t.DikoreksiID && t.Siskeudes) f.push(t.Siskeudes === 'SUDAH' ? '<button class="btn" onclick="A.setSis([\'' + t.ID + '\'],[],\'BELUM\')">Tandai belum cair Siskeudes</button>' : '<button class="btn" onclick="A.tandaSis(\'' + t.ID + '\')">Tandai sudah cair Siskeudes</button>');
  if (can('BENDAHARA') && t.Status === 'VERIFIED' && !t.KoreksiDari && !t.DikoreksiID) f.push('<button class="btn" onclick="A.koreksiTx(\'' + t.ID + '\')">Buat koreksi</button>');
  Modal.open({ title: jenisLabel(t), body: body, footer: f.join(''), wide: false });
};
A.ubahTx = id => { const t = S.I.tx[id]; Modal.closeAll(); if (t.Jenis === 'TARIK') A.formTarik(id); else A.formTx(t.Jenis, id); };
A.hapusTx = id => {
  const t = S.I.tx[id];
  konfirmasi('Hapus transaksi ' + t.NoBukti + (t.GrupID ? ' beserta uang yang diserahkan dan catatan pajaknya' : '') + '? Tindakan ini tidak dapat dibatalkan.', 'Hapus', async () => {
    const res = await api('hapusTransaksi', { id: id });
    applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
  }, true);
};
A.verifTx = id => withBusyId(async () => { const res = await api('verifikasi', { ids: [id] }); applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender(); });
A.tolakTx = id => mintaCatatan('Tolak transaksi', 'Alasan penolakan (wajib)', true, 'Tolak', async v => {
  const res = await api('tolak', { id: id, catatan: v });
  applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});
A.koreksiTx = id => {
  const t = S.I.tx[id];
  mintaCatatan('Jurnal koreksi', 'Alasan koreksi untuk ' + t.NoBukti + ' (wajib). Dibuat transaksi pembalik berstatus Draft; setelah itu catat ulang transaksi yang benar.', true, 'Buat koreksi', async v => {
    const res = await api('koreksi', { id: id, alasan: v });
    applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
  });
};
async function withBusyId(fn) { try { await fn(); } catch (e) { toast(e.message, 'err'); } }

// ── Lampiran / bukti (pratinjau di modal, bukan tab baru) ──
A.lihatBukti = async id => {
  toast('Memuat lampiran…');
  try {
    const res = await api('getBukti', { id: id });
    const d = res.data, bin = atob(d.data), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: d.mime }));
    const isi = d.mime.indexOf('image/') === 0 ? '<img src="' + url + '" alt="Lampiran" style="max-width:100%;border-radius:10px;display:block;margin:0 auto">'
      : '<iframe src="' + url + '" style="width:100%;height:60vh;border:0;border-radius:10px" title="Lampiran PDF"></iframe><p class="hint center">Jika PDF tidak tampil di HP, gunakan tombol Unduh.</p>';
    const ov = Modal.open({ title: d.nama, wide: true, body: isi, footer: '<button class="btn" data-no>Tutup</button><a class="btn pri" download="' + esc(d.nama) + '" href="' + url + '">' + icon('download') + 'Unduh</a>' });
    $('[data-no]', ov).onclick = () => { Modal.close(); setTimeout(() => URL.revokeObjectURL(url), 500); };
  } catch (e) { toast(e.message, 'err'); }
};
async function bacaBukti(input) {
  const f = input && input.files && input.files[0];
  if (!f) return null;
  if (f.type.indexOf('image/') === 0) return await kompresGambar(f);
  if (f.type === 'application/pdf') {
    if (f.size > 3 * 1024 * 1024) throw new Error('PDF maksimal 3 MB.');
    return { name: f.name, mime: f.type, data: await bacaBase64(f) };
  }
  throw new Error('Lampiran harus berupa gambar atau PDF.');
}
function bacaBase64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Gagal membaca file.')); r.readAsDataURL(f); }); }
function kompresGambar(f) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const M = 1400; let w = img.width, h = img.height; const k = Math.min(1, M / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const data = c.toDataURL('image/jpeg', 0.75).split(',')[1];
      URL.revokeObjectURL(url);
      res({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gambar tidak dapat dibaca.')); };
    img.src = url;
  });
}
function lampiranField(t) {
  return '<div class="field"><label for="fFile">Lampiran bukti (foto/PDF, opsional)</label><input class="inp" id="fFile" type="file" accept="image/*,application/pdf" style="padding:9px">'
    + (t && t.BuktiID ? '<label class="row small mt"><input type="checkbox" class="chk" id="fHapusBukti"> Hapus lampiran saat ini (' + esc(t.BuktiNama) + ')</label>' : '') + '<div class="hint">Foto dikecilkan otomatis agar cepat terunggah.</div></div>';
}

// ── Input angka rupiah ──
A.fmtMoney = el => { const d = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); el.value = d ? fmtNum(+d) : ''; };
const moneyVal = el => Number(String(el && el.value || '').replace(/\D/g, '')) || 0;
const moneyInput = (id, val, extra) => '<input class="inp money" id="' + id + '" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (val ? fmtNum(val) : '') + '" oninput="A.fmtMoney(this);' + (extra || '') + '">';
A.seg = btn => { $$('button', btn.parentNode).forEach(b => b.classList.remove('on')); btn.classList.add('on'); };
const segVal = id => { const b = $('#' + id + ' button.on'); return b ? b.dataset.v : ''; };
const opt = (arr, val, labelFn, kosong) => (kosong ? '<option value="">' + kosong + '</option>' : '') + arr.map(x => '<option value="' + esc(x.ID) + '"' + (x.ID === val ? ' selected' : '') + '>' + esc(labelFn(x)) + '</option>').join('');

// ── Form: Penerimaan / Pengeluaran / Setor Tunai ──
A.formTx = (jenis, id) => {
  Modal.closeAll();
  const t = id ? S.I.tx[id] : null;
  const kats = S.B.kategori.filter(k => k.Jenis === jenis && (k.Aktif !== 'N' || (t && t.KategoriID === k.ID)));
  const sds = S.B.sumberDana.filter(k => k.Aktif !== 'N' || (t && t.SumberDanaID === k.ID));
  let b = '<div class="field"><label for="fTgl">Tanggal</label><input class="inp" type="date" id="fTgl" value="' + (t ? t.Tanggal : hariIni()) + '"></div>';
  if (jenis !== 'SETOR') b += '<div class="field"><label>Kas</label><div class="seg" id="fRek"><button type="button" data-v="BANK" class="' + (!t || t.RekeningID === 'BANK' ? 'on' : '') + '" onclick="A.seg(this)">' + icon('bank', 'sm') + ' Kas Bank</button><button type="button" data-v="TUNAI" class="' + (t && t.RekeningID === 'TUNAI' ? 'on' : '') + '" onclick="A.seg(this)">' + icon('wallet', 'sm') + ' Kas Tunai</button></div></div>';
  else b += '<div class="banner" style="background:var(--accent-soft)">' + icon('info') + '<div>Uang tunai bendahara disetorkan ke rekening bank. Saldo tunai berkurang, saldo bank bertambah.</div></div>';
  if (jenis !== 'SETOR') b += '<div class="field"><label for="fKat">Kategori</label><select class="inp" id="fKat">' + opt(kats, t && t.KategoriID, k => k.Nama, 'Pilih kategori…') + '</select></div>';
  if (jenis !== 'SETOR') b += '<div class="field"><label for="fSd">Sumber dana (opsional)</label><select class="inp" id="fSd">' + opt(sds, t && t.SumberDanaID, k => k.Nama, '— Tidak ada —') + '</select></div>';
  b += '<div class="field"><label for="fJml">Jumlah (Rp)</label>' + moneyInput('fJml', t && t.Jumlah) + '</div>';
  b += '<div class="field"><label for="fUr">Uraian</label><textarea class="inp" id="fUr" maxlength="300" placeholder="' + (jenis === 'TERIMA' ? 'Mis. Transfer Dana Desa tahap I' : jenis === 'SETOR' ? 'Mis. Setor sisa kas tunai ke bank' : 'Mis. Belanja ATK kantor desa') + '">' + esc(t ? t.Uraian : '') + '</textarea></div>';
  if (jenis === 'KELUAR') b += '<div class="field"><label for="fKeg">Kegiatan (opsional)</label><input class="inp" id="fKeg" maxlength="150" value="' + esc(t ? t.Kegiatan : '') + '"></div><div class="field"><label for="fKpd">Dibayarkan kepada (opsional)</label><input class="inp" id="fKpd" maxlength="100" value="' + esc(t ? t.DiserahkanKepada : '') + '"></div>';
  if (jenis === 'KELUAR') b += '<div class="field"><label for="fSis">Pencairan di Siskeudes</label><select class="inp" id="fSis"><option value="BELUM"' + (!t || t.Siskeudes !== 'SUDAH' ? ' selected' : '') + '>Belum dicairkan</option><option value="SUDAH"' + (t && t.Siskeudes === 'SUDAH' ? ' selected' : '') + '>Sudah dicairkan di Siskeudes</option></select></div>';
  b += lampiranField(t);
  Modal.open({ title: (t ? 'Ubah ' : 'Catat ') + JENIS[jenis], body: b, footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" id="btnSimpan" onclick="A.submitTx(\'' + jenis + '\',\'' + (id || '') + '\',this)">Simpan</button>' });
};
A.tutupModal = () => Modal.close();
A.submitTx = (jenis, id, btn) => withBusy(btn, async () => {
  const jml = moneyVal($('#fJml'));
  if (!$('#fTgl').value) throw new Error('Tanggal wajib diisi.');
  if (jenis !== 'SETOR' && !$('#fKat').value) throw new Error('Pilih kategori.');
  if (!jml) throw new Error('Isi jumlah.');
  if (!$('#fUr').value.trim()) throw new Error('Uraian wajib diisi.');
  const bukti = await bacaBukti($('#fFile'));
  const p = { id: id || '', jenis: jenis, siskeudes: jenis === 'KELUAR' ? $('#fSis').value : '', tanggal: $('#fTgl').value, rekeningId: jenis === 'SETOR' ? 'BANK' : segVal('fRek'), kategoriId: jenis === 'SETOR' ? '' : $('#fKat').value, sumberDanaId: jenis === 'SETOR' ? '' : $('#fSd').value, jumlah: jml, uraian: $('#fUr').value.trim(), kegiatan: $('#fKeg') ? $('#fKeg').value : '', diserahkanKepada: $('#fKpd') ? $('#fKpd').value : '', bukti: bukti, hapusBukti: !!($('#fHapusBukti') && $('#fHapusBukti').checked) };
  const res = await api('simpanTransaksi', p);
  applyDelta(res.data.delta); S.f.per = p.tanggal.slice(0, 7); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Form: Tarik Tunai (beberapa kegiatan/penerima, potongan pajak, sisa tetap di kas tunai) ──
function taxRowHtml(d) {
  d = d || {};
  return '<div class="taxrow"><div class="row"><select class="inp tx-jp" aria-label="Jenis pajak">' + opt(S.B.jenisPajak.filter(x => x.Aktif !== 'N' || x.ID === d.JenisPajakID), d.JenisPajakID, x => x.Nama, 'Jenis pajak…') + '</select>'
    + '<button type="button" class="iconbtn" aria-label="Hapus baris" onclick="this.closest(\'.taxrow\').remove();A.hitungTarik()">' + icon('trash') + '</button></div>'
    + '<input class="inp money tx-jml" inputmode="numeric" placeholder="Jumlah pajak (Rp)" autocomplete="off" value="' + (d.Jumlah ? fmtNum(d.Jumlah) : '') + '" oninput="A.fmtMoney(this);A.hitungTarik()">'
    + '<input class="inp tx-ur" placeholder="Keterangan (opsional)" maxlength="150" value="' + esc(d.Uraian || '') + '"></div>';
}
A.tambahPajakRow = () => { $('#taxRows').insertAdjacentHTML('beforeend', taxRowHtml()); A.hitungTarik(); };
function salurRowHtml(d) {
  d = d || {};
  const kats = S.B.kategori.filter(k => k.Jenis === 'KELUAR' && (k.Aktif !== 'N' || k.ID === d.KategoriID));
  const belum = d.serah === false;
  return '<div class="salurrow"><div class="row"><input class="inp grow sl-keg" placeholder="Nama kegiatan" maxlength="150" aria-label="Nama kegiatan" value="' + esc(d.Kegiatan || '') + '">'
    + '<button type="button" class="iconbtn" aria-label="Hapus kegiatan" onclick="this.closest(\'.salurrow\').remove();A.hitungTarik()">' + icon('trash') + '</button></div>'
    + '<input class="inp sl-kpd" placeholder="Pelaksana / penerima uang" maxlength="100" aria-label="Pelaksana atau penerima" value="' + esc(d.DiserahkanKepada || '') + '">'
    + '<div class="row"><input class="inp money grow sl-jml" inputmode="numeric" placeholder="Jumlah (Rp)" autocomplete="off" value="' + (d.Jumlah ? fmtNum(d.Jumlah) : '') + '" oninput="A.fmtMoney(this);A.hitungTarik()">'
    + '<select class="inp grow sl-kat" aria-label="Kategori">' + opt(kats, d.KategoriID, k => k.Nama, 'Kategori…') + '</select></div>'
    + '<select class="inp sl-sis" aria-label="Pencairan di Siskeudes"><option value="BELUM"' + (d.Siskeudes === 'SUDAH' ? '' : ' selected') + '>Siskeudes: belum dicairkan</option><option value="SUDAH"' + (d.Siskeudes === 'SUDAH' ? ' selected' : '') + '>Siskeudes: sudah dicairkan</option></select>'
    + '<select class="inp sl-st" aria-label="Status penyerahan" onchange="A.hitungTarik()"><option value="1"' + (belum ? '' : ' selected') + '>Sudah diserahkan ke pelaksana</option><option value="0"' + (belum ? ' selected' : '') + '>Belum diserahkan (tetap di kas tunai)</option></select></div>';
}
A.tambahSalurRow = () => { $('#salurRows').insertAdjacentHTML('beforeend', salurRowHtml()); A.hitungTarik(); };
A.hitungTarik = () => {
  const jml = moneyVal($('#fJml')); let pj = 0, sd = 0, bl = 0;
  $$('.tx-jml').forEach(e => { pj += moneyVal(e); });
  $$('.salurrow').forEach(r => { const v = moneyVal($('.sl-jml', r)); if ($('.sl-st', r).value === '0') bl += v; else sd += v; });
  const sisa = jml - pj - sd - bl, neg = sisa < 0;
  $('#tarikSum').innerHTML = '<div><span>Jumlah ditarik dari bank</span><b>' + rp(jml) + '</b></div>'
    + '<div><span>Sudah diserahkan ke pelaksana</span><b>' + rp(sd) + '</b></div>'
    + '<div><span>Belum diserahkan (tetap di kas tunai)</span><b>' + rp(bl) + '</b></div>'
    + '<div><span>Potongan pajak (titipan di kas tunai)</span><b>' + rp(pj) + '</b></div>'
    + '<div style="border-top:1px solid var(--border);padding-top:6px"><span><b>' + (neg ? 'Kelebihan (tidak boleh)' : 'Masuk kas tunai bendahara') + '</b></span><b style="color:' + (neg ? 'var(--danger)' : 'var(--accent)') + '">' + rp(neg ? -sisa : jml - sd) + '</b></div>';
};
A.formTarik = id => {
  Modal.closeAll();
  const t = id ? S.I.tx[id] : null;
  const pj = t ? S.B.pajak.filter(x => x.GrupID === t.GrupID && x.Status !== 'BATAL') : [];
  const anak = t ? S.B.transaksi.filter(x => x.GrupID === t.GrupID && x.Jenis === 'KELUAR' && x.RekeningID === 'TUNAI').map(x => Object.assign({ serah: true }, x)).concat(S.B.penyaluran.filter(x => x.GrupID === t.GrupID && x.Status === 'BELUM').map(x => Object.assign({ serah: false }, x))) : [];
  const sds = S.B.sumberDana.filter(k => k.Aktif !== 'N' || (t && t.SumberDanaID === k.ID));
  const b = '<div class="field"><label for="fTgl">Tanggal penarikan</label><input class="inp" type="date" id="fTgl" value="' + (t ? t.Tanggal : hariIni()) + '"></div>'
    + '<div class="field"><label for="fJml">Jumlah ditarik dari bank (Rp)</label>' + moneyInput('fJml', t && t.Jumlah, 'A.hitungTarik()') + '</div>'
    + '<div class="field"><label for="fKeg">Keperluan penarikan (opsional)</label><input class="inp" id="fKeg" maxlength="150" placeholder="Mis. ADD Tahap I" value="' + esc(t && !/^Beberapa kegiatan|^Persediaan kas/.test(t.Kegiatan) && anak.length !== 1 ? t.Kegiatan : '') + '"></div>'
    + '<div class="field"><label for="fSd">Sumber dana (opsional)</label><select class="inp" id="fSd">' + opt(sds, t && t.SumberDanaID, k => k.Nama, '— Tidak ada —') + '</select></div>'
    + '<div class="lbl">Diserahkan ke kegiatan (boleh lebih dari satu)</div><div id="salurRows">' + anak.map(salurRowHtml).join('') + (t ? '' : salurRowHtml()) + '</div>'
    + '<button type="button" class="btn sm mb" onclick="A.tambahSalurRow()">' + icon('plus', 'sm') + 'Tambah kegiatan</button>'
    + '<div class="lbl">Potongan pajak (opsional)</div><div id="taxRows">' + pj.map(taxRowHtml).join('') + '</div>'
    + '<button type="button" class="btn sm mb" onclick="A.tambahPajakRow()">' + icon('plus', 'sm') + 'Tambah potongan pajak</button>'
    + '<div class="sum mb" id="tarikSum"></div>'
    + '<div class="hint mb">Setiap kegiatan dipilih “Sudah diserahkan” (kas tunai langsung berkurang) atau “Belum diserahkan” (uangnya tetap di kas tunai bendahara sampai diserahkan lewat Beranda). Uang tanpa peruntukan juga tetap di kas tunai. Pajak juga tetap di kas tunai sebagai “titipan pajak / pajak yang belum disetor” sampai dibayar.</div>'
    + lampiranField(t);
  Modal.open({ title: t ? 'Ubah Tarik Tunai' : 'Tarik Tunai', wide: true, body: b, footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitTarik(\'' + (id || '') + '\',this)">Simpan</button>' });
  A.hitungTarik();
};
A.submitTarik = (id, btn) => withBusy(btn, async () => {
  const jml = moneyVal($('#fJml'));
  if (!jml) throw new Error('Isi jumlah penarikan.');
  // Baris kegiatan yang sama sekali kosong diabaikan; baris setengah terisi harus dilengkapi.
  const penyaluran = [];
  for (const r of $$('.salurrow')) {
    const keg = $('.sl-keg', r).value.trim(), kpd = $('.sl-kpd', r).value.trim(), jm = moneyVal($('.sl-jml', r)), kt = $('.sl-kat', r).value;
    if (!keg && !kpd && !jm) continue;
    if (!keg) throw new Error('Isi nama kegiatan pada setiap baris.');
    if (!kpd) throw new Error('Isi nama penerima uang pada setiap baris kegiatan.');
    if (!jm) throw new Error('Isi jumlah pada setiap baris kegiatan.');
    if (!kt) throw new Error('Pilih kategori pada setiap baris kegiatan.');
    penyaluran.push({ kegiatan: keg, diserahkanKepada: kpd, jumlah: jm, kategoriId: kt, serah: $('.sl-st', r).value !== '0', siskeudes: $('.sl-sis', r).value });
  }
  const pajak = $$('.taxrow').map(r => ({ jenisPajakId: $('.tx-jp', r).value, jumlah: moneyVal($('.tx-jml', r)), uraian: $('.tx-ur', r).value }));
  for (const x of pajak) { if (!x.jenisPajakId) throw new Error('Pilih jenis pajak pada setiap baris potongan.'); if (!x.jumlah) throw new Error('Isi jumlah pada setiap baris potongan pajak.'); }
  const tp = pajak.reduce((a, x) => a + x.jumlah, 0), ts = penyaluran.reduce((a, x) => a + x.jumlah, 0);
  if (ts + tp > jml) throw new Error('Total kegiatan + pajak melebihi jumlah penarikan.');
  const bukti = await bacaBukti($('#fFile'));
  const p = { id: id || '', tanggal: $('#fTgl').value, jumlah: jml, keperluan: $('#fKeg').value.trim(), sumberDanaId: $('#fSd').value, penyaluran: penyaluran, pajak: pajak, bukti: bukti, hapusBukti: !!($('#fHapusBukti') && $('#fHapusBukti').checked) };
  const res = await api('simpanTarik', p);
  applyDelta(res.data.delta); S.f.per = p.tanggal.slice(0, 7); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Serahkan dana kegiatan yang tadinya "belum diserahkan" ──
A.formSerah = () => {
  const arr = S.B.penyaluran.filter(x => x.Status === 'BELUM').sort((a, b) => a.Tanggal < b.Tanggal ? -1 : 1);
  if (!arr.length) { toast('Tidak ada dana kegiatan yang belum diserahkan.', 'ok'); return; }
  const bend = can('BENDAHARA');
  const b = '<div class="list mb">' + arr.map(x => '<label class="item" style="min-height:0;cursor:' + (bend ? 'pointer' : 'default') + '">' + (bend ? '<input type="checkbox" class="chk sr-chk" value="' + x.ID + '" data-j="' + x.Jumlah + '" onchange="A.hitungSerah()">' : '')
    + '<span class="grow"><span class="t1">' + esc(x.Kegiatan) + '</span><span class="t2"><span>' + esc(x.DiserahkanKepada) + '</span><span>Ditarik ' + fmtTgl(x.Tanggal) + '</span>' + (diffHari(x.Tanggal, hariIni()) > 14 ? pill('bad', diffHari(x.Tanggal, hariIni()) + ' hari') : '') + '</span></span><span class="amt">' + fmtNum(x.Jumlah) + '</span></label>').join('') + '</div>'
    + (bend ? '<div class="field"><label for="srTgl">Tanggal penyerahan</label><input class="inp" type="date" id="srTgl" value="' + hariIni() + '"></div><div class="sum" id="srSum"></div>' : '<div class="hint">Hanya Bendahara yang dapat mencatat penyerahan.</div>');
  Modal.open({ title: 'Dana kegiatan belum diserahkan', body: b, footer: '<button class="btn" onclick="A.tutupModal()">Tutup</button>' + (bend ? '<button class="btn pri" onclick="A.submitSerah(this)">Serahkan</button>' : '') });
  if (bend) A.hitungSerah();
};
A.hitungSerah = () => { let n = 0, t = 0; $$('.sr-chk:checked').forEach(e => { n++; t += +e.dataset.j; }); const el = $('#srSum'); if (el) el.innerHTML = '<div><span>' + n + ' kegiatan dipilih</span><b>' + rp(t) + '</b></div><div><span>Kas tunai berkurang</span><b>' + rp(t) + '</b></div>'; };
A.submitSerah = btn => withBusy(btn, async () => {
  const ids = $$('.sr-chk:checked').map(e => e.value);
  if (!ids.length) throw new Error('Pilih kegiatan yang sudah diserahkan.');
  const res = await api('serahkanDana', { ids: ids, tanggal: $('#srTgl').value });
  applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Status pencairan di Siskeudes ──
A.formSis = () => {
  const c = S.calc, bend = can('BENDAHARA');
  const items = c.sisTx.map(x => ({ k: 'tx', id: x.ID, t: x.Kegiatan || x.Uraian, s: x.NoBukti + ' · ' + fmtTgl(x.Tanggal), j: x.Jumlah }))
    .concat(c.sisSl.map(x => ({ k: 'sl', id: x.ID, t: x.Kegiatan, s: x.DiserahkanKepada + ' · belum diserahkan', j: x.Jumlah })));
  if (!items.length) { toast('Semua sudah dicairkan di Siskeudes.', 'ok'); return; }
  const b = '<div class="list mb">' + items.map(x => '<label class="item" style="min-height:0">' + (bend ? '<input type="checkbox" class="chk ss-chk" data-k="' + x.k + '" value="' + x.id + '" data-j="' + x.j + '" onchange="A.hitungSis()">' : '')
    + '<span class="grow"><span class="t1">' + esc(x.t) + '</span><span class="t2"><span>' + esc(x.s) + '</span></span></span><span class="amt">' + fmtNum(x.j) + '</span></label>').join('') + '</div>'
    + (bend ? '<div class="field"><label for="ssTgl">Tanggal pencairan di Siskeudes</label><input class="inp" type="date" id="ssTgl" value="' + hariIni() + '"></div><div class="sum" id="ssSum"></div>' : '<div class="hint">Hanya Bendahara yang dapat menandai pencairan.</div>');
  Modal.open({ title: 'Belum dicairkan di Siskeudes', body: b, footer: '<button class="btn" onclick="A.tutupModal()">Tutup</button>' + (bend ? '<button class="btn pri" onclick="A.submitSis(this)">Tandai sudah dicairkan</button>' : '') });
  if (bend) A.hitungSis();
};
A.hitungSis = () => { let n = 0, t = 0; $$('.ss-chk:checked').forEach(e => { n++; t += +e.dataset.j; }); const el = $('#ssSum'); if (el) el.innerHTML = '<div><span>' + n + ' dipilih</span><b>' + rp(t) + '</b></div>'; };
A.submitSis = btn => withBusy(btn, async () => {
  const cs = $$('.ss-chk:checked');
  if (!cs.length) throw new Error('Pilih yang sudah dicairkan di Siskeudes.');
  const res = await api('setSiskeudes', { tx: cs.filter(e => e.dataset.k === 'tx').map(e => e.value), salur: cs.filter(e => e.dataset.k === 'sl').map(e => e.value), status: 'SUDAH', tanggal: $('#ssTgl').value });
  applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});
A.setSis = (tx, sl, status, tanggal) => { Modal.closeAll(); return withBusy(null, async () => {
  const res = await api('setSiskeudes', { tx: tx, salur: sl, status: status, tanggal: tanggal || '' });
  applyDelta(res.data.delta); toast(res.message, 'ok'); rerender();
}); };
A.tandaSis = id => {
  Modal.closeAll();
  const ov = Modal.open({ title: 'Sudah dicairkan di Siskeudes', body: '<div class="field"><label for="ssTgl1">Tanggal pencairan</label><input class="inp" type="date" id="ssTgl1" value="' + hariIni() + '"></div>', footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" data-ok>Simpan</button>' });
  $('[data-ok]', ov).onclick = function () { withBusy(this, async () => {
    const res = await api('setSiskeudes', { tx: [id], salur: [], status: 'SUDAH', tanggal: $('#ssTgl1').value });
    applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
  }); };
};

// ── Pajak ──
PAGES.pajak = function () {
  const all = S.B.pajak.filter(x => x.Status !== 'BATAL'), belum = all.filter(x => x.Status === 'BELUM'), sudah = all.filter(x => x.Status === 'SUDAH');
  const tab = S.pj.tab, arr = (tab === 'belum' ? belum : sudah).slice().sort((a, b) => tab === 'belum' ? (a.TanggalPotong < b.TanggalPotong ? -1 : 1) : (a.TanggalBayar < b.TanggalBayar ? 1 : -1));
  const total = belum.reduce((a, x) => a + x.Jumlah, 0);
  let h = '<div class="grid g2 mb">' + kpi('Belum disetor', 'percent', rp(total), belum.length + ' potongan', belum.length ? 'warn' : '') + kpi('Sudah dibayar', 'check', rp(sudah.reduce((a, x) => a + x.Jumlah, 0)), sudah.length + ' potongan') + '</div>';
  h += '<div class="tabs mb"><button class="chip ' + (tab === 'belum' ? 'on' : '') + '" onclick="A.pjTab(\'belum\')">Belum dibayar (' + belum.length + ')</button><button class="chip ' + (tab === 'sudah' ? 'on' : '') + '" onclick="A.pjTab(\'sudah\')">Sudah dibayar (' + sudah.length + ')</button></div>';
  if (!arr.length) h += '<div class="card empty">' + (tab === 'belum' ? 'Tidak ada pajak yang belum disetor.' : 'Belum ada pembayaran pajak.') + '</div>';
  else h += '<div class="list">' + arr.map(x => {
    const umur = x.Status === 'BELUM' ? diffHari(x.TanggalPotong, hariIni()) : 0;
    return '<div class="item">' + (tab === 'belum' && can('BENDAHARA') ? '<input type="checkbox" class="chk" aria-label="Pilih" ' + (S.pj.sel[x.ID] ? 'checked' : '') + ' onchange="A.pjSel(\'' + x.ID + '\',this.checked)">' : '')
      + '<span class="grow" ' + (x.GrupID ? 'style="cursor:pointer" onclick="A.detailTx(\'' + (x.Status === 'SUDAH' ? x.TransaksiBayarID : x.GrupID) + '\')"' : '') + '><span class="t1">' + esc((S.I.jp[x.JenisPajakID] || {}).Nama || 'Pajak') + ' — ' + esc(x.Uraian) + '</span>'
      + '<span class="t2"><span>Dipotong ' + fmtTgl(x.TanggalPotong) + '</span>' + (x.KodeBilling ? '<span>Billing ' + esc(x.KodeBilling) + '</span>' : pill('wr', 'Kode billing belum ada'))
      + (x.Status === 'SUDAH' ? pill('ok', 'Dibayar ' + fmtTgl(x.TanggalBayar)) + (x.NTPN ? '<span>NTPN ' + esc(x.NTPN) + '</span>' : '') : (umur > 14 ? pill('bad', umur + ' hari') : '')) + '</span></span><span class="amt">' + fmtNum(x.Jumlah) + '</span></div>';
  }).join('') + '</div>';
  h += '<div id="pjbar"></div>';
  V().innerHTML = h;
  pjBar();
};
function pjBar() {
  const ids = Object.keys(S.pj.sel).filter(k => S.pj.sel[k]), el = $('#pjbar');
  if (!el) return;
  if (!ids.length || !can('BENDAHARA')) { el.innerHTML = ''; return; }
  const tot = ids.reduce((a, id) => a + ((S.B.pajak.find(x => x.ID === id) || {}).Jumlah || 0), 0);
  el.innerHTML = '<div style="position:sticky;bottom:calc(var(--nav-h) + 12px + env(safe-area-inset-bottom));margin-top:12px" class="card"><div class="row between mb"><b>' + ids.length + ' dipilih</b><b>' + rp(tot) + '</b></div><div class="row"><button class="btn grow" onclick="A.formBilling()">Isi kode billing</button><button class="btn pri grow" onclick="A.formBayar()">Bayar pajak</button></div></div>';
}
A.pjTab = t => { S.pj.tab = t; S.pj.sel = {}; PAGES.pajak(); };
A.pjSel = (id, on) => { if (on) S.pj.sel[id] = 1; else delete S.pj.sel[id]; pjBar(); };
const pjIds = () => Object.keys(S.pj.sel).filter(k => S.pj.sel[k]);
A.formBilling = () => {
  const ids = pjIds(), kodeSama = [...new Set(ids.map(id => (S.B.pajak.find(x => x.ID === id) || {}).KodeBilling).filter(Boolean))];
  Modal.open({ title: 'Kode billing', body: '<p class="small muted" style="margin-top:0">Kode billing berlaku untuk ' + ids.length + ' potongan pajak yang dipilih.</p><div class="field"><label for="fBil">Kode billing</label><input class="inp" id="fBil" maxlength="30" autocomplete="off" inputmode="numeric" value="' + esc(kodeSama.length === 1 ? kodeSama[0] : '') + '"></div>',
    footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitBilling(this)">Simpan</button>' });
};
A.submitBilling = btn => withBusy(btn, async () => {
  const kode = $('#fBil').value.trim();
  if (kode.length < 5) throw new Error('Kode billing minimal 5 karakter.');
  const res = await api('simpanBilling', { ids: pjIds(), kodeBilling: kode });
  applyDelta(res.data.delta); S.pj.sel = {}; Modal.closeAll(); toast(res.message, 'ok'); rerender();
});
A.formBayar = () => {
  const ids = pjIds(), items = ids.map(id => S.B.pajak.find(x => x.ID === id)).filter(Boolean), tot = items.reduce((a, x) => a + x.Jumlah, 0);
  const kode = [...new Set(items.map(x => x.KodeBilling).filter(Boolean))];
  const sl = S.calc.now;
  const b = '<div class="sum mb"><div><span>Pajak yang dibayar</span><b>' + items.length + ' potongan</b></div><div><span>Total</span><b>' + rp(tot) + '</b></div></div>'
    + '<div class="field"><label for="fBil">Kode billing</label><input class="inp" id="fBil" maxlength="30" autocomplete="off" inputmode="numeric" value="' + esc(kode.length === 1 ? kode[0] : '') + '"></div>'
    + '<div class="field"><label for="fTgl">Tanggal pembayaran</label><input class="inp" type="date" id="fTgl" value="' + hariIni() + '"></div>'
    + '<div class="field"><label>Dibayar dari</label><div class="seg" id="fRek"><button type="button" class="on" data-v="TUNAI" onclick="A.seg(this)">Kas Tunai · ' + fmtNum(sl.TUNAI) + '</button><button type="button" data-v="BANK" onclick="A.seg(this)">Kas Bank · ' + fmtNum(sl.BANK) + '</button></div></div>'
    + '<div class="field"><label for="fNtpn">NTPN (opsional)</label><input class="inp" id="fNtpn" maxlength="30" autocomplete="off"></div>' + lampiranField(null);
  Modal.open({ title: 'Bayar pajak', body: b, footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitBayar(this)">Catat pembayaran</button>' });
};
A.submitBayar = btn => withBusy(btn, async () => {
  if ($('#fBil').value.trim().length < 5) throw new Error('Isi kode billing.');
  const bukti = await bacaBukti($('#fFile'));
  const res = await api('bayarPajak', { ids: pjIds(), kodeBilling: $('#fBil').value.trim(), tanggalBayar: $('#fTgl').value, rekeningId: segVal('fRek'), ntpn: $('#fNtpn').value.trim(), bukti: bukti });
  applyDelta(res.data.delta); S.pj.sel = {}; S.pj.tab = 'belum'; Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Laporan ──
const LAP = [['BKU', 'Buku Kas Umum'], ['TUNAI', 'Buku Kas Tunai'], ['BANK', 'Buku Bank'], ['PAJAK', 'Rekap Pajak'], ['KATEGORI', 'Rekap Kategori & Sumber Dana']];
PAGES.laporan = function () {
  const L = S.lap;
  V().innerHTML = '<div class="toolbar t2"><select class="inp" aria-label="Jenis laporan" onchange="A.lapType(this.value)">' + LAP.map(x => '<option value="' + x[0] + '"' + (L.type === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' + perSelect('A.lapPer', L.per) + '</div>'
    + '<div class="row wrap mb"><button class="btn sm" onclick="A.unduh(\'pdf\',this)">' + icon('download', 'sm') + 'PDF</button><button class="btn sm" onclick="A.unduh(\'xlsx\',this)">' + icon('download', 'sm') + 'Excel</button><button class="btn sm" onclick="A.cetak()">' + icon('print', 'sm') + 'Cetak</button></div><div id="lapOut">' + skeleton(3) + '</div>';
  muatLaporan();
};
A.lapType = v => { S.lap.type = v; muatLaporan(); };
A.lapPer = v => { S.lap.per = v; S.per = v; muatLaporan(); };
async function muatLaporan() {
  const el = $('#lapOut');
  if (el) el.innerHTML = skeleton(3);
  const key = S.lap.type + S.lap.per;
  try {
    const res = await api('getLaporan', { type: S.lap.type, periode: S.lap.per });
    if (S.page !== 'laporan' || key !== S.lap.type + S.lap.per) return;
    S.lap.data = res.data;
    $('#lapOut').innerHTML = '<div class="center mb"><div class="bold">' + esc(res.data.judul) + '</div><div class="small muted">' + esc(res.data.subjudul) + '</div></div>' + lapTabel(res.data);
  } catch (e) { if ($('#lapOut')) $('#lapOut').innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; }
}
function lapTabel(d) {
  return '<div class="tablewrap" id="lapTable"><table class="tbl"><thead><tr>' + d.kolom.map(k => '<th class="' + (k.t === 'angka' ? 'n' : '') + '">' + esc(k.l) + '</th>').join('') + '</tr></thead><tbody>'
    + d.baris.map(r => '<tr class="' + (r.b ? 'b' : '') + '">' + r.c.map((v, i) => '<td class="' + (d.kolom[i].t === 'angka' ? 'n' : (d.kolom[i].l === 'Uraian' ? 'u' : '')) + '">' + (d.kolom[i].t === 'angka' ? (v === null || v === '' ? '' : fmtNum(v)) : esc(v)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
A.unduh = (fmt, btn) => withBusy(btn, async () => {
  const res = await api('exportLaporan', { type: S.lap.type, periode: S.lap.per, format: fmt });
  const d = res.data, bin = atob(d.data), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: d.mime }));
  const a = document.createElement('a'); a.href = url; a.download = d.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('File ' + d.name + ' diunduh.', 'ok');
});
A.cetak = () => {
  const d = S.lap.data;
  if (!d) { toast('Tampilkan laporan terlebih dahulu.', 'err'); return; }
  const c = S.B.config;
  $('#printarea').innerHTML = '<div style="text-align:center;margin-bottom:10px"><div style="font-weight:700;font-size:16px">' + esc(c.namaDesa) + '</div><div style="font-size:12px">Kecamatan ' + esc(c.kecamatan) + ' — Kabupaten ' + esc(c.kabupaten) + '</div><hr><div style="font-weight:700">' + esc(d.judul) + '</div><div style="font-size:12px">' + esc(d.subjudul) + '</div></div>' + lapTabel(d)
    + '<table style="width:100%;margin-top:24px;font-size:12px;text-align:center"><tr><td>Mengetahui,<br>Kepala Desa<br><br><br><br><b><u>' + esc(c.namaKades) + '</u></b></td><td>Diperiksa,<br>Sekretaris Desa<br><br><br><br><b><u>' + esc(c.namaSekdes) + '</u></b></td><td>Dibuat oleh,<br>Bendahara<br><br><br><br><b><u>' + esc(c.namaBendahara) + '</u></b></td></tr></table>';
  setTimeout(() => window.print(), 50);
};

// ── Tutup Bulan, Rekonsiliasi, Kas Opname ──
const PECAHAN = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
PAGES.tutup = function () {
  const p = S.per, m = S.calc.bulan[p] || { n: 0, draft: 0, tolak: 0 }, pr = S.I.per[p], st = pr ? pr.Status : 'BUKA';
  const idx = ['BUKA', 'DIAJUKAN', 'DIPERIKSA', 'DITUTUP'].indexOf(st), nm = ['Terbuka', 'Diajukan', 'Diperiksa', 'Ditutup'];
  const pend = S.B.pajak.filter(x => x.Status === 'BELUM' && x.TanggalPotong <= p + '-31');
  const rk = S.B.rekonsiliasi.find(x => x.Periode === p), ops = S.B.opname.filter(x => x.Tanggal.slice(0, 7) === p);
  const akhir = saldoSampai(t => t.Periode <= p);
  const chk = (ok, judul, ket, warn) => '<div class="check ' + (ok ? 'ok' : (warn ? 'wr' : '')) + '">' + icon(ok ? 'check' : 'alert') + '<div><div class="bold">' + judul + '</div><div class="small muted">' + ket + '</div></div></div>';
  let h = '<div class="mb">' + perSelect('A.setPer', p) + '</div><div class="card"><div class="steps">' + nm.map((n, i) => '<div class="st ' + (i < idx || st === 'DITUTUP' ? 'done' : (i === idx ? 'cur' : '')) + '"><i></i>' + n + '</div>').join('') + '</div>'
    + '<div class="row between"><div><div class="bold">' + labelPer(p) + '</div><div class="small muted">' + m.n + ' transaksi</div></div>' + pill(STATUS_PER[st][0], STATUS_PER[st][1]) + '</div>'
    + (pr && pr.Catatan ? '<div class="banner mt">' + icon('info') + '<div>' + esc(pr.Catatan) + '</div></div>' : '') + '</div>';
  h += '<div class="card"><h3>Daftar periksa</h3>'
    + chk(m.draft + m.tolak === 0, 'Semua transaksi terverifikasi', m.draft + m.tolak === 0 ? 'Tidak ada transaksi Draft/Ditolak.' : m.draft + ' Draft dan ' + m.tolak + ' Ditolak harus diselesaikan (wajib).')
    + chk(pend.length === 0, 'Pajak sudah disetor', pend.length === 0 ? 'Tidak ada titipan pajak tertunggak.' : pend.length + ' potongan senilai ' + rp(pend.reduce((a, x) => a + x.Jumlah, 0)) + ' belum disetor.', true)
    + chk(!!rk, 'Rekonsiliasi bank', rk ? 'Saldo koran ' + rp(rk.SaldoKoran) + ' · selisih ' + rp(rk.Selisih) : 'Belum dilakukan.', true)
    + chk(ops.length > 0, 'Kas opname', ops.length ? 'Terakhir ' + fmtTgl(ops[ops.length - 1].Tanggal) + ' · selisih ' + rp(ops[ops.length - 1].Selisih) : 'Belum dilakukan bulan ini.', true) + '</div>';
  h += '<div class="card"><h3>Saldo akhir ' + labelPer(p) + '</h3><div class="sum"><div><span>Kas Tunai</span><b>' + rp(akhir.TUNAI) + '</b></div><div><span>Kas Bank</span><b>' + rp(akhir.BANK) + '</b></div><div style="border-top:1px solid var(--border);padding-top:6px"><span><b>Total</b></span><b>' + rp(akhir.TUNAI + akhir.BANK) + '</b></div></div></div>';
  const btn = [];
  if (can('BENDAHARA') && st === 'BUKA') btn.push('<button class="btn pri grow" onclick="A.aksiPer(\'ajukan\')">Ajukan penutupan</button>');
  if (can('SEKDES') && st === 'DIAJUKAN') btn.push('<button class="btn pri grow" onclick="A.aksiPer(\'periksa\')">Tandai sudah diperiksa</button>');
  if (can('KADES') && st === 'DIPERIKSA') btn.push('<button class="btn pri grow" onclick="A.aksiPer(\'setujui\')">Setujui & tutup bulan</button>');
  if ((can('SEKDES') || can('KADES')) && (st === 'DIAJUKAN' || st === 'DIPERIKSA')) btn.push('<button class="btn grow" onclick="A.aksiPer(\'kembalikan\')">Kembalikan</button>');
  if (isSU() && st === 'DITUTUP') btn.push('<button class="btn dng grow" onclick="A.aksiPer(\'bukaKunci\')">Buka kunci</button>');
  if (btn.length) h += '<div class="row wrap mt">' + btn.join('') + '</div>';
  h += '<div class="sectionhead"><h2>Rekonsiliasi & kas opname</h2></div><div class="grid g2">'
    + '<button class="card" style="text-align:left" onclick="A.formRekon()"><div class="bold">' + icon('bank', 'sm') + ' Rekonsiliasi bank</div><div class="small muted mt">' + (rk ? 'Selisih ' + rp(rk.Selisih) : 'Cocokkan saldo buku dengan rekening koran') + '</div></button>'
    + '<button class="card" style="text-align:left;margin-top:0" onclick="A.formOpname()"><div class="bold">' + icon('wallet', 'sm') + ' Kas opname</div><div class="small muted mt">Hitung uang tunai fisik per pecahan</div></button></div>';
  const riw = S.B.opname.slice().sort((a, b) => a.Tanggal < b.Tanggal ? 1 : -1).slice(0, 5);
  if (riw.length) h += '<div class="sectionhead"><h2>Riwayat kas opname</h2></div><div class="list">' + riw.map(o => '<div class="item" style="min-height:0"><span class="grow"><span class="t1">' + fmtTgl(o.Tanggal) + ' · ' + esc(o.Petugas) + '</span><span class="t2">Fisik ' + rp(o.TotalFisik) + ' · Buku ' + rp(o.SaldoBuku) + '</span></span>' + pill(o.Selisih === 0 ? 'ok' : 'bad', o.Selisih === 0 ? 'Sesuai' : 'Selisih ' + rp(o.Selisih)) + '</div>').join('') + '</div>';
  V().innerHTML = h;
};
A.aksiPer = aksi => {
  const p = S.per, kirim = async cat => {
    const res = await api('aksiPeriode', { periode: p, aksi: aksi, catatan: cat || '' });
    applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
  };
  if (aksi === 'kembalikan') mintaCatatan('Kembalikan ke bendahara', 'Catatan pengembalian (wajib)', true, 'Kembalikan', kirim);
  else if (aksi === 'bukaKunci') mintaCatatan('Buka kunci periode', 'Alasan membuka kunci (wajib)', true, 'Buka kunci', kirim);
  else if (aksi === 'setujui') konfirmasi('Setujui dan tutup ' + labelPer(p) + '? Seluruh transaksi bulan ini akan terkunci.', 'Setujui & tutup', () => kirim(''));
  else konfirmasi((aksi === 'ajukan' ? 'Ajukan penutupan ' : 'Tandai sudah diperiksa untuk ') + labelPer(p) + '?', 'Ya, lanjutkan', () => kirim(''));
};
A.formRekon = () => {
  const p = S.per, buku = saldoSampai(t => t.Periode <= p).BANK, rk = S.B.rekonsiliasi.find(x => x.Periode === p);
  Modal.open({
    title: 'Rekonsiliasi bank ' + labelPer(p), body: '<div class="sum mb"><div><span>Saldo buku (Kas Bank)</span><b>' + rp(buku) + '</b></div></div>'
      + '<div class="field"><label for="fKor">Saldo menurut rekening koran (Rp)</label>' + moneyInput('fKor', rk && rk.SaldoKoran, 'A.hitungRekon(' + buku + ')') + '</div><div class="sum mb" id="rekSum"></div>'
      + '<div class="field"><label for="fCat">Catatan (mis. transaksi belum tercatat di bank)</label><textarea class="inp" id="fCat" maxlength="300">' + esc(rk ? rk.Catatan : '') + '</textarea></div>',
    footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitRekon(this)">Simpan</button>'
  });
  A.hitungRekon(buku);
};
A.hitungRekon = buku => { const k = moneyVal($('#fKor')), s = k - buku; $('#rekSum').innerHTML = '<div><span>Selisih (koran − buku)</span><b style="color:' + (s === 0 ? 'var(--accent)' : 'var(--danger)') + '">' + rp(s) + '</b></div>'; };
A.submitRekon = btn => withBusy(btn, async () => {
  if (!$('#fKor').value.trim()) throw new Error('Isi saldo rekening koran.');
  const res = await api('simpanRekon', { periode: S.per, saldoKoran: moneyVal($('#fKor')), catatan: $('#fCat').value });
  applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});
A.formOpname = () => {
  const b = '<div class="field"><label for="fTgl">Tanggal</label><input class="inp" type="date" id="fTgl" value="' + hariIni() + '" onchange="A.hitungOpname()"></div>'
    + '<div class="lbl">Jumlah lembar/keping per pecahan</div><div class="grid g2 mb">' + PECAHAN.map(d => '<div class="row"><span class="small muted" style="width:70px">' + fmtNum(d) + '</span><input class="inp op-n" data-d="' + d + '" type="number" inputmode="numeric" min="0" placeholder="0" oninput="A.hitungOpname()"></div>').join('') + '</div>'
    + '<div class="sum mb" id="opSum"></div><div class="field"><label for="fPet">Petugas</label><input class="inp" id="fPet" maxlength="100" value="' + esc(S.user.nama) + '"></div>'
    + '<div class="field"><label for="fCat">Catatan</label><textarea class="inp" id="fCat" maxlength="300"></textarea></div>';
  Modal.open({ title: 'Kas opname', body: b, footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitOpname(this)">Simpan berita acara</button>' });
  A.hitungOpname();
};
A.hitungOpname = () => {
  let tot = 0;
  $$('.op-n').forEach(e => { tot += (Number(e.value) || 0) * Number(e.dataset.d); });
  const tgl = $('#fTgl').value || hariIni(), buku = saldoSampai(t => t.Tanggal <= tgl).TUNAI, s = tot - buku;
  $('#opSum').innerHTML = '<div><span>Uang fisik</span><b>' + rp(tot) + '</b></div><div><span>Saldo buku tunai</span><b>' + rp(buku) + '</b></div><div style="border-top:1px solid var(--border);padding-top:6px"><span><b>Selisih</b></span><b style="color:' + (s === 0 ? 'var(--accent)' : 'var(--danger)') + '">' + rp(s) + '</b></div>';
};
A.submitOpname = btn => withBusy(btn, async () => {
  const pec = {};
  $$('.op-n').forEach(e => { const n = Number(e.value) || 0; if (n > 0) pec[e.dataset.d] = n; });
  const res = await api('simpanOpname', { tanggal: $('#fTgl').value, pecahan: pec, petugas: $('#fPet').value, catatan: $('#fCat').value });
  applyDelta(res.data.delta); Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Menu ──
PAGES.menu = function () {
  const it = (id, ic, t, s) => '<button class="menuitem" onclick="A.go(\'' + id + '\')"><span class="ico">' + icon(ic) + '</span><span class="grow">' + t + '<small>' + s + '</small></span>' + icon('more', 'sm') + '</button>';
  let h = '<div class="card row"><span class="ico brand-mark" style="width:46px;height:46px">' + icon('users') + '</span><div><div class="bold">' + esc(S.user.nama) + '</div><div class="small muted">' + esc(S.user.username) + ' · ' + esc(ROLE[S.user.role]) + '</div></div></div>';
  h += '<div class="list mt">' + it('tutup', 'lock', 'Tutup Bulan', 'Rekonsiliasi, kas opname, persetujuan periode');
  if (isSU()) h += it('master', 'book', 'Master Data', 'Kategori, sumber dana, jenis pajak') + it('pengguna', 'users', 'Pengguna', 'Akun dan peran') + it('pengaturan', 'sliders', 'Pengaturan', 'Identitas desa, saldo awal') + it('audit', 'shield', 'Audit Log', 'Riwayat perubahan data');
  h += '</div><div class="list mt"><button class="menuitem" onclick="A.formPassword()"><span class="ico">' + icon('shield') + '</span><span class="grow">Ganti password</span></button>'
    + '<button class="menuitem" onclick="A.toggleTema()"><span class="ico">' + icon('moon') + '</span><span class="grow">Tema terang / gelap</span></button>'
    + '<button class="menuitem" onclick="A.keluar()"><span class="ico">' + icon('logout') + '</span><span class="grow">Keluar</span></button></div>'
    + '<p class="xs muted center mt2">' + esc(S.B.config.appName || 'SIKADES') + ' v1.0</p>';
  V().innerHTML = h;
};
A.formPassword = () => {
  Modal.closeAll();
  Modal.open({
    title: 'Ganti password', body: '<div class="field"><label for="pLama">Password lama</label><input class="inp" type="password" id="pLama" autocomplete="current-password"></div><div class="field"><label for="pBaru">Password baru (min. 6 karakter)</label><input class="inp" type="password" id="pBaru" autocomplete="new-password"></div><div class="field"><label for="pUlang">Ulangi password baru</label><input class="inp" type="password" id="pUlang" autocomplete="new-password"></div>',
    footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitPassword(this)">Simpan</button>'
  });
};
A.submitPassword = btn => withBusy(btn, async () => {
  if ($('#pBaru').value !== $('#pUlang').value) throw new Error('Ulangi password baru dengan benar.');
  const res = await api('ubahPassword', { lama: $('#pLama').value, baru: $('#pBaru').value });
  S.user.pwBawaan = false; Modal.closeAll(); toast(res.message, 'ok'); rerender();
});

// ── Pengguna (Superuser) ──
PAGES.pengguna = async function () {
  V().innerHTML = '<div class="row between mb"><h2 style="font-size:15px">Daftar pengguna</h2><button class="btn pri sm" onclick="A.formUser()">' + icon('plus', 'sm') + 'Tambah</button></div><div id="uList">' + skeleton(3) + '</div>';
  try {
    await swr('daftarUser', 'daftarUser', d => { S.users = d; if (S.page === 'pengguna' && $('#uList')) renderUsers(); });
  } catch (e) { if ($('#uList')) $('#uList').innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; }
};
function renderUsers() {
  $('#uList').innerHTML = '<div class="list">' + S.users.map(u => '<button class="item" onclick="A.formUser(\'' + u.ID + '\')"><span class="ico">' + icon('users') + '</span><span class="grow"><span class="t1">' + esc(u.Nama) + '</span><span class="t2"><span>' + esc(u.Username) + '</span>' + pill('', ROLE[u.Role]) + (u.Status !== 'Aktif' ? pill('bad', 'Nonaktif') : '') + '</span></span>' + icon('edit', 'sm') + '</button>').join('') + '</div>';
}
A.formUser = id => {
  const u = id ? S.users.find(x => x.ID === id) : null;
  Modal.open({
    title: u ? 'Ubah pengguna' : 'Tambah pengguna', body: '<div class="field"><label for="uNama">Nama lengkap</label><input class="inp" id="uNama" maxlength="80" value="' + esc(u ? u.Nama : '') + '"></div>'
      + '<div class="field"><label for="uUser">Username</label><input class="inp" id="uUser" maxlength="30" autocapitalize="none" value="' + esc(u ? u.Username : '') + '"></div>'
      + '<div class="field"><label for="uRole">Peran</label><select class="inp" id="uRole">' + Object.keys(ROLE).map(r => '<option value="' + r + '"' + (u && u.Role === r ? ' selected' : '') + '>' + ROLE[r] + '</option>').join('') + '</select></div>'
      + '<div class="field"><label for="uStat">Status</label><select class="inp" id="uStat"><option value="Aktif"' + (!u || u.Status === 'Aktif' ? ' selected' : '') + '>Aktif</option><option value="Nonaktif"' + (u && u.Status === 'Nonaktif' ? ' selected' : '') + '>Nonaktif</option></select></div>'
      + '<div class="field"><label for="uPass">' + (u ? 'Password baru (kosongkan jika tidak diubah)' : 'Password awal (min. 6 karakter)') + '</label><input class="inp" id="uPass" type="text" autocomplete="off" maxlength="60"></div>',
    footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitUser(\'' + (id || '') + '\',this)">Simpan</button>'
  });
};
A.submitUser = (id, btn) => withBusy(btn, async () => {
  const res = await api('simpanUser', { id: id, nama: $('#uNama').value, username: $('#uUser').value, role: $('#uRole').value, status: $('#uStat').value, password: $('#uPass').value });
  const u = res.data.user, i = S.users.findIndex(x => x.ID === u.ID);
  if (i >= 0) S.users[i] = u; else S.users.push(u);
  Modal.closeAll(); toast(res.message, 'ok'); renderUsers();
});

// ── Master Data (Superuser) ──
const MASTER = { kategori: ['Kategori', 'Kategori'], sumberDana: ['SumberDana', 'Sumber Dana'], jenisPajak: ['JenisPajak', 'Jenis Pajak'] };
PAGES.master = function () {
  const t = S.masterTab, rows = S.B[t].slice().sort((a, b) => (a.Jenis || '') < (b.Jenis || '') ? -1 : (a.Jenis || '') > (b.Jenis || '') ? 1 : a.Kode < b.Kode ? -1 : 1);
  let h = '<div class="tabs mb">' + Object.keys(MASTER).map(k => '<button class="chip ' + (t === k ? 'on' : '') + '" onclick="A.mTab(\'' + k + '\')">' + MASTER[k][1] + '</button>').join('') + '</div>'
    + '<div class="row between mb"><span class="small muted">' + rows.length + ' data</span><button class="btn pri sm" onclick="A.formMaster()">' + icon('plus', 'sm') + 'Tambah</button></div>';
  h += rows.length ? '<div class="list">' + rows.map(r => '<div class="item" style="min-height:56px"><button class="grow" style="all:unset;cursor:pointer;flex:1;min-width:0" onclick="A.formMaster(\'' + r.ID + '\')"><span class="t1">' + esc(r.Nama) + '</span><span class="t2"><span>' + esc(r.Kode) + '</span>' + (r.Jenis ? pill('', r.Jenis === 'TERIMA' ? 'Penerimaan' : 'Pengeluaran') : '') + (r.Aktif === 'N' ? pill('bad', 'Nonaktif') : '') + '</span></button><button class="iconbtn" aria-label="Hapus" onclick="A.hapusMaster(\'' + r.ID + '\')">' + icon('trash') + '</button></div>').join('') + '</div>' : '<div class="card empty">Belum ada data.</div>';
  V().innerHTML = h;
};
A.mTab = t => { S.masterTab = t; PAGES.master(); };
A.formMaster = id => {
  const t = S.masterTab, r = id ? S.B[t].find(x => x.ID === id) : null;
  Modal.open({
    title: (r ? 'Ubah ' : 'Tambah ') + MASTER[t][1], body: '<div class="field"><label for="mKode">Kode</label><input class="inp" id="mKode" maxlength="20" value="' + esc(r ? r.Kode : '') + '"></div>'
      + '<div class="field"><label for="mNama">Nama</label><input class="inp" id="mNama" maxlength="100" value="' + esc(r ? r.Nama : '') + '"></div>'
      + (t === 'kategori' ? '<div class="field"><label for="mJenis">Jenis</label><select class="inp" id="mJenis"><option value="TERIMA"' + (r && r.Jenis === 'TERIMA' ? ' selected' : '') + '>Penerimaan</option><option value="KELUAR"' + (!r || r.Jenis === 'KELUAR' ? ' selected' : '') + '>Pengeluaran</option></select></div>' : '')
      + '<div class="field"><label for="mAktif">Status</label><select class="inp" id="mAktif"><option value="Y"' + (!r || r.Aktif !== 'N' ? ' selected' : '') + '>Aktif</option><option value="N"' + (r && r.Aktif === 'N' ? ' selected' : '') + '>Nonaktif (disembunyikan dari pilihan)</option></select></div>',
    footer: '<button class="btn" onclick="A.tutupModal()">Batal</button><button class="btn pri" onclick="A.submitMaster(\'' + (id || '') + '\',this)">Simpan</button>'
  });
};
A.submitMaster = (id, btn) => withBusy(btn, async () => {
  const t = S.masterTab;
  const res = await api('simpanMaster', { sheet: MASTER[t][0], record: { id: id, kode: $('#mKode').value, nama: $('#mNama').value, jenis: $('#mJenis') ? $('#mJenis').value : '', aktif: $('#mAktif').value } });
  S.B[res.data.key] = res.data.rows; reindex(); Modal.closeAll(); toast(res.message, 'ok'); PAGES.master();
});
A.hapusMaster = id => konfirmasi('Hapus data ini? Data yang sudah dipakai transaksi tidak dapat dihapus (nonaktifkan saja).', 'Hapus', async () => {
  const res = await api('hapusMaster', { sheet: MASTER[S.masterTab][0], id: id });
  S.B[res.data.key] = res.data.rows; reindex(); Modal.closeAll(); toast(res.message, 'ok'); PAGES.master();
}, true);

// ── Pengaturan (Superuser) ──
PAGES.pengaturan = function () {
  const c = S.B.config, fld = (id, label, val, extra) => '<div class="field"><label for="' + id + '">' + label + '</label><input class="inp" id="' + id + '" value="' + esc(val || '') + '" ' + (extra || '') + '></div>';
  let h = '<div class="card"><h3>Identitas desa</h3>' + fld('cApp', 'Nama aplikasi', c.appName) + fld('cDesa', 'Nama pemerintah desa', c.namaDesa) + fld('cKec', 'Kecamatan', c.kecamatan) + fld('cKab', 'Kabupaten', c.kabupaten) + fld('cAlamat', 'Alamat kantor', c.alamat)
    + fld('cLogo', 'URL logo (opsional, https://…)', c.logoUrl, 'inputmode="url"') + '</div>'
    + '<div class="card"><h3>Penandatangan laporan</h3>' + fld('cKades', 'Nama Kepala Desa', c.namaKades) + fld('cSekdes', 'Nama Sekretaris Desa', c.namaSekdes) + fld('cBend', 'Nama Bendahara', c.namaBendahara)
    + '<div class="field"><label for="cBatas">Batas saldo kas tunai (Rp) — peringatan bila terlampaui</label>' + moneyInput('cBatas', Number(c.batasKasTunai) || 0) + '</div><button class="btn pri block" onclick="A.simpanConfig(this)">Simpan identitas</button></div>';
  h += '<div class="card"><h3>Rekening & saldo awal</h3><p class="small muted" style="margin-top:0">Saldo awal adalah saldo sebelum transaksi pertama dicatat di aplikasi ini. Ubah dengan hati-hati karena memengaruhi seluruh saldo.</p>';
  S.B.rekening.forEach(r => { h += '<div class="taxrow"><div class="bold">' + esc(REK[r.ID] || r.Nama) + '</div><input class="inp" id="rNama_' + r.ID + '" value="' + esc(r.Nama) + '" aria-label="Nama"><input class="inp" id="rNo_' + r.ID + '" placeholder="Nomor rekening (opsional)" value="' + esc(r.NoRekening) + '" aria-label="Nomor rekening">' + moneyInput('rAwal_' + r.ID, r.SaldoAwal) + '<button class="btn sm" onclick="A.simpanRek(\'' + r.ID + '\',this)">Simpan ' + esc(REK[r.ID] || 'rekening') + '</button></div>'; });
  h += '</div><div class="card"><h3>Penyimpanan</h3><dl class="kv"><dt>Spreadsheet</dt><dd class="small">' + esc(c.spreadsheetId) + '</dd><dt>Folder</dt><dd class="small">' + esc(c.folderId) + '</dd><dt>Folder bukti</dt><dd class="small">' + esc(c.buktiFolderId) + '</dd></dl><p class="hint">ID ini dibuat otomatis oleh setupAppEnvironment() dan tidak dapat diubah dari sini.</p></div>';
  V().innerHTML = h;
};
A.simpanConfig = btn => withBusy(btn, async () => {
  const res = await api('simpanConfig', { values: { appName: $('#cApp').value, namaDesa: $('#cDesa').value, kecamatan: $('#cKec').value, kabupaten: $('#cKab').value, alamat: $('#cAlamat').value, logoUrl: $('#cLogo').value, namaKades: $('#cKades').value, namaSekdes: $('#cSekdes').value, namaBendahara: $('#cBend').value, batasKasTunai: moneyVal($('#cBatas')) } });
  S.B.config = Object.assign(S.B.config, res.data.config); document.title = (S.B.config.appName || 'SIKADES') + ' — Kas Desa'; toast(res.message, 'ok'); rerender();
});
A.simpanRek = (id, btn) => withBusy(btn, async () => {
  const res = await api('simpanMaster', { sheet: 'Rekening', record: { id: id, nama: $('#rNama_' + id).value, noRekening: $('#rNo_' + id).value, saldoAwal: moneyVal($('#rAwal_' + id)) } });
  S.B[res.data.key] = res.data.rows; reindex(); toast(res.message, 'ok'); rerender();
});

// ── Audit Log (Superuser) ──
PAGES.audit = async function () {
  V().innerHTML = '<div id="auList">' + skeleton(5) + '</div>';
  try {
    await swr('getAudit', 'getAudit', data => {
    if (S.page !== 'audit' || !$('#auList')) return;
    $('#auList').innerHTML = data.length ? '<div class="list">' + data.map(a => '<div class="item" style="min-height:0"><span class="grow"><span class="t1">' + esc(a.Aksi) + ' · ' + esc(a.Tabel) + '</span><span class="t2"><span>' + esc(a.Waktu) + '</span><span>' + esc(a.User) + '</span></span>' + (a.Detail ? '<span class="t2">' + esc(a.Detail) + '</span>' : '') + '</span></div>').join('') + '</div>' : '<div class="card empty">Belum ada catatan.</div>';
    }, 30000);
  } catch (e) { if ($('#auList')) $('#auList').innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; }
};

// ════════════════════════════════════════════════════════
// BAGIAN 7: INISIALISASI
// ════════════════════════════════════════════════════════
$('#btnRefresh').addEventListener('click', A.refresh);
$('#btnTheme').addEventListener('click', A.toggleTema);
let _hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { _hiddenAt = Date.now(); return; }
  if (_hiddenAt && Date.now() - _hiddenAt > 120000) SkApi.warmup();
  if (S.user && Date.now() - S.loadedAt > 120000) muatUlang(true);
});
setInterval(() => { if (document.visibilityState === 'visible' && S.user && Date.now() - S.loadedAt > 240000 && !Modal.stack.length) muatUlang(true); }, 60000);
window.addEventListener('offline', () => { if (!$('#offBar')) { const d = document.createElement('div'); d.id = 'offBar'; d.className = 'offline-bar'; d.textContent = 'Tidak ada koneksi — menampilkan data tersimpan. Perubahan baru belum bisa disimpan.'; document.body.appendChild(d); } });
window.addEventListener('online', () => { const d = $('#offBar'); if (d) d.remove(); if (S.user) muatUlang(true); });

function tampilGagalMuat(pesan) {
  $('#splash').classList.remove('hide');
  $('#splashTxt').classList.add('hide');
  $('#splash .spin').classList.add('hide');
  $('#splashRetry').classList.remove('hide');
  $('#splashMsg').textContent = pesan;
}
$('#btnRetry').addEventListener('click', () => { $('#splashRetry').classList.add('hide'); $('#splashTxt').classList.remove('hide'); $('#splash .spin').classList.remove('hide'); mulai(); });
$('#btnKeluarSplash').addEventListener('click', () => paksaKeluar(''));

temaAwal();
function mulai() {
  if (!SkApi.configured()) { tampilLogin('Alamat server (GAS_URL) belum diisi di js/config.js.'); return; }
  SkApi.warmup();
  const tk = lsGet('sk_token');
  if (!tk) { tampilLogin(''); return; }
  S.token = tk; SkApi.setToken(tk);
  const snap = bacaSnap();
  if (snap) {
    // Instan: tampilkan data tersimpan, segarkan di latar.
    masukAplikasi(snap.b); S.loadedAt = snap.t || 0;
    muatUlang(true);
    return;
  }
  api('bootstrap').then(res => masukAplikasi(res.data)).catch(e => {
    if (S.token) tampilGagalMuat(e.network ? 'Server belum merespons. Periksa sinyal lalu coba lagi.' : e.message);
  });
}
mulai();
})();
