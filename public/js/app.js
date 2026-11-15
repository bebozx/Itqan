/* ===== الهيكل العام والتوجيه ===== */
const HOME = { admin: '/admin', supervisor: '/sup', teacher: '/t/classes', student: '/s' };
const NAV = {
  admin: [['لوحة التحكم', '/admin'], ['المستخدمون', '/admin/users'], ['الفصول', '/admin/classes', '/admin/class'], ['المواد', '/admin/subjects']],
  supervisor: [['نظرة عامة', '/sup']],
  teacher: [['فصولي', '/t/classes', '/t/class'], ['بنك الأسئلة', '/t/bank', '/t/question'], ['التقييمات', '/t/assignments', '/t/assign,/t/assignment']],
  student: [['الرئيسية', '/s']]
};

function renderLogin() {
  const user = h('input', { type: 'text', autocomplete: 'username', dir: 'ltr', autocapitalize: 'off' }), pass = h('input', { type: 'password', autocomplete: 'current-password', dir: 'ltr' }), err = h('p', { class: 'chip bad', style: { display: 'none' } });
  const submit = async () => {
    try { App.me = await POST('/api/login', { username: user.value, password: pass.value }); location.hash = '#' + HOME[App.me.role]; boot(); }
    catch (e) { err.textContent = e.message; err.style.display = 'inline-block'; }
  };
  const onEnter = e => { if (e.key === 'Enter') submit(); };
  user.addEventListener('keydown', onEnter); pass.addEventListener('keydown', onEnter);
  clear($('#app')).append(h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'logo' }, 'إتقان'), h('p', { class: 'muted' }, 'تدرّب، راجع، وتقدّم — من غير ضغط.'),
    field('اسم المستخدم', user), field('كلمة المرور', pass), err, h('div', { class: 'sp' }), h('button', { class: 'btn big', style: { width: '100%', justifyContent: 'center' }, type: 'button', onclick: submit }, 'دخول'))));
  user.focus();
}

function changePassword(force) {
  const o = h('input', { type: 'password', dir: 'ltr' }), n = h('input', { type: 'password', dir: 'ltr' });
  modal({ title: force ? 'غيّر كلمة المرور الافتراضية' : 'تغيير كلمة المرور', body: h('div', {}, field('كلمة المرور الحالية', o), field('كلمة المرور الجديدة', n)),
    actions: [{ label: 'حفظ', onClick: async () => { await POST('/api/change-password', { old: o.value, password: n.value }); App.me.must_change = 0; toast('تم تغيير كلمة المرور', 'ok'); } }, { label: force ? 'لاحقاً' : 'إلغاء', kind: 'ghost' }] });
}

function renderShell() {
  const me = App.me, role = App.viewAs ? 'teacher' : me.role;
  const nav = h('nav', { class: 'nav' }, NAV[role].map(([l, p, also]) => h('a', { href: '#' + p, 'data-p': p, 'data-also': also || '' }, l)));
  clear($('#app')).append(
    h('header', { class: 'topbar' }, h('a', { class: 'brand', href: '#' + HOME[me.role] }, 'إتقان', h('small', {}, ROLE_AR[me.role])), nav,
      h('div', { class: 'who' }, h('span', { dir: 'auto' }, me.name), h('button', { type: 'button', onclick: () => changePassword(false) }, 'كلمة المرور'), h('button', { type: 'button', onclick: async () => { await POST('/api/logout'); App.me = null; App.viewAs = null; location.hash = ''; renderLogin(); } }, 'خروج'))),
    App.viewAs ? h('div', { class: 'banner' }, h('b', {}, `بتتابع المعلم: ${App.viewAsName}`), h('span', { class: 'muted small' }, 'وضع القراءة فقط'), btn('رجوع للمشرف', () => { App.viewAs = null; go('/sup'); renderShell(); }, 'ghost sm')) : null,
    h('main', { id: 'view' }));
  navigate();
}

// ربط المسارات
route(/^\/?$/, root => { go(HOME[App.me.role]); });
route(/^\/admin$/, adminHome); route(/^\/admin\/subjects$/, adminSubjects); route(/^\/admin\/users$/, adminUsers); route(/^\/admin\/classes$/, adminClasses); route(/^\/admin\/class\/(\d+)$/, adminClass);
route(/^\/sup$/, supHome);
route(/^\/t\/classes$/, teacherClasses); route(/^\/t\/class\/(\d+)$/, teacherClass); route(/^\/t\/bank$/, teacherBank);
route(/^\/t\/question\/new$/, (root) => questionEditor(root, null)); route(/^\/t\/question\/(\d+)$/, (root, [id]) => questionEditor(root, +id));
route(/^\/t\/assignments$/, teacherAssignments); route(/^\/t\/assign\/new$/, assignNew); route(/^\/t\/assignment\/(\d+)$/, assignmentResults);
route(/^\/s$/, studentHome); route(/^\/s\/play\/(\d+)$/, playView);

async function boot() {
  if (!App.me) App.me = await GET('/api/me').catch(() => null);
  if (!App.me) return renderLogin();
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#' + HOME[App.me.role];
  renderShell();
  if (App.me.must_change) changePassword(true);
}
boot();
