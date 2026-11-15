const { db, J, today, addDays } = require('./db');
const { pub, shuffle } = require('./grade');

const tierFor = (score, stretch) => score < 40 ? 'foundation' : (score < 75 || !stretch) ? 'core' : 'stretch';
const intervalDays = s => s < 40 ? 1 : s < 60 ? 2 : s < 80 ? 4 : s < 90 ? 7 : 14;
const getQ = id => db.prepare('SELECT * FROM questions WHERE id=?').get(id);
const getMastery = (sid, cid) => db.prepare('SELECT * FROM mastery WHERE student_id=? AND concept_id=?').get(sid, cid);

/* ---------- النقاط والاستمرارية ---------- */
function touchStreak(sid) {
  const t = today();
  const s = db.prepare('SELECT * FROM student_stats WHERE student_id=?').get(sid);
  if (!s) { db.prepare('INSERT INTO student_stats(student_id,points,streak,last_day) VALUES(?,0,1,?)').run(sid, t); return; }
  if (s.last_day === t) return;
  db.prepare('UPDATE student_stats SET streak=?, last_day=? WHERE student_id=?').run(s.last_day === addDays(-1) ? s.streak + 1 : 1, t, sid);
}
function addPoints(sid, n) {
  touchStreak(sid);
  if (n) db.prepare('UPDATE student_stats SET points=points+? WHERE student_id=?').run(n, sid);
}

/* ---------- الإتقان ---------- */
const quality = r => r.revealed ? 0 : (r.tries === 0 && r.hints === 0) ? 1 : (r.tries <= 1 && r.hints <= 1) ? 0.65 : 0.35;

function finishQuestion(resp, q) {
  const qual = quality(resp);
  const old = getMastery(resp.student_id, q.concept_id);
  const o = old ? old.score : 0;
  const n = Math.max(0, Math.min(100, o + (qual * 100 - o) * 0.4));
  db.prepare(`INSERT INTO mastery(student_id,concept_id,score,next_review,seen,updated_at) VALUES(?,?,?,?,1,datetime('now'))
    ON CONFLICT(student_id,concept_id) DO UPDATE SET score=excluded.score, next_review=excluded.next_review, seen=seen+1, updated_at=excluded.updated_at`)
    .run(resp.student_id, q.concept_id, n, addDays(intervalDays(n)));
  let pts = resp.revealed ? 0 : qual === 1 ? 10 : qual >= 0.6 ? 6 : 3;
  if (q.tier === 'stretch' && pts) pts = Math.round(pts * 1.5);
  addPoints(resp.student_id, pts);
  db.prepare('UPDATE responses SET points=? WHERE id=?').run(pts, resp.id);
  const cname = (db.prepare('SELECT name FROM concepts WHERE id=?').get(q.concept_id) || {}).name || '';
  const badge = (code, label) => { if (!db.prepare('SELECT 1 FROM badges WHERE student_id=? AND code=?').get(resp.student_id, code)) db.prepare('INSERT INTO badges(student_id,code,label) VALUES(?,?,?)').run(resp.student_id, code, label); };
  if (old && o < 50 && n >= 75) badge('comeback:' + q.concept_id, 'رجعت وأتقنت: ' + cname);
  else if (o < 85 && n >= 85) badge('master:' + q.concept_id, 'أتقنت: ' + cname);
  return { pts, score: Math.round(n) };
}

/* ---------- بناء الخطة ---------- */
const teachersOfStudent = (sid, subjectId) => db.prepare(
  `SELECT DISTINCT ct.teacher_id id FROM class_teachers ct JOIN class_students cs ON cs.class_id=ct.class_id WHERE cs.student_id=? ${subjectId ? 'AND ct.subject_id=?' : ''}`
).all(...(subjectId ? [sid, subjectId] : [sid])).map(r => r.id);

