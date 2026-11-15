/* ===== محرر الأسئلة (للمعلم) ===== */
const splitList = s => String(s || '').split(/[,،\n|]/).map(x => x.trim()).filter(Boolean);
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

// كل نوع: build() -> { el, get(), set(data) }
const TYPE_FORMS = {
  mcq: () => choiceForm(false, 'الاختيارات (سطر لكل اختيار)', 'ضع * قبل الإجابة الصحيحة. بعد // اكتب الفكرة الخاطئة اللي بيمثلها الاختيار (اختياري، وبتظهر للطالب لو اختاره).'),
  multi: () => choiceForm(true, 'الاختيارات (سطر لكل اختيار)', 'ضع * قبل كل إجابة صحيحة (واحدة أو أكتر). بعد // اكتب الفكرة الخاطئة (اختياري).'),
  error: () => stepsForm(),
  tf: () => {
    const sel = select([{ value: 'true', label: 'صح' }, { value: 'false', label: 'خطأ' }], 'true');
    return { el: field('العبارة صحيحة أم خاطئة؟', sel), get: () => ({ answer: sel.value === 'true' }), set: d => { sel.value = String(d.answer); } };
  },
  fill: () => textForm(false),
  wordbank: () => textForm(true),
  short: () => {
    const ta = h('textarea', { dir: 'auto', placeholder: 'electrostatic attraction\nelectrostatic force' });
    return { el: field('الإجابات المقبولة (سطر لكل إجابة)', ta), get: () => ({ answers: splitList(ta.value) }), set: d => { ta.value = (d.answers || []).join('\n'); } };
  },
  numeric: () => {
    const a = h('input', { type: 'text', dir: 'ltr', inputmode: 'decimal' }), t = h('input', { type: 'text', dir: 'ltr', inputmode: 'decimal', value: '0' }), u = h('input', { type: 'text', dir: 'auto', placeholder: 'مثال: g, mol, m/s' });
    return {
      el: h('div', { class: 'grid g3' }, field('الإجابة الصحيحة', a), field('هامش الخطأ المسموح (±)', t), field('الوحدة (اختياري)', u)),
      get: () => ({ answer: a.value.trim() === '' ? '' : parseFloat(a.value.replace(',', '.')), tol: parseFloat((t.value || '0').replace(',', '.')) || 0, unit: u.value.trim() }),
      set: d => { a.value = d.answer; t.value = d.tol || 0; u.value = d.unit || ''; }
    };
  },
  match: () => {
    const ta = h('textarea', { dir: 'auto', placeholder: 'Water = H₂O\nMethane = CH₄' });
    return {
      el: field('الأزواج (سطر لكل زوج بصيغة: العنصر = اللي يناسبه)', ta),
      get: () => ({ pairs: lines(ta.value).map(l => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }) }),
      set: d => { ta.value = (d.pairs || []).map(p => p.join(' = ')).join('\n'); }
    };
  },
  order: () => {
    const ta = h('textarea', { dir: 'auto' });
    return { el: field('العناصر بالترتيب الصحيح (سطر لكل عنصر) — الطالب هيشوفها متلخبطة', ta), get: () => ({ items: lines(ta.value) }), set: d => { ta.value = (d.items || []).join('\n'); } };
  },
  sort: () => {
    const cats = h('input', { type: 'text', dir: 'auto', placeholder: 'Ionic, Covalent' }), ta = h('textarea', { dir: 'auto', placeholder: 'NaCl = Ionic\nH₂O = Covalent' });
    return {
      el: h('div', {}, field('التصنيفات (افصل بينها بفاصلة)', cats), field('العناصر (سطر لكل عنصر بصيغة: العنصر = التصنيف)', ta)),
      get: () => {
        const cs = splitList(cats.value.replace(/\n/g, ','));
        return { cats: cs, items: lines(ta.value).map(l => { const i = l.lastIndexOf('='); const t = i < 0 ? l : l.slice(0, i).trim(), c = i < 0 ? '' : l.slice(i + 1).trim().toLowerCase(); return { t, cat: cs.findIndex(x => x.toLowerCase() === c) }; }) };
      },
      set: d => { cats.value = (d.cats || []).join(', '); ta.value = (d.items || []).map(x => `${x.t} = ${d.cats[x.cat]}`).join('\n'); }
    };
  },
  open: () => {
    const min = h('input', { type: 'number', min: 5, max: 500, value: 30 }), model = h('textarea', { dir: 'auto' });
    return {
      el: h('div', {}, field('أقل عدد حروف للإجابة', min), field('إجابة نموذجية (بتظهر للطالب بعد الإرسال ليقارن)', model)),
      get: () => ({ min: +min.value || 10, model: model.value.trim() }), set: d => { min.value = d.min || 30; model.value = d.model || ''; }
    };
  }
};

