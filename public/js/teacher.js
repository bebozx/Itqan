/* ===== واجهة المعلم (والمشرف في وضع القراءة) ===== */
const qsOf = o => Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function teacherClasses(root) {
  const [classes, subjects] = await Promise.all([GET('/api/t/classes'), GET('/api/t/subjects')]);
  async function joinModal() {
    const avail = await GET('/api/t/classes/available');
    if (!subjects.length) return toast('مفيش مواد مربوطة بحسابك — اطلب من الأدمن', 'err');
    const cs = select(avail.map(c => ({ value: c.id, label: `${c.name}${c.grade ? ' (' + c.grade + ')' : ''} — ${c.students} طالب` })), avail[0] && avail[0].id), sj = select(subjects.map(s => ({ value: s.id, label: s.name })), subjects[0].id);
    modal({ title: 'ربط فصل بحسابك', body: h('div', {}, field('الفصل', cs), field('المادة اللي بتدرّسها فيه', sj)), actions: [{ label: 'ربط', onClick: async () => { await POST(`/api/t/classes/${cs.value}/join`, { subjectId: +sj.value }); go('/t/classes'); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  root.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, 'فصولي'), readOnly() ? null : btn('+ ربط فصل بحسابي', () => safe(joinModal))));
  if (!classes.length) return root.append(card(empty('لسه مفيش فصول مربوطة. اربط فصل من الفصول اللي أضافها الأدمن.')));
  root.append(h('div', { class: 'grid g3' }, classes.map(c => h('div', { class: 'card', style: { cursor: 'pointer' }, onclick: () => go(`/t/class/${c.id}?subject=${c.subject_id}`) },
    h('h3', {}, c.name), h('div', { class: 'muted small' }, c.grade || ' '), h('div', { class: 'row', style: { marginTop: '.6rem' } }, chip(c.subject), chip(c.students + ' طالب', 'gray'),
      readOnly() ? null : btn('ترك', async e => { e.stopPropagation(); if (await confirmBox('تترك الفصل ده؟ التقييمات القديمة هتفضل محفوظة.')) { await safe(() => DEL(`/api/t/classes/${c.id}/leave/${c.subject_id}`)); navigate(); } }, 'ghost sm'))))));
}

async function teacherClass(root, [id], query) {
  const subject = +query.subject || undefined; let tab = query.tab || 'students';
  const c = await GET(`/api/t/classes/${id}` + (subject ? `?subject=${subject}` : ''));
  const sid = subject || (c.subjects[0] && c.subjects[0].id);
  const selected = new Set(); const body = h('div', {});
  const reload = () => { go(`/t/class/${id}?subject=${sid}&tab=${tab}`); navigate(); };
  const assignTo = (o) => go('/t/assign/new?' + qsOf({ class: id, subject: sid, ...o }));

  function groupMembersModal(g) {
    const sel = new Set(g ? g.students : [...selected]); const name = h('input', { type: 'text', dir: 'auto', value: g ? g.name : '' });
    const checks = h('div', { class: 'checks' }, c.students.map(s => h('label', {}, h('input', { type: 'checkbox', checked: sel.has(s.id), onchange: e => e.target.checked ? sel.add(s.id) : sel.delete(s.id) }), s.name)));
    modal({ title: g ? 'تعديل مجموعة' : 'مجموعة جديدة', body: h('div', {}, field('اسم المجموعة', name), checks), actions: [{ label: 'حفظ', onClick: async () => { g ? await PUT('/api/t/groups/' + g.id, { name: name.value, studentIds: [...sel] }) : await POST(`/api/t/classes/${id}/groups`, { name: name.value, studentIds: [...sel] }); reload(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }

  async function suggest() {
    const hm = await GET(`/api/t/classes/${id}/heatmap?subject=${sid}`); const S = hm.suggest;
    const nm = ids => ids.map(i => (c.students.find(s => s.id === i) || {}).name).filter(Boolean);
    const sets = [['يحتاجون دعم', S.support, 'bad'], ['متوسطون', S.mid, 'warn'], ['جاهزون للتحدي', S.challenge, 'ok']].filter(x => x[1].length);
    if (!sets.length) return toast('لسه مفيش بيانات إتقان كفاية — خلّي الطلاب يحلّوا تقييم الأول', 'err');
    modal({ title: 'مجموعات مقترحة حسب الإتقان', body: h('div', {}, h('p', { class: 'muted small' }, 'مبنية على متوسط إتقان كل طالب في المفاهيم. تقدر تعدّلها بعد الإنشاء.'), sets.map(([n, ids, k]) => h('div', { class: 'card', style: { marginBottom: '.6rem' } }, h('b', {}, n + ' '), chip(ids.length, k), h('div', { class: 'small muted', dir: 'auto' }, nm(ids).join('، '))))),
      actions: [{ label: 'إنشاء المجموعات', onClick: async () => { for (const [n, ids] of sets) await POST(`/api/t/classes/${id}/groups`, { name: n, studentIds: ids }); reload(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }

  async function drawStudents() {
    clear(body);
    const bar = h('div', { class: 'row', style: { marginBottom: '.8rem' } },
      h('span', { class: 'muted small grow' }, 'حدد طلاب بعينهم علشان تعمل لهم تقييم أو مجموعة'),
      readOnly() ? null : [btn('اقتراح مجموعات', () => safe(suggest), 'ghost sm'), btn('مجموعة من المحددين', () => selected.size ? groupMembersModal(null) : toast('حدد طلاب الأول', 'err'), 'ghost sm'), btn('تقييم للمحددين', () => selected.size ? assignTo({ students: [...selected].join(',') }) : toast('حدد طلاب الأول', 'err'), 'sm')]);
    const all = h('input', { type: 'checkbox', onchange: e => { selected.clear(); if (e.target.checked) c.students.forEach(s => selected.add(s.id)); drawStudents(); } });
    body.append(card(bar, table([all, 'الطالب', 'متوسط الإتقان'], c.students.map(s => [h('input', { type: 'checkbox', checked: selected.has(s.id), onchange: e => e.target.checked ? selected.add(s.id) : selected.delete(s.id) }), h('span', { dir: 'auto' }, s.name), h('div', { style: { minWidth: '150px' } }, scoreBar(s.avg))]))));
    body.append(h('h2', { style: { marginTop: '1.5rem' } }, 'المجموعات'));
    if (!c.groups.length) body.append(card(empty('مفيش مجموعات لسه. المجموعات بتخليك تدي كل مستوى تقييم مناسب له.')));
    c.groups.forEach(g => body.append(h('div', { class: 'card row', style: { justifyContent: 'space-between' } }, h('div', {}, h('h3', {}, g.name), h('div', { class: 'small muted', dir: 'auto' }, g.students.map(i => (c.students.find(s => s.id === i) || {}).name).filter(Boolean).join('، ') || 'فاضية')),
      readOnly() ? null : h('div', { class: 'row' }, btn('تقييم للمجموعة', () => assignTo({ groups: g.id }), 'sm'), btn('تعديل', () => groupMembersModal(g), 'ghost sm'), btn('حذف', async () => { if (await confirmBox('حذف المجموعة؟')) { await safe(() => DEL('/api/t/groups/' + g.id)); reload(); } }, 'ghost sm')))));
  }

  async function drawHeat() {
    clear(body).append(empty('بنحمّل...'));
    const hm = await GET(`/api/t/classes/${id}/heatmap?subject=${sid}`);
    clear(body);
    if (!hm.concepts.length) return body.append(card(empty('أضف أسئلة على مفاهيم المادة وخلّي الطلاب يحلّوها علشان تظهر الخريطة')));
    const weakFor = cid => hm.students.filter(s => s.scores[cid] !== undefined && s.scores[cid] < 60).map(s => s.id);
    const head = ['الطالب', ...hm.concepts.map(k => h('div', { dir: 'auto' }, k.name, readOnly() ? null : h('div', {}, btn('تقييم للضعاف', () => { const w = weakFor(k.id); w.length ? assignTo({ concepts: k.id, students: w.join(',') }) : toast('مفيش طلاب ضعاف في المفهوم ده', 'ok'); }, 'ghost sm', { style: { marginTop: '.3rem', fontSize: '.7rem', padding: '.1rem .4rem' } })))), 'المتوسط', 'واثق وغلط'];
    body.append(card(h('div', { class: 'row small', style: { marginBottom: '.6rem' } }, ['h1', 'h2', 'h3', 'h4', 'h0'].map((k, i) => h('span', { class: 'chip ' + k }, ['ضعيف', 'محتاج دعم', 'جيد', 'متقن', 'لسه'][i]))),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl heat' }, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, hm.students.map(s => h('tr', {}, h('td', { dir: 'auto' }, s.name), hm.concepts.map(k => h('td', { class: 'c ' + heatClass(s.scores[k.id]) }, s.scores[k.id] ?? '·')), h('td', { class: 'c' }, s.avg ?? '—'), h('td', { class: 'c' }, s.sureWrong ? chip(s.sureWrong, 'bad') : '—')))))),
      h('p', { class: 'muted small' }, '"واثق وغلط" = إجابات غلط اختار الطالب قبلها "متأكد" — دي أخطر الأفكار الخاطئة.')));
    const lists = [['محتاجون تدخل', hm.suggest.support, 'bad'], ['جاهزون للتحدي', hm.suggest.challenge, 'ok']];
    body.append(h('div', { class: 'grid g2', style: { marginTop: '1rem' } }, lists.map(([t, ids, k]) => card(h('h3', {}, t + ' '), ids.length ? h('div', { class: 'row' }, ids.map(i => chip(hm.students.find(s => s.id === i).name, k))) : h('span', { class: 'muted small' }, 'لا أحد حالياً'),
      ids.length && !readOnly() ? h('div', { style: { marginTop: '.6rem' } }, btn('اعمل تقييم لهم', () => assignTo({ students: ids.join(',') }), 'sm')) : null))));
  }

  const draw = () => { clear(root); root.append(
    h('div', { class: 'row', style: { marginBottom: '.6rem' } }, h('h1', { class: 'grow' }, `${c.name}`, c.grade ? h('span', { class: 'muted small' }, ` — ${c.grade}`) : null),
      c.subjects.length > 1 ? select(c.subjects.map(s => ({ value: s.id, label: s.name })), sid, v => { go(`/t/class/${id}?subject=${v}&tab=${tab}`); navigate(); }) : (c.subjects[0] ? chip(c.subjects[0].name) : null), btn('رجوع', () => go('/t/classes'), 'ghost sm')),
    tabs([['students', 'الطلاب والمجموعات'], ['heat', 'خريطة الإتقان']], tab, k => { tab = k; draw(); }), body);
    tab === 'heat' ? drawHeat() : drawStudents(); };
  draw();
}

/* ---------- بنك الأسئلة ---------- */
function conceptModal(c, subjects, concepts, done) {
  const sj = select(subjects.map(s => ({ value: s.id, label: s.name })), c ? c.subject_id : subjects[0].id), unit = h('input', { type: 'text', dir: 'auto', value: c ? c.unit : '' }), name = h('input', { type: 'text', dir: 'auto', value: c ? c.name : '' });
  const pre = select([{ value: '', label: 'بدون' }].concat(concepts.filter(x => !c || x.id !== c.id).map(x => ({ value: x.id, label: x.name }))), c ? c.prereq_id || '' : '');
  modal({ title: c ? 'تعديل مفهوم' : 'مفهوم جديد', body: h('div', {}, c ? null : field('المادة', sj), field('الوحدة', unit), field('اسم المفهوم', name), field('المفهوم السابق اللازم لفهمه (الطالب بيرجع له لو اتعثر)', pre)),
    actions: [{ label: 'حفظ', onClick: async () => { const b = { subject_id: +sj.value, unit: unit.value, name: name.value, prereq_id: pre.value || null }; c ? await PUT('/api/t/concepts/' + c.id, b) : await POST('/api/t/concepts', b); done(); } }, { label: 'إلغاء', kind: 'ghost' }] });
}

async function teacherBank(root) {
  const [subjects, concepts] = await Promise.all([GET('/api/t/subjects'), GET('/api/t/concepts')]);
  const F = { subject: '', concept: '', type: '', tier: '', q: '' }; const list = h('div', {});
  async function load() {
    const rows = await GET('/api/t/questions?' + qsOf(F)); clear(list);
    if (!rows.length) return list.append(card(empty('مفيش أسئلة بالفلتر ده')));
    list.append(card(table(['السؤال', 'النوع', 'المستوى', 'المفهوم', 'اتحلّ', 'من أول مرة', ''], rows.map(q => [
      h('div', { dir: 'auto', style: { maxWidth: '380px' } }, q.prompt.length > 90 ? q.prompt.slice(0, 90) + '…' : q.prompt), chip(TYPES[q.type], 'gray'), chip(TIER[q.tier], q.tier), h('span', { dir: 'auto' }, q.concept), q.uses || '—', q.first_try != null ? q.first_try + '%' : '—',
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, btn(readOnly() ? 'عرض' : 'تعديل', () => go('/t/question/' + q.id), 'ghost sm'),
        readOnly() ? null : [btn('نسخ', () => safe(async () => { const full = await GET('/api/t/questions/' + q.id); await POST('/api/t/questions', { ...full, hints: full.hints }); toast('تم النسخ', 'ok'); load(); }), 'ghost sm'),
        btn('حذف', async () => { if (await confirmBox('حذف السؤال؟ التقييمات القديمة هتفضل محفوظة.')) { await safe(() => DEL('/api/t/questions/' + q.id)); load(); } }, 'ghost sm')])]))));
  }
  function conceptsManager() {
    const draw = async () => { const cs = await GET('/api/t/concepts'); concepts.length = 0; cs.forEach(x => concepts.push(x)); clear(box);
      box.append(subjects.length ? table(['الوحدة', 'المفهوم', 'يسبقه', 'أسئلة', ''], cs.map(c => [c.unit || '—', h('span', { dir: 'auto' }, c.name), (cs.find(x => x.id === c.prereq_id) || {}).name || '—', c.qcount,
        readOnly() ? null : h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, btn('تعديل', () => conceptModal(c, subjects, cs, draw), 'ghost sm'), btn('حذف', async () => { if (await confirmBox('حذف المفهوم؟')) { await safe(() => DEL('/api/t/concepts/' + c.id)); draw(); } }, 'ghost sm'))])) : empty('لا توجد مواد')); };
    const box = h('div', {}); draw();
    modal({ title: 'المفاهيم', wide: true, body: h('div', {}, readOnly() ? null : btn('+ مفهوم جديد', () => conceptModal(null, subjects, concepts, draw), 'sm'), h('div', { class: 'sp' }), box), actions: [{ label: 'إغلاق', kind: 'ghost', onClick: () => { navigate(); } }] });
  }
  const sel = {
    subject: select(optList(subjects, 'كل المواد'), '', v => { F.subject = v; F.concept = ''; fillC(); load(); }),
    concept: h('select', { onchange: e => { F.concept = e.target.value; load(); } }),
    type: select([{ value: '', label: 'كل الأنواع' }].concat(Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v }))), '', v => { F.type = v; load(); }),
    tier: select([{ value: '', label: 'كل المستويات' }].concat(Object.entries(TIER).map(([k, v]) => ({ value: k, label: v }))), '', v => { F.tier = v; load(); }),
    q: h('input', { type: 'text', placeholder: 'بحث في نص السؤال', dir: 'auto', oninput: e => { F.q = e.target.value; clearTimeout(sel.t); sel.t = setTimeout(load, 300); } })
  };
  function fillC() { clear(sel.concept); sel.concept.append(h('option', { value: '' }, 'كل المفاهيم')); concepts.filter(c => !F.subject || c.subject_id == F.subject).forEach(c => sel.concept.append(h('option', { value: c.id }, c.name))); }
  fillC();
  root.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, 'بنك الأسئلة'), btn('المفاهيم', conceptsManager, 'ghost'), readOnly() ? null : btn('+ سؤال جديد', () => go('/t/question/new'))),
    h('div', { class: 'grid g4', style: { marginBottom: '1rem' } }, sel.subject, sel.concept, sel.type, sel.tier), h('div', { style: { marginBottom: '1rem' } }, sel.q), list);
  await load();
}

/* ---------- التقييمات ---------- */
async function teacherAssignments(root) {
  const rows = await GET('/api/t/assignments');
  root.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, 'التقييمات'), readOnly() ? null : btn('+ تقييم جديد', () => go('/t/assign/new'))));
  if (!rows.length) return root.append(card(empty('لسه مفيش تقييمات')));
  root.append(card(table(['التقييم', 'الفصل', 'المستهدفون', 'النمط', 'التقدم', ''], rows.map(a => [
    h('div', {}, h('b', { dir: 'auto' }, a.title), h('div', { class: 'small muted' }, fmtDate(a.created_at))), a.class_name + ' — ' + a.subject, a.target_desc, chip(a.mode === 'adaptive' ? 'تكيّفي' : 'ثابت', a.mode === 'adaptive' ? 'stretch' : 'core'),
    h('div', { style: { minWidth: '140px' } }, scoreBar(a.total ? Math.round(100 * a.finished / a.total) : 0), h('div', { class: 'small muted' }, `${a.finished} خلّص / ${a.started} بدأ / ${a.total}`)),
    h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, btn('النتائج', () => go('/t/assignment/' + a.id), 'sm'), readOnly() ? null : btn('حذف', async () => { if (await confirmBox('حذف التقييم؟')) { await safe(() => DEL('/api/t/assignments/' + a.id)); navigate(); } }, 'ghost sm'))]))));
}

async function assignNew(root, _p, query) {
  if (readOnly()) return root.append(card(empty('المشرف يتابع فقط')));
  const rows = await GET('/api/t/classes');
  if (!rows.length) return root.append(card(h('p', {}, 'اربط فصل بحسابك الأول.'), btn('فصولي', () => go('/t/classes'))));
  const ids = k => new Set((query[k] || '').split(',').filter(Boolean).map(Number));
  const st = { cs: rows.find(r => r.id == query.class && (!query.subject || r.subject_id == query.subject)) || rows[0], target: query.students ? 'students' : query.groups ? 'groups' : 'class', students: ids('students'), groups: ids('groups'), mode: 'adaptive', concepts: ids('concepts'), qids: new Set(), opts: { confidence: false, stretch: true, retrieval: true }, size: 10, title: '', due: '' };
  let cls, concepts, questions;
  const loadClass = async () => { [cls, concepts, questions] = await Promise.all([GET(`/api/t/classes/${st.cs.id}?subject=${st.cs.subject_id}`), GET('/api/t/concepts'), GET(`/api/t/questions?subject=${st.cs.subject_id}`)]); concepts = concepts.filter(c => c.subject_id === st.cs.subject_id); };
  await loadClass();
  const wrap = h('div', { class: 'stack' });
  const chk = (set, id, label, extra) => h('label', {}, h('input', { type: 'checkbox', checked: set.has(id), onchange: e => { e.target.checked ? set.add(id) : set.delete(id); if (extra) extra(); } }), label);

  function draw() {
    clear(wrap);
    const title = h('input', { type: 'text', dir: 'auto', value: st.title, placeholder: 'مثال: مراجعة الروابط الكيميائية', oninput: e => st.title = e.target.value });
    const clsSel = select(rows.map(r => ({ value: r.id + ':' + r.subject_id, label: `${r.name} — ${r.subject}` })), st.cs.id + ':' + st.cs.subject_id, async v => { const [a, b] = v.split(':').map(Number); st.cs = rows.find(r => r.id === a && r.subject_id === b); st.students.clear(); st.groups.clear(); st.concepts.clear(); st.qids.clear(); await loadClass(); draw(); });
    wrap.append(card(h('h3', {}, '١. الأساسيات'), h('div', { class: 'grid g2' }, field('عنوان التقييم', title), field('الفصل والمادة', clsSel)), field('آخر موعد (اختياري)', h('input', { type: 'date', value: st.due, onchange: e => st.due = e.target.value }))));

    // المستهدفون
    const tBox = h('div', {});
    const drawT = () => { clear(tBox);
      if (st.target === 'groups') tBox.append(cls.groups.length ? h('div', { class: 'checks' }, cls.groups.map(g => chk(st.groups, g.id, `${g.name} (${g.students.length})`))) : h('p', { class: 'muted small' }, 'مفيش مجموعات في الفصل ده — اعملها من صفحة الفصل.'));
      if (st.target === 'students') tBox.append(h('div', { class: 'checks' }, cls.students.map(s => chk(st.students, s.id, h('span', { dir: 'auto' }, s.name, s.avg != null ? ` (${s.avg}%)` : '')))));
    };
    const radios = (name, opts, cur, on) => h('div', { class: 'checks', style: { marginBottom: '.6rem' } }, opts.map(([k, l]) => h('label', {}, h('input', { type: 'radio', name, checked: cur === k, onchange: () => on(k) }), l)));
    wrap.append(card(h('h3', {}, '٢. مين هيحل التقييم ده؟'), radios('t', [['class', `كل الفصل (${cls.students.length})`], ['groups', 'مجموعات'], ['students', 'طلاب محددين']], st.target, k => { st.target = k; drawT(); }), tBox)); drawT();

    // النمط
    const mBox = h('div', {});
    const drawM = () => { clear(mBox);
      if (st.mode === 'adaptive') {
        mBox.append(h('p', { class: 'muted small' }, 'اختار المفاهيم والمنصة بتختار لكل طالب الأسئلة المناسبة لمستواه (أساسي ← متوسط ← تحدي) وبترجّعه للمفهوم السابق لو اتعثر.'),
          h('div', { class: 'checks' }, concepts.map(c => c.qcount ? chk(st.concepts, c.id, h('span', { dir: 'auto' }, `${c.name} (${c.qcount})`)) : h('label', { style: { opacity: .5 } }, h('input', { type: 'checkbox', disabled: true }), h('span', { dir: 'auto' }, c.name + ' — مفيش أسئلة')))),
          h('div', { class: 'sp' }), h('div', { class: 'grid g3' }, field('عدد الأسئلة في الجلسة (8–12 مثالي)', h('input', { type: 'number', min: 3, max: 30, value: st.size, oninput: e => st.size = +e.target.value }))),
          h('div', { class: 'checks' },
            h('label', {}, h('input', { type: 'checkbox', checked: st.opts.stretch, onchange: e => st.opts.stretch = e.target.checked }), 'فعّل أسئلة التحدي للمتفوقين'),
            h('label', {}, h('input', { type: 'checkbox', checked: st.opts.retrieval, onchange: e => st.opts.retrieval = e.target.checked }), 'ابدأ بأسئلة استرجاع من مفاهيم قديمة ضعيفة'),
            h('label', {}, h('input', { type: 'checkbox', checked: st.opts.confidence, onchange: e => st.opts.confidence = e.target.checked }), 'اسأل الطالب: متأكد ولا مش متأكد؟')));
      } else {
        const count = h('b', {}, st.qids.size), cf = h('select', { onchange: () => fillQ() }, h('option', { value: '' }, 'كل المفاهيم'), concepts.map(c => h('option', { value: c.id }, c.name))), qbox = h('div', {});
        const fillQ = () => { clear(qbox).append(table(['', 'السؤال', 'النوع', 'المستوى'], questions.filter(q => !cf.value || q.concept_id == cf.value).map(q => [h('input', { type: 'checkbox', checked: st.qids.has(q.id), onchange: e => { e.target.checked ? st.qids.add(q.id) : st.qids.delete(q.id); count.textContent = st.qids.size; } }), h('span', { dir: 'auto' }, q.prompt.slice(0, 80)), chip(TYPES[q.type], 'gray'), chip(TIER[q.tier], q.tier)]))); };
        mBox.append(h('div', { class: 'row' }, cf, h('span', {}, 'المختار: ', count, ' سؤال')), h('div', { class: 'sp' }), qbox); fillQ();
      }
    };
    wrap.append(card(h('h3', {}, '٣. نمط التقييم'), radios('m', [['adaptive', 'تكيّفي — المنصة تختار الأسئلة لكل طالب'], ['fixed', 'ثابت — أنا أختار الأسئلة']], st.mode, k => { st.mode = k; drawM(); }), mBox)); drawM();
    wrap.append(h('div', { class: 'row' }, btn('نشر التقييم', () => safe(async () => {
      const b = { title: st.title, class_id: st.cs.id, subject_id: st.cs.subject_id, mode: st.mode, size: st.size, opts: st.opts, due: st.due || null, concept_ids: [...st.concepts], question_ids: [...st.qids], targets: { type: st.target, groupIds: [...st.groups], studentIds: [...st.students] } };
      const r = await POST('/api/t/assignments', b); toast(`تم نشر التقييم لـ ${r.students} طالب`, 'ok'); go('/t/assignment/' + r.id);
    }), 'big'), btn('إلغاء', () => history.back(), 'ghost')));
  }
  root.append(h('h1', {}, 'تقييم جديد'), wrap); draw();
}

async function assignmentResults(root, [id]) {
  const d = await GET(`/api/t/assignments/${id}/results`), a = d.assignment;
  const ST = { new: ['لم يبدأ', 'gray'], doing: ['جاري', 'warn'], done: ['خلّص', 'ok'] };
  root.append(
    h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('div', { class: 'grow' }, h('h1', { dir: 'auto' }, a.title), h('div', { class: 'muted small' }, `${a.target_desc} — ${a.mode === 'adaptive' ? 'تكيّفي' : 'ثابت'}`)), btn('رجوع', () => go('/t/assignments'), 'ghost')),
    h('div', { class: 'grid g4' }, stat(d.students.filter(s => s.status === 'done').length + ' / ' + d.students.length, 'خلّصوا'), stat(d.students.filter(s => s.status === 'doing').length, 'جاري'),
      stat(d.students.reduce((t, s) => t + s.sureWrong, 0), 'واثق وغلط'), stat(d.students.reduce((t, s) => t + s.hints, 0), 'تلميحات مستخدمة')),
    h('h2', { style: { marginTop: '1.5rem' } }, 'الطلاب'),
    card(table(['الطالب', 'الحالة', 'أسئلة', 'من أول مرة', 'متوسط المحاولات', 'تلميحات', 'واثق وغلط', 'مش متأكد وصح'], d.students.map(s => [h('span', { dir: 'auto' }, s.name), chip(...ST[s.status]), s.answered, s.firstTry != null ? s.firstTry + '%' : '—', s.avgTries ?? '—', s.hints || '—', s.sureWrong ? chip(s.sureWrong, 'bad') : '—', s.unsureRight ? chip(s.unsureRight, 'warn') : '—']))),
    h('h2', { style: { marginTop: '1.5rem' } }, 'الأسئلة (الأصعب أولاً)'),
    d.questions.length ? h('div', { class: 'stack' }, d.questions.map(q => card(h('div', { class: 'row' }, h('div', { class: 'grow', dir: 'auto' }, q.prompt), chip(TYPES[q.type], 'gray'), chip(q.firstTry + '% من أول مرة', q.firstTry < 50 ? 'bad' : q.firstTry < 75 ? 'warn' : 'ok'), chip(q.n + ' طالب', 'gray'), q.sureWrong ? chip('واثق وغلط: ' + q.sureWrong, 'bad') : null),
      q.wrongAnswers.length ? h('div', { style: { marginTop: '.6rem' } }, h('div', { class: 'small muted' }, 'أكتر إجابات خاطئة:'), q.wrongAnswers.map(w => h('div', { class: 'small', dir: 'auto' }, `${w.n} × `, h('b', {}, w.label), w.note ? ' — ' + w.note : ''))) : null))) : card(empty('لسه مفيش إجابات')),
    d.open.length ? h('div', {}, h('h2', { style: { marginTop: '1.5rem' } }, 'إجابات مفتوحة للمراجعة'), h('div', { class: 'stack' }, d.open.map(o => { const fb = h('textarea', { dir: 'auto', style: { minHeight: '60px' }, value: o.feedback || '', placeholder: 'اكتب ملاحظتك للطالب...' }); return card(h('div', { class: 'small muted', dir: 'auto' }, o.prompt), h('p', {}, h('b', {}, o.student + ': '), span(o.text)), o.model ? h('div', { class: 'fb info', style: { margin: '0 0 .6rem' } }, h('b', {}, 'النموذجية: '), span(o.model)) : null, readOnly() ? (o.feedback ? h('p', {}, 'ملاحظة: ' + o.feedback) : null) : [fb, btn('حفظ الملاحظة', () => safe(async () => { await PUT(`/api/t/responses/${o.id}/feedback`, { feedback: fb.value }); toast('تم', 'ok'); }), 'sm')]); }))) : null);
}
