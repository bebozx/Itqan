/* ===== عرض الأسئلة =====
   ctx = { check(answer) -> Promise<result>, onResult(res) (محاولة غلط), onDone(res), progress: [], placed: [] }
   السلوك: الغلط يفضل مكانه (أحمر) والطالب يجرّب تاني، والصح يتنوّر أخضر ويتقفل. */

const flash = (el, cls, ms = 700) => { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
async function ask(ctx, answer) { try { return await ctx.check(answer); } catch (e) { fail(e); return null; } }
const span = (t, extra) => h('span', { dir: 'auto', ...extra }, t);

function renderQuestion(q, ctx) {
  const fn = { mcq: rChoice, tf: rChoice, error: rChoice, multi: rMulti, fill: rFill, short: rFill, wordbank: rBank, numeric: rNumeric, match: rMatch, sort: rSort, order: rOrder, open: rOpen }[q.type];
  return fn ? fn(q, ctx) : h('p', {}, 'نوع سؤال غير مدعوم');
}

/* اختيار واحد / صح-خطأ / اكتشف الخطأ */
function rChoice(q, ctx) {
  const items = q.options || q.steps, isErr = q.type === 'error';
  let busy = false;
  const btns = items.map((t, i) => h('button', { class: 'opt', type: 'button', onclick: () => pick(i) }, isErr ? h('span', { class: 'num' }, i + 1) : null, span(t)));
  async function pick(i) {
    if (busy || btns[i].disabled) return; busy = true;
    const res = await ask(ctx, { choice: i }); busy = false; if (!res) return;
    if (res.done) { btns.forEach(b => b.disabled = true); btns[i].classList.add('ok'); ctx.onDone(res); }
    else { btns[i].classList.add('bad'); btns[i].disabled = true; ctx.onResult(res); }
  }
  return h('div', { class: 'opts' + (q.type === 'tf' ? ' tf' : '') }, btns);
}

/* اختيارات متعددة */
function rMulti(q, ctx) {
  const sel = new Set(); let busy = false;
  const btns = q.options.map((t, i) => h('button', { class: 'opt', type: 'button', onclick: () => {
    if (btns[i].classList.contains('locked')) return;
    sel.has(i) ? sel.delete(i) : sel.add(i);
    btns[i].classList.toggle('sel', sel.has(i)); btns[i].classList.remove('bad', 'soft');
  } }, span(t)));
  const go = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (busy || !sel.size) return; busy = true;
    const res = await ask(ctx, { choices: [...sel] }); busy = false; if (!res) return;
    [...sel].forEach(i => { btns[i].classList.remove('sel'); btns[i].classList.add(res.parts[i] ? (res.done ? 'ok' : 'soft') : 'bad'); });
    if (res.done) { btns.forEach(b => { b.disabled = true; b.classList.add('locked'); }); go.disabled = true; ctx.onDone(res); }
    else ctx.onResult(res);
  } }, 'تحقق');
  return h('div', {}, h('p', { class: 'muted small' }, 'اختار كل الإجابات الصحيحة'), h('div', { class: 'opts' }, btns), h('div', { class: 'ans' }, go));
}

/* أكمل الفراغ / إجابة قصيرة */
function rFill(q, ctx) {
  const n = q.type === 'short' ? 1 : q.n; let busy = false;
  const inputs = Array.from({ length: n }, () => h('input', {
    type: 'text', class: 'blank', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', dir: 'auto',
    onkeydown: e => { if (e.key === 'Enter') check(); }, oninput: e => e.target.classList.remove('bad')
  }));
  async function check() {
    if (busy || inputs.every(i => !i.value.trim())) return; busy = true;
    const res = await ask(ctx, { blanks: inputs.map(i => i.value) }); busy = false; if (!res) return;
    res.parts.forEach((p, i) => { if (p === true) { inputs[i].classList.remove('bad'); inputs[i].classList.add('ok'); inputs[i].disabled = true; } else if (p === false) { inputs[i].classList.add('bad'); } });
    if (res.done) ctx.onDone(res); else if (res.wrong) ctx.onResult(res);
  }
  let line;
  if (q.type === 'short') line = h('div', { class: 'ans' }, inputs[0]);
  else { line = h('div', { class: 'line', dir: 'auto' }); q.segs.forEach((s, i) => { line.append(span(s)); if (i < n) line.append(inputs[i]); }); }
  if (q.type === 'short') inputs[0].style.width = '16rem';
  setTimeout(() => inputs[0] && inputs[0].focus(), 50);
  return h('div', {}, line, h('div', { class: 'ans' }, h('button', { class: 'btn', type: 'button', onclick: check }, 'تحقق')));
}