function choiceForm(multi, label, help) {
  const ta = h('textarea', { dir: 'auto', style: { minHeight: '130px' }, placeholder: '* Neutron\nProton // الخلط بين موقع البروتون وشحنته\nElectron' });
  return {
    el: h('div', {}, field(label, ta), h('p', { class: 'muted small', style: { marginTop: '-.5rem' } }, help)),
    get: () => {
      const options = [], notes = [], correct = [];
      lines(ta.value).forEach(l => {
        const star = /^\*/.test(l); l = l.replace(/^\*\s*/, '');
        const [t, ...n] = l.split(/\s\/\/\s/);
        if (star) correct.push(options.length); options.push(t.trim()); notes.push(n.join(' // ').trim() || null);
      });
      const d = { options, notes: notes.some(Boolean) ? notes : undefined };
      return multi ? { ...d, correct } : { ...d, correct: correct.length === 1 ? correct[0] : -1 };
    },
    set: d => { const c = multi ? d.correct : [d.correct]; ta.value = d.options.map((o, i) => (c.includes(i) ? '* ' : '') + o + (d.notes && d.notes[i] ? ' // ' + d.notes[i] : '')).join('\n'); }
  };
}
function stepsForm() {
  const ta = h('textarea', { dir: 'auto', style: { minHeight: '130px' }, placeholder: 'Mass number = 14\nAtomic number = 6\n* Neutrons = 14 + 6 = 20' });
  return {
    el: h('div', {}, field('خطوات الحل (سطر لكل خطوة)', ta), h('p', { class: 'muted small', style: { marginTop: '-.5rem' } }, 'ضع * قبل الخطوة الخاطئة اللي المفروض الطالب يكتشفها. اكتب نص السؤال في خانة "نص السؤال".')),
    get: () => { const steps = [], marks = []; lines(ta.value).forEach(l => { const s = /^\*/.test(l); steps.push(l.replace(/^\*\s*/, '')); if (s) marks.push(steps.length - 1); }); return { steps, correct: marks.length === 1 ? marks[0] : -1 }; },
    set: d => { ta.value = d.steps.map((s, i) => (i === d.correct ? '* ' : '') + s).join('\n'); }
  };
}
function textForm(bank) {
  const ta = h('textarea', { dir: 'auto', style: { minHeight: '110px' }, placeholder: 'Atoms share [[electrons]] in a [[covalent|covalent bond]].' }), dis = h('input', { type: 'text', dir: 'auto', placeholder: 'electrons, ions' });
  return {
    el: h('div', {}, field('النص (ضع الإجابة بين [[ ]] وبدائلها المقبولة بـ |)', ta), bank ? field('كلمات مشتتة إضافية (افصل بفاصلة)', dis) : null),
    get: () => bank ? { text: ta.value.trim(), distractors: splitList(dis.value) } : { text: ta.value.trim() },
    set: d => { ta.value = d.text || ''; if (bank) dis.value = (d.distractors || []).join(', '); }
  };
}

