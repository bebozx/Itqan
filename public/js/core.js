/* ===== أدوات أساسية ===== */
const App = { me: null, viewAs: null, viewAsName: '' };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

async function api(method, url, body) {
  if (App.viewAs && url.startsWith('/api/t/')) url += (url.includes('?') ? '&' : '?') + 't=' + App.viewAs;
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { }
  if (r.status === 401 && App.me) { App.me = null; location.hash = ''; location.reload(); throw new Error('انتهت الجلسة'); }
  if (!r.ok) throw new Error((data && data.error) || 'حصل خطأ');
  return data;
}
const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b || {}), DEL = u => api('DELETE', u);

function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind }, msg);
  $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2800);
}
const fail = e => toast(e.message || String(e), 'err');
async function safe(fn) { try { return await fn(); } catch (e) { fail(e); } }

function modal({ title, body, actions = [], wide }) {
  const close = () => ov.remove();
  const acts = h('div', { class: 'acts' }, actions.map(a => h('button', {
    class: 'btn ' + (a.kind || ''), type: 'button',
    onclick: async e => { const b = e.currentTarget; b.disabled = true; try { const r = a.onClick ? await a.onClick(close) : undefined; if (r !== false && !a.keep) close(); } catch (er) { fail(er); } b.disabled = false; }
  }, a.label)));
  const ov = h('div', { class: 'overlay', onmousedown: e => { if (e.target === ov) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog' }, title ? h('h2', {}, title) : null, body, actions.length ? acts : null));
  document.body.append(ov);
  const first = $('input,select,textarea', ov); if (first) first.focus();
  return { close };
}
const confirmBox = (msg, label = 'تأكيد') => new Promise(res => {
  let m; const fin = v => { m.close(); res(v); };
  m = modal({ body: h('p', {}, msg), actions: [{ label, kind: 'danger', keep: true, onClick: () => fin(true) }, { label: 'إلغاء', kind: 'ghost', keep: true, onClick: () => fin(false) }] });
});

/* ===== مكونات واجهة ===== */
const btn = (label, onclick, kind = '', extra = {}) => h('button', { class: 'btn ' + kind, type: 'button', onclick, ...extra }, label);
const field = (label, input) => h('label', { class: 'f' }, h('span', {}, label), input);
const chip = (t, kind = '') => h('span', { class: 'chip ' + kind }, t);
const empty = msg => h('div', { class: 'empty' }, msg);
const card = (...kids) => h('div', { class: 'card' }, kids);
const stat = (v, label) => h('div', { class: 'card stat' }, h('b', {}, v), h('span', {}, label));
function select(options, value, onchange, attrs = {}) {
  const s = h('select', { onchange: onchange && (e => onchange(e.target.value)), ...attrs },
    options.map(o => h('option', { value: o.value ?? o.id, selected: String(o.value ?? o.id) === String(value) }, o.label ?? o.name)));
  return s;
}
function table(heads, rows, cls = '') {
  return h('div', { class: 'scroll' }, h('table', { class: 'tbl ' + cls },
    h('thead', {}, h('tr', {}, heads.map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
}
function tabs(items, active, onpick) {
  const el = h('div', { class: 'tabs' });
  items.forEach(([k, label]) => el.append(h('button', { class: k === active ? 'on' : '', type: 'button', onclick: () => onpick(k) }, label)));
  return el;
}
const scoreBar = s => s == null ? h('span', { class: 'muted small' }, '—') :
  h('div', { class: 'row', style: { gap: '.5rem', flexWrap: 'nowrap' } }, h('div', { class: 'bar ' + (s < 45 ? 'lo' : s < 75 ? 'mid' : 'hi'), style: { flex: 1 } }, h('i', { style: { width: s + '%' } })), h('span', { class: 'small' }, s + '%'));
const heatClass = s => s == null ? 'h0' : s < 30 ? 'h1' : s < 55 ? 'h2' : s < 80 ? 'h3' : 'h4';

const TIER = { foundation: 'أساسي', core: 'متوسط', stretch: 'تحدي' };
const BLOOM = { remember: 'تذكر', understand: 'فهم', apply: 'تطبيق', analyze: 'تحليل', evaluate: 'تقييم' };
const TYPES = {
  mcq: 'اختيار من متعدد', multi: 'اختيارات متعددة', tf: 'صح / خطأ', fill: 'أكمل الفراغ', wordbank: 'بنك كلمات', short: 'إجابة قصيرة',
  numeric: 'إجابة رقمية', match: 'توصيل', order: 'ترتيب', sort: 'تصنيف', error: 'اكتشف الخطأ', open: 'إجابة مفتوحة'
};
const fmtDate = d => d ? new Date(d.replace(' ', 'T') + (d.length <= 10 ? '' : 'Z')).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '';
const optList = (arr, ph) => (ph ? [{ value: '', label: ph }] : []).concat(arr.map(x => ({ value: x.id, label: x.name })));

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
function showCreds(list, title = 'بيانات الدخول') {
  const csv = 'الاسم,اسم المستخدم,كلمة المرور\n' + list.map(u => [u.name, u.username, u.password].map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  modal({
    title, wide: true,
    body: h('div', {}, h('p', { class: 'chip warn' }, 'كلمات المرور بتظهر مرة واحدة بس — احفظها أو نزّل الملف دلوقتي'), h('div', { class: 'sp' }),
      table(['الاسم', 'اسم المستخدم', 'كلمة المرور'], list.map(u => [u.name, h('b', { dir: 'ltr' }, u.username), h('b', { dir: 'ltr' }, u.password)]))),
    actions: [{ label: 'تنزيل CSV', onClick: () => { download('credentials.csv', csv); return false; } },
    { label: 'نسخ', kind: 'ghost', onClick: async () => { await navigator.clipboard.writeText(list.map(u => `${u.name}\t${u.username}\t${u.password}`).join('\n')); toast('تم النسخ', 'ok'); return false; } },
    { label: 'تم', kind: 'ghost' }]
  });
}

/* ===== الراوتر ===== */
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
const go = p => { if (location.hash === '#' + p) navigate(); else location.hash = p; };
async function navigate() {
  const view = $('#view'); if (!view) return;
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    clear(view).append(h('div', { class: 'empty' }, 'لحظة...'));
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.p && (path === a.dataset.p || path.startsWith(a.dataset.p + '/') || (a.dataset.also || '').split(',').some(x => x && path.startsWith(x)))));
    try { const root = h('div', { class: 'wrap' }); await fn(root, m.slice(1), query); clear(view).append(root); window.scrollTo(0, 0); }
    catch (e) { clear(view).append(h('div', { class: 'wrap' }, card(h('p', {}, e.message || 'حصل خطأ'), btn('رجوع', () => history.back(), 'ghost')))); }
    return;
  }
  clear(view).append(h('div', { class: 'wrap' }, empty('الصفحة مش موجودة')));
}
const _append = Element.prototype.append;
Element.prototype.append = function (...a) { return _append.apply(this, a.filter(x => x != null && x !== false)); };
window.addEventListener('hashchange', navigate);
const readOnly = () => !!App.viewAs;
