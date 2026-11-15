const { J } = require('./db');

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const shuffleNotSame = a => { if (a.length < 2) return a; let s, n = 0; do { s = shuffle(a); n++; } while (n < 10 && s.every((x, i) => x === a[i])); return s; };

function norm(s) {
  s = String(s ?? '').normalize('NFKD').trim().toLowerCase();
  s = s.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0);
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  return s.replace(/[.,!?؟،;:"'`]+$/g, '').replace(/\s+/g, ' ').trim();
}

function parseBlanks(text) {
  const segs = [], blanks = [], re = /\[\[(.+?)\]\]/g; let last = 0, m;
  while ((m = re.exec(text))) { segs.push(text.slice(last, m.index)); blanks.push(m[1].split('|').map(x => x.trim()).filter(Boolean)); last = m.index + m[0].length; }
  segs.push(text.slice(last));
  return { segs, blanks };
}

const TF = ['صح', 'خطأ'];
const tfCorrect = d => d.answer ? 0 : 1;
const dataOf = q => typeof q.data === 'string' ? J(q.data, {}) : q.data;

// نسخة السؤال اللي تروح للطالب (من غير الإجابات)
function pub(q) {
  const d = dataOf(q);
  const base = { id: q.id, type: q.type, tier: q.tier, prompt: q.prompt, concept_id: q.concept_id };
  switch (q.type) {
    case 'mcq': return { ...base, options: d.options };
    case 'tf': return { ...base, options: TF };
    case 'multi': return { ...base, options: d.options };
    case 'error': return { ...base, steps: d.steps };
    case 'fill': { const p = parseBlanks(d.text); return { ...base, segs: p.segs, n: p.blanks.length }; }
    case 'wordbank': {
      const p = parseBlanks(d.text);
      return { ...base, segs: p.segs, n: p.blanks.length, bank: shuffle([...p.blanks.map(b => b[0]), ...(d.distractors || [])]) };
    }
    case 'short': return base;
    case 'numeric': return { ...base, unit: d.unit || '' };
    case 'match': return { ...base, lefts: d.pairs.map((p, i) => ({ id: i, t: p[0] })), rights: shuffle(d.pairs.map((p, i) => ({ id: i, t: p[1] }))) };
    case 'order': return { ...base, items: shuffleNotSame(d.items.map((t, i) => ({ id: i, t }))) };
    case 'sort': return { ...base, cats: d.cats, items: shuffle(d.items.map((x, i) => ({ id: i, t: x.t }))) };
    case 'open': return { ...base, min: d.min || 10 };
  }
  return base;
}

const blank = v => v == null || String(v).trim() === '';

// التصحيح: بيرجع done / wrong / parts / progress
function grade(q, a, prog = []) {
  const d = dataOf(q);
  a = a || {};
  const r = { done: false, wrong: false, parts: null, note: null, label: '', progress: prog };
  switch (q.type) {
    case 'mcq': case 'tf': case 'error': {
      const i = +a.choice, ok = i === (q.type === 'tf' ? tfCorrect(d) : d.correct);
      const labels = q.type === 'tf' ? TF : q.type === 'error' ? d.steps : d.options;
      r.parts = { [i]: ok }; r.done = ok; r.wrong = !ok; r.label = labels[i] ?? '';
      if (!ok && d.notes && d.notes[i]) r.note = d.notes[i];
      return r;
    }
    case 'multi': {
      const sel = (a.choices || []).map(Number), set = new Set(d.correct);
      r.parts = {}; sel.forEach(i => r.parts[i] = set.has(i));
      const anyBad = sel.some(i => !set.has(i));
      r.done = !anyBad && sel.length === set.size;
      r.wrong = sel.length > 0 && !r.done;
      r.partial = !anyBad && sel.length < set.size && sel.length > 0;
      r.label = sel.map(i => d.options[i]).join(' + ');
      return r;
    }
    case 'fill': case 'wordbank': case 'short': {
      const alts = q.type === 'short' ? [d.answers] : parseBlanks(d.text).blanks;
      const vals = a.blanks || [];
      r.parts = alts.map((al, i) => blank(vals[i]) ? null : al.map(norm).includes(norm(vals[i])));
      r.done = r.parts.every(p => p === true);
      r.wrong = r.parts.some(p => p === false);
      r.label = vals.filter((v, i) => r.parts[i] === false).join(' | ');
      return r;
    }
    case 'numeric': {
      const v = parseFloat(norm(a.value).replace(/,/g, '.').replace(/[^0-9eE.+-]/g, ''));
      if (isNaN(v)) { r.note = 'اكتب رقم'; r.parts = [null]; return r; }
      const ok = Math.abs(v - d.answer) <= (d.tol || 0) + 1e-9;
      r.parts = [ok]; r.done = ok; r.wrong = !ok; r.label = String(a.value);
      return r;
    }
    case 'match': {
      const l = +a.l, rr = +a.r;
      if (!d.pairs[l] || !d.pairs[rr]) return r;
      const ok = d.pairs[l][1] === d.pairs[rr][1];
      r.parts = [ok]; r.wrong = !ok; r.label = `${d.pairs[l][0]} ≠ ${d.pairs[rr][1]}`;
      if (ok && !prog.includes(l)) r.progress = [...prog, l];
      r.done = r.progress.length >= d.pairs.length;
      return r;
    }
    case 'sort': {
      const i = +a.i, c = +a.c;
      if (!d.items[i]) return r;
      const ok = d.items[i].cat === c;
      r.parts = [ok]; r.wrong = !ok; r.label = `${d.items[i].t} → ${d.cats[c]}`;
      if (ok && !prog.includes(i)) r.progress = [...prog, i];
      r.done = r.progress.length >= d.items.length;
      return r;
    }
    case 'order': {
      const ord = (a.order || []).map(Number);
      r.parts = d.items.map((t, p) => d.items[ord[p]] === t);
      r.done = r.parts.every(Boolean); r.wrong = !r.done;
      r.label = ord.map(i => d.items[i]).join(' > ');
      return r;
    }
    case 'open': {
      const len = String(a.text || '').trim().length;
      if (len < (d.min || 10)) { r.note = 'اكتب إجابة أطول شوية'; return r; }
      r.done = true; r.model = d.model || '';
      return r;
    }
  }
  return r;
}

function solution(q) {
  const d = dataOf(q);
  switch (q.type) {
    case 'mcq': return d.options[d.correct];
    case 'tf': return TF[tfCorrect(d)];
    case 'error': return d.steps[d.correct];
    case 'multi': return d.correct.map(i => d.options[i]).join(' ، ');
    case 'fill': case 'wordbank': return parseBlanks(d.text).blanks.map(b => b[0]).join(' ، ');
    case 'short': return d.answers[0];
    case 'numeric': return d.answer + (d.unit ? ' ' + d.unit : '');
    case 'match': return d.pairs.map(p => `${p[0]} ← ${p[1]}`).join(' | ');
    case 'order': return d.items.join(' ← ');
    case 'sort': return d.items.map(x => `${x.t}: ${d.cats[x.cat]}`).join(' | ');
    case 'open': return d.model || '';
  }
  return '';
}

function validate(type, d) {
  const s = x => typeof x === 'string' && x.trim();
  const n = (a, min) => Array.isArray(a) && a.length >= min && a.every(s);
  if (!d || typeof d !== 'object') return 'بيانات السؤال ناقصة';
  switch (type) {
    case 'mcq': return !n(d.options, 2) ? 'اكتب اختيارين على الأقل' : !(d.correct >= 0 && d.correct < d.options.length) ? 'حدد الإجابة الصحيحة' : null;
    case 'multi': return !n(d.options, 2) ? 'اكتب اختيارين على الأقل' : !(Array.isArray(d.correct) && d.correct.length >= 1) ? 'حدد إجابة صحيحة واحدة على الأقل' : null;
    case 'tf': return typeof d.answer !== 'boolean' ? 'حدد صح أو خطأ' : null;
    case 'error': return !n(d.steps, 2) ? 'اكتب خطوتين على الأقل' : !(d.correct >= 0 && d.correct < d.steps.length) ? 'حدد الخطوة الخاطئة' : null;
    case 'fill': case 'wordbank': return !s(d.text) || parseBlanks(d.text).blanks.length < 1 ? 'ضع الإجابة بين [[ ]] داخل النص' : null;
    case 'short': return !n(d.answers, 1) ? 'اكتب إجابة مقبولة واحدة على الأقل' : null;
    case 'numeric': return (d.answer === '' || d.answer === null || !isFinite(d.answer)) ? 'اكتب الإجابة الرقمية' : null;
    case 'match': return !Array.isArray(d.pairs) || d.pairs.length < 2 || !d.pairs.every(p => s(p[0]) && s(p[1])) ? 'اكتب زوجين على الأقل' : null;
    case 'order': return !n(d.items, 2) ? 'اكتب عنصرين على الأقل بالترتيب الصحيح' : null;
    case 'sort': return !n(d.cats, 2) || !Array.isArray(d.items) || d.items.length < 2 || !d.items.every(x => s(x.t) && x.cat >= 0 && x.cat < d.cats.length) ? 'اكتب تصنيفين وعنصرين على الأقل' : null;
    case 'open': return null;
  }
  return 'نوع سؤال غير معروف';
}

module.exports = { pub, grade, solution, validate, shuffle, norm };
