/* ===== لوحة الأدمن ===== */
const ROLE_AR = { admin: 'أدمن', supervisor: 'مشرف مادة', teacher: 'معلم', student: 'طالب' };

async function adminHome(root) {
  const o = await GET('/api/a/overview');
  root.append(h('h1', {}, 'لوحة التحكم'),
    h('div', { class: 'grid g4' }, stat(o.students, 'طالب'), stat(o.teachers, 'معلم'), stat(o.supervisors, 'مشرف مادة'), stat(o.classes, 'فصل'), stat(o.subjects, 'مادة'), stat(o.questions, 'سؤال'), stat(o.assignments, 'تقييم')),
    h('h2', { style: { marginTop: '1.5rem' } }, 'ابدأ من هنا'),
    h('div', { class: 'grid g3' },
      card(h('h3', {}, '١. المواد'), h('p', { class: 'muted small' }, 'أضف المواد الدراسية.'), btn('المواد', () => go('/admin/subjects'), 'ghost sm')),
      card(h('h3', {}, '٢. المعلمون والمشرفون'), h('p', { class: 'muted small' }, 'أنشئ الحسابات واربطها بالمواد.'), btn('المستخدمون', () => go('/admin/users'), 'ghost sm')),
      card(h('h3', {}, '٣. الفصول والطلاب'), h('p', { class: 'muted small' }, 'أنشئ الفصل، أضف الطلاب (جماعي)، واربط المعلمين.'), btn('الفصول', () => go('/admin/classes'), 'ghost sm'))));
}

