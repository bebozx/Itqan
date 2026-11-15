/* ===== واجهة الطالب ===== */
async function studentHome(root) {
  const d = await GET('/api/s/home');
  const todo = d.assignments.filter(a => a.status !== 'done'), done = d.assignments.filter(a => a.status === 'done');
  const start = async a => safe(async () => { const r = await POST(`/api/s/assignments/${a.id}/start`); go('/s/play/' + r.id); });
  const practice = (body = {}) => safe(async () => { const r = await POST('/api/s/practice/start', body); go('/s/play/' + r.id); });

  const asCard = a => h('div', { class: 'card row', style: { justifyContent: 'space-between' } },
    h('div', {}, h('h3', { dir: 'auto' }, a.title), h('div', { class: 'muted small' }, `${a.subject} — ${a.teacher}`, a.due ? ` — آخر موعد ${a.due}` : '')),
    h('div', { class: 'row' }, a.status === 'doing' ? chip(`${a.done} / ${a.total}`, 'warn') : null,
      btn(a.status === 'doing' ? 'كمّل' : a.status === 'done' ? 'مرة تانية' : 'ابدأ', () => start(a), a.status === 'done' ? 'ghost' : '')));

  const bySubject = {};
  d.mastery.forEach(m => (bySubject[m.subject] ||= []).push(m));

  root.append(
    h('h1', {}, `أهلاً ${App.me.name.split(' ')[0]}`),
    h('p', { class: 'muted' }, 'مفيش درجات هنا. كل غلطة فرصة تراجع وتفهم، وجرّب براحتك.'),
    h('div', { class: 'grid g4' }, stat(d.stats.points || 0, 'نقطة جهد'), stat(d.stats.streak || 0, 'يوم متتالي'), stat(d.due, 'مفاهيم محتاجة مراجعة'), stat(d.mastery.filter(m => m.score >= 85).length, 'مفهوم متقن')),
    h('div', { class: 'sp' }),
    d.due ? h('div', { class: 'card row', style: { justifyContent: 'space-between', background: 'var(--blue-soft)', borderColor: '#C3CFFB' } },
      h('div', {}, h('h3', {}, 'مراجعة اليوم'), h('div', { class: 'muted small' }, 'استرجع الأساسيات اللي محتاجة تثبيت — 5 دقايق بس')), btn('ابدأ المراجعة', () => practice(), 'big')) : null,
    h('h2', { style: { marginTop: '1.5rem' } }, 'مطلوب منك'),
    todo.length ? h('div', { class: 'stack' }, todo.map(asCard)) : card(empty('مفيش تقييمات جديدة دلوقتي')),
    done.length ? h('div', {}, h('h2', { style: { marginTop: '1.5rem' } }, 'خلّصتها'), h('div', { class: 'stack' }, done.map(asCard))) : null,
    d.feedback.length ? h('div', {}, h('h2', { style: { marginTop: '1.5rem' } }, 'ملاحظات من معلمك'), h('div', { class: 'stack' }, d.feedback.map(f => card(h('div', { class: 'muted small', dir: 'auto' }, f.prompt), h('p', { dir: 'auto' }, f.feedback))))) : null,
    h('h2', { style: { marginTop: '1.5rem' } }, 'إتقانك للمفاهيم'),
    Object.keys(bySubject).length ? h('div', { class: 'stack' }, Object.entries(bySubject).map(([s, list]) => card(h('h3', {}, s),
      table(['المفهوم', 'الإتقان', ''], list.map(m => [h('span', { dir: 'auto' }, (m.unit ? m.unit + ' › ' : '') + m.name), h('div', { style: { minWidth: '140px' } }, scoreBar(m.score)), btn('تدرّب', () => practice({ concept_id: m.id }), 'ghost sm')]))))) : card(empty('ابدأ أول تقييم وهتظهر مفاهيمك هنا')),
    d.badges.length ? h('div', {}, h('h2', { style: { marginTop: '1.5rem' } }, 'شاراتك'), h('div', { class: 'row' }, d.badges.map(b => chip('★ ' + b.label, 'ok')))) : null);
}

