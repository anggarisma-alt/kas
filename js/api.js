/**
 * SIKADES — Lapisan jaringan ke Google Apps Script (REST).
 * - POST text/plain (tanpa preflight CORS), redirect follow, tanpa cache browser
 * - Timeout + retry bertahap untuk aksi BACA; aksi TULIS di-retry aman lewat reqId (idempoten di server)
 * - Perf.table() di Console menampilkan waktu total vs waktu server
 */
(function () {
'use strict';
const URL_ = (window.SIKADES_CONFIG && window.SIKADES_CONFIG.GAS_URL) || '';
const BACA = /^(bootstrap|getBukti|getLaporan|exportLaporan|daftarUser|getAudit|batch|ping)$/;
let token = '';

const Perf = {
  rows: [],
  add(action, total, server) {
    this.rows.push({ action: action, total: total, server: server == null ? null : server, jaringan: server == null ? null : total - server });
    if (this.rows.length > 100) this.rows.shift();
  },
  table() { console.table(this.rows.slice(-30)); }
};

function configured() { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(URL_) && URL_.indexOf('ISI_DENGAN') < 0; }
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
function tunggu(ms) { return new Promise(r => setTimeout(r, ms)); }
function tungguOnline(ms) {
  return new Promise(res => {
    if (navigator.onLine !== false) return res();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); removeEventListener('online', done); res(); }
    addEventListener('online', done);
  });
}

async function sekali(action, data, timeout, reqId) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
  try {
    const res = await fetch(URL_, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: token, reqId: reqId, data: data || {} })
    });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      return { success: false, network: true, retryable: true, message: 'Server membalas dengan format tak dikenal (HTTP ' + res.status + '). Pastikan Web App di-deploy: akses "Anyone".' };
    }
    Perf.add(action, Math.round(performance.now() - t0), j.ms);
    return j;
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err && err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus.' };
  } finally { clearTimeout(timer); }
}

/** call(action, data, {timeout, quiet}) → objek respons {success, data, message, code?} (tidak melempar). */
async function call(action, data, opt) {
  opt = opt || {};
  if (!configured()) return { success: false, network: true, message: 'Alamat server (GAS_URL) belum diisi di js/config.js.' };
  const baca = BACA.test(action);
  const isAuth = action === 'login' || action === 'logout';
  const reqId = (baca || isAuth) ? '' : uuid();          // satu reqId untuk semua percobaan → server tidak menggandakan
  const tries = isAuth ? 2 : (baca ? 3 : 3);
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await tunggu(1200 * i); if (navigator.onLine === false) await tungguOnline(15000); }
    const to = opt.timeout || (baca ? (i ? 40000 : 25000) : 90000);
    res = await sekali(action, data, to, reqId);
    if (res.success || !res.retryable) break;
  }
  return res;
}

/** Bangunkan server (cold start) tanpa menunggu hasilnya. */
function warmup() { if (configured()) fetch(URL_ + '?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); }

window.SkApi = { call: call, warmup: warmup, configured: configured, setToken: t => { token = t || ''; }, Perf: Perf };
})();