async function adminSubjects(root) {
  const list = await GET('/api/a/subjects'), name = h('input', { type: 'text', dir: 'auto', placeholder: 'اسم المادة' });
  root.append(h('h1', {}, 'المواد'),
    card(h('div', { class: 'row' }, h('div', { class: 'grow' }, name), btn('+ إضافة مادة', () => safe(async () => { await POST('/api/a/subjects', { name: name.value }); navigate(); })))),
    h('div', { class: 'sp' }),
    list.length ? card(table(['المادة', ''], list.map(s => [h('span', { dir: 'auto' }, s.name), h('div', { class: 'row' }, btn('تعديل', () => { const n = h('input', { type: 'text', dir: 'auto', value: s.name }); modal({ title: 'تعديل المادة', body: field('الاسم', n), actions: [{ label: 'حفظ', onClick: async () => { await PUT('/api/a/subjects/' + s.id, { name: n.value }); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] }); }, 'ghost sm'),
      btn('حذف', async () => { if (await confirmBox('حذف المادة؟')) { await safe(() => DEL('/api/a/subjects/' + s.id)); navigate(); } }, 'ghost sm'))]))) : card(empty('لسه مفيش مواد')));
}

async function adminUsers(root, _p, query) {
  const role = query.role || 'teacher';
  const [users, subjects, classes] = await Promise.all([GET('/api/a/users?role=' + role), GET('/api/a/subjects'), GET('/api/a/classes')]);
  const needSubj = role === 'teacher' || role === 'supervisor';
  const subjChecks = set => h('div', { class: 'checks' }, subjects.map(s => h('label', {}, h('input', { type: 'checkbox', checked: set.has(s.id), onchange: e => e.target.checked ? set.add(s.id) : set.delete(s.id) }), s.name)));

  function addModal() {
    const name = h('input', { type: 'text', dir: 'auto' }), un = h('input', { type: 'text', dir: 'ltr', placeholder: 'اتركه فاضي للتوليد التلقائي' }), pw = h('input', { type: 'text', dir: 'ltr', placeholder: 'اتركه فاضي للتوليد التلقائي' }), sub = new Set();
    modal({ title: 'إضافة ' + ROLE_AR[role], body: h('div', {}, field('الاسم', name), field('اسم المستخدم', un), field('كلمة المرور', pw), needSubj ? field('المواد', subjChecks(sub)) : null),
      actions: [{ label: 'إضافة', onClick: async () => { const u = await POST('/api/a/users', { role, name: name.value, username: un.value, password: pw.value, subjects: [...sub] }); showCreds([u]); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  function bulkModal() {
    const ta = h('textarea', { dir: 'auto', style: { minHeight: '180px' }, placeholder: 'اسم في كل سطر\nأو: الاسم, اسم المستخدم, كلمة المرور' }), sub = new Set();
    const cls = select([{ value: '', label: 'بدون فصل' }].concat(classes.map(c => ({ value: c.id, label: c.name }))), '');
    modal({ title: 'إضافة جماعية — ' + ROLE_AR[role], body: h('div', {}, field('الأسماء (اسم في كل سطر)', ta), role === 'student' ? field('أضفهم للفصل', cls) : null, needSubj ? field('المواد', subjChecks(sub)) : null, h('p', { class: 'muted small' }, 'لو مكتبتش اسم مستخدم وكلمة مرور هيتولّدوا تلقائياً وهيظهروا لك في جدول تقدر تنزّله.')),
      actions: [{ label: 'إنشاء', onClick: async () => { const out = await POST('/api/a/users/bulk', { role, names: ta.value, classId: cls.value || null, subjects: [...sub] }); showCreds(out); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  function editModal(u) {
    const name = h('input', { type: 'text', dir: 'auto', value: u.name }), sub = new Set(u.subjects.map(s => s.id));
    modal({ title: 'تعديل ' + u.name, body: h('div', {}, field('الاسم', name), needSubj ? field('المواد', subjChecks(sub)) : null), actions: [{ label: 'حفظ', onClick: async () => { await PUT('/api/a/users/' + u.id, { name: name.value, subjects: needSubj ? [...sub] : undefined }); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  const q = h('input', { type: 'text', placeholder: 'بحث بالاسم أو اسم المستخدم', dir: 'auto', value: query.q || '', onkeydown: e => { if (e.key === 'Enter') go(`/admin/users?role=${role}&q=${encodeURIComponent(e.target.value)}`); } });
  const rows = query.q ? users.filter(u => (u.name + u.username).includes(query.q)) : users;
  root.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, 'المستخدمون'), btn('+ إضافة', addModal), btn('إضافة جماعية', bulkModal, 'ghost')),
    tabs(Object.entries(ROLE_AR).map(([k, v]) => [k, v]), role, k => go('/admin/users?role=' + k)), h('div', { style: { marginBottom: '1rem' } }, q),
    rows.length ? card(table(['الاسم', 'اسم المستخدم', needSubj ? 'المواد' : role === 'student' ? 'الفصول' : '', 'الحالة', ''], rows.map(u => [h('span', { dir: 'auto' }, u.name), h('b', { dir: 'ltr' }, u.username),
      needSubj ? h('div', { class: 'row' }, u.subjects.map(s => chip(s.name))) : role === 'student' ? h('div', { class: 'row' }, u.classes.map(c => chip(c.name, 'gray'))) : '', u.active ? chip('نشط', 'ok') : chip('موقوف', 'bad'),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, btn('تعديل', () => editModal(u), 'ghost sm'),
        btn('كلمة مرور جديدة', async () => { if (await confirmBox(`إعادة تعيين كلمة مرور ${u.name}؟`, 'إعادة تعيين')) { const r = await safe(() => POST(`/api/a/users/${u.id}/reset`)); if (r) showCreds([r], 'كلمة المرور الجديدة'); } }, 'ghost sm'),
        btn(u.active ? 'إيقاف' : 'تفعيل', async () => { await safe(() => PUT('/api/a/users/' + u.id, { active: !u.active })); navigate(); }, 'ghost sm'))]))) : card(empty('لا يوجد مستخدمون')));
}

async function adminClasses(root) {
  const list = await GET('/api/a/classes');
  const name = h('input', { type: 'text', dir: 'auto', placeholder: 'اسم الفصل (مثال: 9-A)' }), grade = h('input', { type: 'text', dir: 'auto', placeholder: 'الصف (اختياري)' });
  root.append(h('h1', {}, 'الفصول'),
    card(h('div', { class: 'row' }, h('div', { class: 'grow' }, name), h('div', { class: 'grow' }, grade), btn('+ إضافة فصل', () => safe(async () => { await POST('/api/a/classes', { name: name.value, grade: grade.value }); navigate(); })))), h('div', { class: 'sp' }),
    list.length ? h('div', { class: 'grid g3' }, list.map(c => h('div', { class: 'card', style: { cursor: 'pointer' }, onclick: () => go('/admin/class/' + c.id) }, h('h3', {}, c.name), h('div', { class: 'muted small' }, c.grade || ' '), h('div', { class: 'row', style: { marginTop: '.5rem' } }, chip(c.students + ' طالب', 'gray'), c.teachers.map(t => chip(`${t.name} · ${t.subject}`)))))) : card(empty('لسه مفيش فصول')));
}

async function adminClass(root, [id]) {
  const [c, users, subjects] = await Promise.all([GET('/api/a/classes/' + id), GET('/api/a/users?role=student'), GET('/api/a/subjects')]);
  const teachers = await GET('/api/a/users?role=teacher');
  function bulk() {
    const ta = h('textarea', { dir: 'auto', style: { minHeight: '180px' }, placeholder: 'اسم كل طالب في سطر' });
    modal({ title: 'إضافة طلاب جدد للفصل', body: field('الأسماء', ta), actions: [{ label: 'إنشاء وإضافة', onClick: async () => { const out = await POST('/api/a/users/bulk', { role: 'student', names: ta.value, classId: +id }); showCreds(out); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  function addExisting() {
    const inClass = new Set(c.students.map(s => s.id)), sel = new Set(), box = h('div', { class: 'checks', style: { maxHeight: '300px', overflow: 'auto' } });
    const draw = f => { clear(box); users.filter(u => !inClass.has(u.id) && (!f || (u.name + u.username).includes(f))).forEach(u => box.append(h('label', {}, h('input', { type: 'checkbox', checked: sel.has(u.id), onchange: e => e.target.checked ? sel.add(u.id) : sel.delete(u.id) }), `${u.name} (${u.username})`))); };
    draw(); modal({ title: 'إضافة طلاب موجودين', body: h('div', {}, h('input', { type: 'text', placeholder: 'بحث', oninput: e => draw(e.target.value) }), h('div', { class: 'sp' }), box), actions: [{ label: 'إضافة', onClick: async () => { await POST(`/api/a/classes/${id}/students`, { ids: [...sel] }); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  function addTeacher() {
    const t = select(teachers.map(x => ({ value: x.id, label: `${x.name} — ${x.subjects.map(s => s.name).join('، ') || 'بلا مواد'}` })), teachers[0] && teachers[0].id), s = select(subjects.map(x => ({ value: x.id, label: x.name })), subjects[0] && subjects[0].id);
    modal({ title: 'ربط معلم بالفصل', body: h('div', {}, field('المعلم', t), field('المادة', s)), actions: [{ label: 'ربط', onClick: async () => { await POST(`/api/a/classes/${id}/teachers`, { teacherId: +t.value, subjectId: +s.value }); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  function rename() {
    const n = h('input', { type: 'text', dir: 'auto', value: c.name }), g = h('input', { type: 'text', dir: 'auto', value: c.grade });
    modal({ title: 'تعديل الفصل', body: h('div', {}, field('الاسم', n), field('الصف', g)), actions: [{ label: 'حفظ', onClick: async () => { await PUT('/api/a/classes/' + id, { name: n.value, grade: g.value }); navigate(); } }, { label: 'إلغاء', kind: 'ghost' }] });
  }
  root.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { class: 'grow' }, c.name, c.grade ? h('span', { class: 'muted small' }, ' — ' + c.grade) : null), btn('تعديل', rename, 'ghost sm'),
    btn('حذف الفصل', async () => { if (await confirmBox('حذف الفصل؟')) { await safe(() => DEL('/api/a/classes/' + id)); go('/admin/classes'); } }, 'ghost sm'), btn('رجوع', () => go('/admin/classes'), 'ghost sm')),
    card(h('div', { class: 'row', style: { marginBottom: '.6rem' } }, h('h3', { class: 'grow' }, 'المعلمون'), btn('+ ربط معلم', () => teachers.length ? addTeacher() : toast('أضف معلمين الأول', 'err'), 'sm')),
      c.teachers.length ? table(['المعلم', 'المادة', ''], c.teachers.map(t => [t.name, chip(t.subject), btn('فك الربط', async () => { await safe(() => DEL(`/api/a/classes/${id}/teachers/${t.id}/${t.subject_id}`)); navigate(); }, 'ghost sm')])) : empty('مفيش معلمين مربوطين')),
    h('div', { class: 'sp' }),
    card(h('div', { class: 'row', style: { marginBottom: '.6rem' } }, h('h3', { class: 'grow' }, `الطلاب (${c.students.length})`), btn('+ طلاب جدد (جماعي)', bulk, 'sm'), btn('إضافة طلاب موجودين', addExisting, 'ghost sm')),
      c.students.length ? table(['الطالب', 'اسم المستخدم', ''], c.students.map(s => [h('span', { dir: 'auto' }, s.name), h('b', { dir: 'ltr' }, s.username), btn('شيل من الفصل', async () => { await safe(() => DEL(`/api/a/classes/${id}/students/${s.id}`)); navigate(); }, 'ghost sm')])) : empty('مفيش طلاب')));
}