/* بنك كلمات */
function rBank(q, ctx) {
  const n = q.n, locked = Array(n).fill(null); let selChip = null, selSlot = null, busy = false;
  const slots = Array.from({ length: n }, (_, j) => h('span', { class: 'slot', onclick: () => clickSlot(j) }, ' '));
  const chips = q.bank.map((w, i) => h('button', { class: 'wchip', type: 'button', onclick: () => clickChip(i), dir: 'auto' }, w));
  const refresh = () => { chips.forEach((c, i) => c.classList.toggle('sel', i === selChip)); slots.forEach((s, j) => s.classList.toggle('sel', j === selSlot && locked[j] === null)); };
  function clickChip(i) { if (chips[i].classList.contains('used') || busy) return; if (selSlot !== null) return place(selSlot, i); selChip = selChip === i ? null : i; refresh(); }
  function clickSlot(j) { if (locked[j] !== null || busy) return; if (selChip !== null) return place(j, selChip); selSlot = selSlot === j ? null : j; refresh(); }
  async function place(j, i) {
    busy = true; const word = q.bank[i];
    slots[j].textContent = word;
    const blanks = locked.map((v, k) => k === j ? word : (v || ''));
    const res = await ask(ctx, { blanks }); busy = false;
    selChip = selSlot = null;
    if (!res) { slots[j].textContent = ' '; refresh(); return; }
    if (res.parts[j] === true) { locked[j] = word; slots[j].classList.add('ok'); chips[i].classList.add('used'); refresh(); if (res.done) ctx.onDone(res); }
    else { slots[j].classList.add('bad'); setTimeout(() => { slots[j].classList.remove('bad'); slots[j].textContent = ' '; refresh(); }, 650); ctx.onResult(res); }
    refresh();
  }
  const line = h('div', { class: 'line', dir: 'auto' }); q.segs.forEach((s, i) => { line.append(span(s)); if (i < n) line.append(slots[i]); });
  return h('div', {}, line, h('p', { class: 'muted small' }, 'اختار كلمة من البنك وبعدين اضغط على الفراغ المناسب'), h('div', { class: 'bank' }, chips));
}

/* إجابة رقمية */
function rNumeric(q, ctx) {
  let busy = false;
  const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', dir: 'ltr', onkeydown: e => { if (e.key === 'Enter') check(); }, oninput: () => input.classList.remove('bad') });
  async function check() {
    if (busy || !input.value.trim()) return; busy = true;
    const res = await ask(ctx, { value: input.value }); busy = false; if (!res) return;
    if (res.done) { input.classList.remove('bad'); input.classList.add('ok'); input.disabled = true; ctx.onDone(res); }
    else { if (res.wrong) input.classList.add('bad'); ctx.onResult(res); }
  }
  setTimeout(() => input.focus(), 50);
  return h('div', { class: 'ans' }, input, q.unit ? span(q.unit, { class: 'muted' }) : null, h('button', { class: 'btn', type: 'button', onclick: check }, 'تحقق'));
}

/* توصيل */
function rMatch(q, ctx) {
  let selL = null, busy = false;
  const L = {}, R = {};
  const left = q.lefts.map(x => (L[x.id] = h('button', { class: 'opt', type: 'button', onclick: () => { if (L[x.id].disabled || busy) return; selL = selL === x.id ? null : x.id; Object.entries(L).forEach(([k, b]) => b.classList.toggle('sel', +k === selL)); } }, span(x.t))));
  const right = q.rights.map(x => (R[x.id] = h('button', { class: 'opt', type: 'button', onclick: async () => {
    if (selL === null || R[x.id].disabled || busy) return; busy = true;
    const l = selL, res = await ask(ctx, { l, r: x.id }); busy = false; if (!res) return;
    selL = null; L[l].classList.remove('sel');
    if (res.parts[0]) { [L[l], R[x.id]].forEach(b => { b.classList.add('ok'); b.disabled = true; }); if (res.done) ctx.onDone(res); }
    else { flash(L[l], 'bad'); flash(R[x.id], 'bad'); ctx.onResult(res); }
  } }, span(x.t))));
  (ctx.progress || []).forEach(l => { if (L[l]) { L[l].classList.add('ok'); L[l].disabled = true; } if (R[l]) { R[l].classList.add('ok'); R[l].disabled = true; } });
  return h('div', {}, h('p', { class: 'muted small' }, 'اضغط على عنصر من اليمين وبعدين اللي يناسبه من اليسار'), h('div', { class: 'pairs' }, h('div', { class: 'opts' }, left), h('div', { class: 'opts' }, right)));
}