async function playView(root, [attemptId], _q) {
  const stage = h('div', { class: 'player' }); root.className = ''; root.append(stage);
  const exit = () => go('/s');
  let advanceTimer = null;

  async function load() {
    clearTimeout(advanceTimer);
    const d = await GET(`/api/s/attempts/${attemptId}/next`);
    d.done ? summary(d.summary) : question(d);
  }

  function question(d) {
    const q = d.question; let tries = d.resp.tries, hintsShown = d.hintTexts.length, solved = false;
    const pct = d.progress.total ? Math.round(100 * d.progress.done / d.progress.total) : 0;
    const fb = h('div', {}), hintBox = h('div', {}), tools = h('div', { class: 'qfoot' });
    const body = h('div', { class: 'qbody' + (d.askConfidence ? ' gated' : '') });
    const card = h('div', { class: 'qcard' });

    const hintBtn = h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => {
      const r = await safe(() => POST(`/api/s/attempts/${attemptId}/hint`, { level: hintsShown + 1 })); if (!r) return;
      hintsShown = r.level; hintBox.append(h('div', { class: 'fb hint' }, h('b', {}, `تلميح ${r.level}: `), span(r.text))); updTools();
    } }, 'تلميح');
    const revealBtn = h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => {
      if (!await confirmBox('هنوريك الإجابة الصحيحة وهنرجّعلك السؤال ده بعد شوية تحاول فيه تاني. تكمل؟', 'أظهر الإجابة')) return;
      const r = await safe(() => POST(`/api/s/attempts/${attemptId}/reveal`)); if (!r) return;
      lock(); clear(fb).append(h('div', { class: 'fb info' }, h('b', {}, 'الإجابة الصحيحة: '), span(r.text))); finish(r.explanation, null, true);
    } }, 'أظهر الإجابة');
    function updTools() {
      hintBtn.style.display = hintsShown < d.hintTotal ? '' : 'none'; hintBtn.textContent = `تلميح (${hintsShown + 1}/${d.hintTotal})`;
      revealBtn.style.display = !solved && tries >= 3 && q.type !== 'open' ? '' : 'none';
    }
    const lock = () => { solved = true; body.style.pointerEvents = 'none'; hintBtn.style.display = revealBtn.style.display = 'none'; };

    function finish(expl, model, revealed) {
      card.classList.add('solved');
      const nextBtn = h('button', { class: 'btn big ok', type: 'button', onclick: () => load() }, 'التالي ←');
      if (expl) hintBox.append(h('div', { class: 'fb info' }, h('b', {}, 'الشرح: '), span(expl)));
      clear(tools).append(nextBtn);
      nextBtn.focus();
      if (!expl && !model && !revealed) advanceTimer = setTimeout(load, 1100);
    }
    const ctx = {
      progress: d.resp.progress, placed: d.placed,
      check: a => POST(`/api/s/attempts/${attemptId}/check`, { answer: a }),
      onResult: res => {
        tries = res.tries; updTools(); clear(fb);
        const msg = res.partial ? 'اللي اخترته صح لكن لسه ناقص — كمّل.' : res.wrong ? 'مش دي. ارجع للكتاب وراجع المفهوم وجرّب تاني — مفيش حد بيحسب عليك.' : '';
        fb.append(h('div', { class: 'fb bad' }, msg, res.note ? h('div', { dir: 'auto', style: { marginTop: msg ? '.3rem' : 0 } }, res.note) : null));
      },
      onDone: res => {
        lock(); clear(fb);
        const msgs = ['تمام!', 'برافو!', 'صح كده!', 'ممتاز!'];
        fb.append(h('div', { class: 'fb ok', style: { display: 'flex', gap: '.6rem', alignItems: 'center' } }, h('span', { class: 'stamp' }, '✓'), msgs[Math.floor(Math.random() * msgs.length)], res.mastery != null ? h('span', { class: 'small muted' }, `  إتقان المفهوم ${res.mastery}%`) : null));
        finish(res.explanation, res.model, false);
      }
    };
    body.append(renderQuestion(q, ctx));

    const conf = d.askConfidence ? h('div', { class: 'conf' }, h('b', {}, 'قبل ما تجاوب: حاسس إنك'),
      btn('متأكد', async () => { await POST(`/api/s/attempts/${attemptId}/confidence`, { value: 'sure' }); conf.remove(); body.classList.remove('gated'); }, 'ghost sm'),
      btn('مش متأكد', async () => { await POST(`/api/s/attempts/${attemptId}/confidence`, { value: 'unsure' }); conf.remove(); body.classList.remove('gated'); }, 'ghost sm')) : null;

    tools.append(hintBtn, revealBtn); updTools();
    card.append(h('div', { class: 'qhead' }, h('div', { class: 'row' }, chip(TIER[q.tier], q.tier)), h('h2', { dir: 'auto' }, q.prompt)), conf, body, fb, hintBox, tools);
    clear(stage).append(
      h('div', { class: 'pbar' }, btn('✕', exit, 'ghost sm', { 'aria-label': 'خروج (تقدمك محفوظ)' }), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } })), h('span', { class: 'small muted' }, `${d.progress.done} / ${d.progress.total}`)), card);
    hintsShown && d.hintTexts.forEach((t, i) => hintBox.append(h('div', { class: 'fb hint' }, h('b', {}, `تلميح ${i + 1}: `), span(t))));
  }

  function summary(s) {
    clear(stage).append(h('div', { class: 'card center' },
      h('div', { class: 'stamp', style: { width: '3rem', height: '3rem', fontSize: '1.6rem' } }, '✓'), h('h1', { style: { marginTop: '.8rem' } }, 'خلّصت الجلسة'),
      h('div', { class: 'grid g3', style: { margin: '1rem 0' } }, stat(s.answered, 'سؤال'), stat(s.firstTry, 'من أول مرة'), stat('+' + s.points, 'نقطة')),
      s.concepts.length ? h('div', { style: { textAlign: 'start' } }, h('h3', {}, 'إتقانك بعد الجلسة'), table(['المفهوم', 'الإتقان'], s.concepts.map(c => [h('span', { dir: 'auto' }, c.name), scoreBar(c.score)]))) : null,
      h('div', { class: 'sp' }), btn('رجوع للرئيسية', exit, 'big')));
  }

  await load();
}