function weakConcepts(sid, subjectId, exclude, n) {
  if (n <= 0) return [];
  return db.prepare(`SELECT m.concept_id id FROM mastery m JOIN concepts c ON c.id=m.concept_id
    WHERE m.student_id=? AND c.subject_id=? AND (m.next_review<=? OR m.score<60) ORDER BY m.score ASC`)
    .all(sid, subjectId, today()).map(r => r.id).filter(id => !exclude.includes(id)).slice(0, n);
}

function buildAssignmentPlan(a, sid) {
  const opts = J(a.opts, {});
  const base = { retried: [], asked: [], doneCount: 0, current: null, stretch: opts.stretch !== false, teacherIds: [a.teacher_id] };
  if (a.mode === 'fixed') {
    const qs = db.prepare('SELECT question_id FROM assignment_questions WHERE assignment_id=? ORDER BY pos').all(a.id);
    return { ...base, queue: qs.map(r => ({ q: r.question_id })), total: qs.length };
  }
  const cids = J(a.concept_ids, []), size = a.size || 10;
  const weak = opts.retrieval ? weakConcepts(sid, a.subject_id, cids, Math.min(3, Math.floor(size * 0.3))) : [];
  const slots = weak.map(c => ({ c, tier: undefined }));
  for (let i = 0; slots.length < size; i++) slots.push({ c: cids[i % cids.length] });
  return { ...base, queue: slots, total: slots.length };
}

function buildReviewPlan(sid, subjectId, conceptId) {
  let slots;
  if (conceptId) slots = Array.from({ length: 6 }, () => ({ c: conceptId }));
  else {
    const rows = db.prepare(`SELECT m.concept_id id FROM mastery m JOIN concepts c ON c.id=m.concept_id
      WHERE m.student_id=? ${subjectId ? 'AND c.subject_id=?' : ''} AND (m.next_review<=? OR m.score<60) ORDER BY m.score ASC LIMIT 8`)
      .all(...(subjectId ? [sid, subjectId, today()] : [sid, today()]));
    slots = rows.map(r => ({ c: r.id }));
  }
  if (!slots.length) return null;
  const sub = subjectId || db.prepare('SELECT subject_id FROM concepts WHERE id=?').get(slots[0].c)?.subject_id;
  return { queue: slots, total: slots.length, retried: [], asked: [], doneCount: 0, current: null, stretch: true, teacherIds: teachersOfStudent(sid, sub), subject: sub };
}

/* ---------- اختيار السؤال التالي ---------- */
function pickQuestion(plan, sid, slot) {
  if (slot.q) { const q = getQ(slot.q); return q && !q.archived ? q : null; }
  const m = getMastery(sid, slot.c);
  const want = slot.tier || tierFor(m ? m.score : 0, plan.stretch);
  let order = want === 'foundation' ? ['foundation', 'core', 'stretch'] : want === 'core' ? ['core', 'foundation', 'stretch'] : ['stretch', 'core', 'foundation'];
  if (!plan.stretch) order = order.filter(t => t !== 'stretch');
  const history = new Set(db.prepare('SELECT DISTINCT question_id FROM responses WHERE student_id=? AND done=1').all(sid).map(r => r.question_id));
  const ids = plan.teacherIds && plan.teacherIds.length ? plan.teacherIds : [-1];
  for (const tier of order) {
    const cands = db.prepare(`SELECT * FROM questions WHERE concept_id=? AND tier=? AND archived=0 AND teacher_id IN (${ids.map(() => '?').join(',')})`)
      .all(slot.c, tier, ...ids).filter(q => !plan.asked.includes(q.id));
    if (!cands.length) continue;
    const fresh = cands.filter(q => !history.has(q.id));
    return shuffle(fresh.length ? fresh : cands)[0];
  }
  return null;
}

