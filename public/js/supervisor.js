/* ===== واجهة مشرف المادة ===== */
async function supHome(root) {
  if (App.viewAs) { App.viewAs = null; App.viewAsName = ''; renderShell(); return; }
  const subjects = await GET('/api/sv/overview');
  root.append(h('h1', {}, 'متابعة المادة'), h('p', { class: 'muted' }, 'تابع معلميك وتقدم الطلاب. دخولك على حسابات المعلمين للقراءة فقط.'));
  if (!subjects.length) return root.append(card(empty('لسه مفيش مواد مربوطة بحسابك — اطلب من الأدمن.')));
  subjects.forEach(s => {
    root.append(h('h2', { style: { marginTop: '1.5rem' } }, s.name),
      card(h('h3', {}, 'المعلمون'), s.teachers.length ? table(['المعلم', 'فصول', 'طلاب', 'أسئلة', 'تقييمات', 'آخر 14 يوم', 'إنجاز التقييمات', 'متوسط إتقان الطلاب', ''], s.teachers.map(t => [
        h('b', { dir: 'auto' }, t.name), t.classes, t.students, t.questions, t.assignments, t.recent ? chip(t.recent + ' جديد', 'ok') : chip('لا نشاط', 'warn'),
        h('div', { style: { minWidth: '110px' } }, scoreBar(t.completion)), h('div', { style: { minWidth: '110px' } }, scoreBar(t.avg)),
        btn('متابعة', () => { App.viewAs = t.id; App.viewAsName = t.name; go('/t/classes'); renderShell(); }, 'sm')])) : empty('مفيش معلمين في المادة دي')),
      h('div', { class: 'sp' }),
      card(h('h3', {}, 'متوسط إتقان الطلاب لكل مفهوم (الأضعف أولاً)'), s.concepts.length ? table(['المفهوم', 'الوحدة', 'عدد الطلاب', 'متوسط الإتقان'], s.concepts.map(c => [h('span', { dir: 'auto' }, c.name), c.unit || '—', c.students, h('div', { style: { minWidth: '160px' } }, scoreBar(c.avg))])) : empty('لسه مفيش بيانات إتقان')));
  });
}