/* تصنيف */
function rSort(q, ctx) {
  let sel = null, busy = false;
  const items = {}, cats = [];
  const pool = h('div', { class: 'bank' });
  q.items.forEach(x => { items[x.id] = h('button', { class: 'wchip', type: 'button', dir: 'auto', onclick: () => { if (busy) return; sel = sel === x.id ? null : x.id; Object.entries(items).forEach(([k, b]) => b.classList.toggle('sel', +k === sel)); cats.forEach(c => c.el.classList.toggle('armed', sel !== null)); } }, x.t); pool.append(items[x.id]); });
  const place = (id, c) => { const chipEl = h('div', { class: 'opt ok' }, span(q.items.find(i => i.id === id).t)); cats[c].body.append(chipEl); items[id].remove(); };
  q.cats.forEach((name, c) => {
    const body = h('div', {});
    const el = h('div', { class: 'cat', onclick: async () => {
      if (sel === null || busy) return; busy = true; const id = sel;
      const res = await ask(ctx, { i: id, c }); busy = false; if (!res) return;
      sel = null; cats.forEach(x => x.el.classList.remove('armed')); items[id] && items[id].classList.remove('sel');
      if (res.parts[0]) { place(id, c); if (res.done) ctx.onDone(res); } else { flash(el, 'bad'); flash(items[id], 'bad'); ctx.onResult(res); }
    } }, h('h4', { dir: 'auto' }, name), body);
    cats.push({ el, body });
  });
  (ctx.placed || []).forEach(([id, c]) => place(id, c));
  return h('div', {}, h('p', { class: 'muted small' }, 'اختار عنصر وبعدين اضغط على التصنيف المناسب'), pool, h('div', { class: 'sortbox' }, cats.map(c => c.el)));
}

/* ترتيب */
function rOrder(q, ctx) {
  let arr = q.items.map(x => x.id); const text = Object.fromEntries(q.items.map(x => [x.id, x.t]));
  const state = arr.map(() => null); let busy = false; // null | 'ok'
  const list = h('div', { class: 'olist' });
  function draw() {
    clear(list);
    arr.forEach((id, p) => list.append(h('div', { class: 'orow' + (state[p] === 'ok' ? ' ok' : state[p] === 'bad' ? ' bad' : '') },
      h('span', { class: 'num opt', style: { padding: 0, border: 0, background: '#EAEEF7', minWidth: '1.7rem', height: '1.7rem', justifyContent: 'center' } }, p + 1),
      h('span', { class: 't', dir: 'auto' }, text[id]),
      h('button', { type: 'button', disabled: state[p] === 'ok' || p === 0 || state[p - 1] === 'ok', onclick: () => move(p, -1), 'aria-label': 'لأعلى' }, '▲'),
      h('button', { type: 'button', disabled: state[p] === 'ok' || p === arr.length - 1 || state[p + 1] === 'ok', onclick: () => move(p, 1), 'aria-label': 'لأسفل' }, '▼'))));
  }
  function move(p, d) { [arr[p], arr[p + d]] = [arr[p + d], arr[p]]; state.forEach((s, i) => { if (s === 'bad') state[i] = null; }); draw(); }
  const check = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (busy) return; busy = true; const res = await ask(ctx, { order: arr }); busy = false; if (!res) return;
    res.parts.forEach((ok, p) => { state[p] = ok ? 'ok' : 'bad'; }); draw();
    if (res.done) { check.disabled = true; ctx.onDone(res); } else ctx.onResult(res);
  } }, 'تحقق من الترتيب');
  draw();
  return h('div', {}, h('p', { class: 'muted small' }, 'رتّب العناصر بالأسهم، والعناصر الصح بتتقفل بالأخضر'), list, h('div', { class: 'ans' }, check));
}

/* إجابة مفتوحة */
function rOpen(q, ctx) {
  let busy = false;
  const ta = h('textarea', { dir: 'auto', placeholder: 'اكتب إجابتك بأسلوبك...' });
  const count = h('span', { class: 'muted small' }, `0 / ${q.min}`);
  ta.addEventListener('input', () => { count.textContent = `${ta.value.trim().length} / ${q.min}`; });
  const model = h('div', {});
  const send = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (busy) return; busy = true; const res = await ask(ctx, { text: ta.value }); busy = false; if (!res) return;
    if (res.done) {
      ta.disabled = true; send.disabled = true;
      if (res.model) model.append(h('div', { class: 'fb info', style: { margin: '1rem 0 0' } }, h('b', {}, 'إجابة نموذجية للمقارنة: '), span(res.model)));
      ctx.onDone(res);
    } else ctx.onResult(res);
  } }, 'إرسال');
  return h('div', {}, ta, h('div', { class: 'ans' }, send, count), model);
}