function afterDone(plan, resp, q) {
  plan.doneCount++; plan.current = null;
  const struggled = resp.tries >= 2 || resp.revealed || resp.hints >= 2;
  if (struggled && !plan.retried.includes(q.id)) {
    plan.retried.push(q.id);
    plan.queue.splice(Math.min(3, plan.queue.length), 0, { q: q.id }); plan.total++;
    const c = db.prepare('SELECT prereq_id FROM concepts WHERE id=?').get(q.concept_id);
    if ((resp.tries >= 3 || resp.revealed) && c && c.prereq_id) {
      const has = db.prepare(`SELECT 1 FROM questions WHERE concept_id=? AND archived=0 AND tier='foundation' LIMIT 1`).get(c.prereq_id);
      if (has) { plan.queue.unshift({ c: c.prereq_id, tier: 'foundation' }); plan.total++; }
    }
  }
}

const savePlan = (attId, plan) => db.prepare('UPDATE attempts SET plan=? WHERE id=?').run(JSON.stringify(plan), attId);

const HINT_DEFAULT = c => `ارجع للكتاب وراجع: ${c}. خد وقتك وبعدين جرّب تاني.`;
function hintList(q) {
  const cname = (db.prepare('SELECT name FROM concepts WHERE id=?').get(q.concept_id) || {}).name || 'المفهوم';
  const custom = J(q.hints, []).filter(Boolean);
  const list = [custom[0] || HINT_DEFAULT(cname)];
  if (custom[1]) list.push(custom[1]);
  if (q.explanation) list.push('الشرح: ' + q.explanation);
  return list;
}

function payload(att, plan, resp) {
  const q = getQ(resp.question_id);
  const a = att.assignment_id ? db.prepare('SELECT opts FROM assignments WHERE id=?').get(att.assignment_id) : null;
  const askConfidence = !!(a && J(a.opts, {}).confidence) && !resp.confidence && q.type !== 'open';
  const hl = hintList(q);
  return {
    done: false, question: pub(q),
    resp: { id: resp.id, tries: resp.tries, hints: resp.hints, progress: J(resp.progress, []), confidence: resp.confidence },
    hintTexts: hl.slice(0, resp.hints), hintTotal: hl.length, askConfidence,
    progress: { done: plan.doneCount, total: plan.total },
    placed: q.type === 'sort' ? J(resp.progress, []).map(i => [i, J(q.data, {}).items[i].cat]) : undefined
  };
}

function next(att) {
  const plan = J(att.plan, {});
  if (plan.current) {
    const r = db.prepare('SELECT * FROM responses WHERE id=?').get(plan.current);
    if (r && !r.done) return payload(att, plan, r);
  }
  while (plan.queue.length) {
    const slot = plan.queue.shift();
    const q = pickQuestion(plan, att.student_id, slot);
    if (!q) { plan.total = Math.max(plan.doneCount, plan.total - 1); continue; }
    const id = db.prepare('INSERT INTO responses(attempt_id,student_id,question_id,concept_id) VALUES(?,?,?,?)').run(att.id, att.student_id, q.id, q.concept_id).lastInsertRowid;
    plan.asked.push(q.id); plan.current = id; savePlan(att.id, plan);
    return payload(att, plan, db.prepare('SELECT * FROM responses WHERE id=?').get(id));
  }
  savePlan(att.id, plan);
  if (!att.finished_at) {
    db.prepare(`UPDATE attempts SET finished_at=datetime('now') WHERE id=?`).run(att.id);
    if (plan.doneCount) addPoints(att.student_id, 20);
  }
  const rows = db.prepare('SELECT * FROM responses WHERE attempt_id=? AND done=1').all(att.id);
  const concepts = [...new Set(rows.map(r => r.concept_id))].map(cid => ({
    id: cid, name: db.prepare('SELECT name FROM concepts WHERE id=?').get(cid).name, score: Math.round((getMastery(att.student_id, cid) || {}).score || 0)
  }));
  return {
    done: true,
    summary: {
      answered: rows.length, firstTry: rows.filter(r => !r.tries && !r.hints && !r.revealed).length,
      points: rows.reduce((s, r) => s + r.points, 0) + (plan.doneCount ? 20 : 0), concepts
    }
  };
}

module.exports = { getQ, getMastery, finishQuestion, buildAssignmentPlan, buildReviewPlan, next, afterDone, savePlan, hintList, payload, addPoints, tierFor };