/* ---------- صفحة المحرر ---------- */
async function questionEditor(root, id) {
  const [subjects, concepts] = await Promise.all([GET('/api/t/subjects'), GET('/api/t/concepts')]);
  if (!subjects.length) { root.append(card(h('p', {}, 'مفيش مواد مربوطة بحسابك. اطلب من الأدمن يربطك بمادة.'))); return; }
  const q = id ? await GET('/api/t/questions/' + id) : null;
  const st = { subject: q ? q.subject_id : subjects[0].id, type: q ? q.type : 'mcq', form: null };
  const f = {
    subject: select(subjects.map(s => ({ value: s.id, label: s.name })), st.subject, () => { st.subject = +f.subject.value; fillConcepts(); }),
    concept: h('select', {}),
    type: select(Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v })), st.type, () => { st.type = f.type.value; buildForm(); }),
    tier: select(Object.entries(TIER).map(([k, v]) => ({ value: k, label: v })), q ? q.tier : 'core'),
    bloom: select(Object.entries(BLOOM).map(([k, v]) => ({ value: k, label: v })), q ? q.bloom : 'understand'),
    prompt: h('textarea', { dir: 'auto', style: { minHeight: '70px' }, value: q ? q.prompt : '' }),
    explanation: h('textarea', { dir: 'auto', style: { minHeight: '70px' }, value: q ? q.explanation : '' }),
    h1: h('input', { type: 'text', dir: 'auto', value: q ? (q.hints[0] || '') : '' }), h2: h('input', { type: 'text', dir: 'auto', value: q ? (q.hints[1] || '') : '' })
  };
  const formBox = h('div', {}), preview = h('div', {});
  function fillConcepts(sel) {
    clear(f.concept);
    concepts.filter(c => c.subject_id === +f.subject.value).forEach(c => f.concept.append(h('option', { value: c.id, selected: sel === c.id }, (c.unit ? c.unit + ' › ' : '') + c.name)));
  }
  function buildForm(data) {
    st.form = TYPE_FORMS[st.type](); clear(formBox).append(st.form.el);
    if (data) st.form.set(data);
    formBox.addEventListener('input', schedule, { once: false });
    schedule();
  }
  fillConcepts(q && q.concept_id);

  const collect = () => ({ type: st.type, concept_id: +f.concept.value, tier: f.tier.value, bloom: f.bloom.value, prompt: f.prompt.value, data: st.form.get(), explanation: f.explanation.value, hints: [f.h1.value, f.h2.value] });
  let timer; function schedule() { clearTimeout(timer); timer = setTimeout(drawPreview, 450); }
  async function drawPreview() {
    const d = collect();
    try {
      const pq = await POST('/api/t/preview', d); let progress = [];
      clear(preview).append(h('div', { class: 'qcard' }, h('div', { class: 'qhead' }, chip(TIER[d.tier], d.tier), h('h2', { dir: 'auto' }, d.prompt || 'نص السؤال هيظهر هنا')),
        h('div', { class: 'qbody' }, renderQuestion(pq, {
          progress, check: async a => { const r = await POST('/api/t/preview/check', { ...d, answer: a, progress }); progress = r.progress || progress; return r; },
          onResult: () => { }, onDone: () => toast('إجابة صحيحة ✓', 'ok')
        }))));
    } catch (e) { clear(preview).append(h('div', { class: 'empty' }, h('b', {}, 'المعاينة هتظهر لما السؤال يكتمل'), h('div', { class: 'small' }, e.message))); }
  }
  [f.concept, f.tier, f.bloom, f.prompt, f.explanation].forEach(x => x.addEventListener('input', schedule));
  buildForm(q ? q.data : null);

  async function save(again) {
    const d = collect(); if (!d.concept_id) throw new Error('اختر المفهوم (أو أضف مفهوم جديد)');
    if (q) await PUT('/api/t/questions/' + q.id, d); else await POST('/api/t/questions', d);
    toast('تم حفظ السؤال', 'ok');
    if (again) { f.prompt.value = ''; f.explanation.value = ''; f.h1.value = f.h2.value = ''; buildForm(); window.scrollTo(0, 0); if (q) go('/t/question/new'); } else go('/t/bank');
  }
  async function newConcept() {
    const unit = h('input', { type: 'text', dir: 'auto' }), name = h('input', { type: 'text', dir: 'auto' });
    const pre = select([{ value: '', label: 'بدون' }].concat(concepts.filter(c => c.subject_id === +f.subject.value).map(c => ({ value: c.id, label: c.name }))), '');
    modal({ title: 'مفهوم جديد', body: h('div', {}, field('الوحدة (اختياري)', unit), field('اسم المفهوم', name), field('المفهوم السابق اللازم لفهمه (اختياري — الطالب بيرجع له لو اتعثر)', pre)), actions: [{ label: 'إضافة', onClick: async () => {
      const r = await POST('/api/t/concepts', { subject_id: +f.subject.value, unit: unit.value, name: name.value, prereq_id: pre.value || null });
      concepts.push({ id: r.id, subject_id: +f.subject.value, unit: unit.value, name: name.value }); fillConcepts(r.id); schedule();
    } }, { label: 'إلغاء', kind: 'ghost' }] });
  }

  const ro = readOnly();
  root.append(
    h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, q ? 'تعديل سؤال' : 'سؤال جديد'), btn('رجوع للبنك', () => go('/t/bank'), 'ghost')),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('fieldset', { disabled: ro, style: { border: 0, padding: 0, margin: 0 } }, h('div', { class: 'card' },
        h('div', { class: 'grid g2' }, field('المادة', f.subject), h('div', {}, field('المفهوم', f.concept), btn('+ مفهوم جديد', newConcept, 'ghost sm'))),
        h('div', { class: 'grid g3' }, field('نوع السؤال', f.type), field('المستوى', f.tier), field('مستوى بلوم', f.bloom)),
        field('نص السؤال', f.prompt), formBox,
        field('شرح بيظهر بعد الإجابة الصحيحة (اختياري)', f.explanation),
        h('div', { class: 'grid g2' }, field('تلميح 1 (اختياري، لو فاضي بنوجّه الطالب للكتاب)', f.h1), field('تلميح 2 أقوى (اختياري)', f.h2)),
        ro ? null : h('div', { class: 'row' }, btn('حفظ', () => safe(() => save(false))), btn('حفظ وإضافة سؤال آخر', () => safe(() => save(true)), 'ghost')))),
      h('div', { style: { position: 'sticky', top: '4.5rem' } }, h('h3', {}, 'معاينة (جرّب السؤال زي ما الطالب هيشوفه)'), preview)));
}
