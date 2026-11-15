const express = require('express');
const { db, J, today } = require('./db');
const { grade, solution } = require('./grade');
const E = require('./engine');

module.exports = ({ httpErr }) => {
  const r = express.Router();

  const myAttempt = (req) => {
    const att = db.prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(req.params.id, req.user.id);
    if (!att) throw httpErr(404, 'الجلسة غير موجودة');
    return att;
  };
  const currentResp = (att, plan) => {
    const resp = plan.current ? db.prepare('SELECT * FROM responses WHERE id=?').get(plan.current) : null;
    if (!resp || resp.done) throw httpErr(400, 'مفيش سؤال حالي');
    return resp;
  };

  r.get('/home', (req, res) => {
    const me = req.user.id;
    const assigns = db.prepare(`SELECT a.id,a.title,a.mode,a.due,a.subject_id,s.name subject,u.name teacher FROM assignment_students x
      JOIN assignments a ON a.id=x.assignment_id JOIN subjects s ON s.id=a.subject_id JOIN users u ON u.id=a.teacher_id
      WHERE x.student_id=? AND a.archived=0 ORDER BY a.id DESC`).all(me).map(a => {
      const att = db.prepare(`SELECT * FROM attempts WHERE assignment_id=? AND student_id=? ORDER BY id DESC LIMIT 1`).get(a.id, me);
      const plan = att ? J(att.plan, {}) : null;
      return { ...a, status: !att ? 'new' : att.finished_at ? 'done' : 'doing', done: plan ? plan.doneCount : 0, total: plan ? plan.total : null };
    });
    const mastery = db.prepare(`SELECT m.concept_id id,k.name,k.unit,k.subject_id,s.name subject,ROUND(m.score) score,m.next_review,m.seen FROM mastery m
      JOIN concepts k ON k.id=m.concept_id JOIN subjects s ON s.id=k.subject_id WHERE m.student_id=? ORDER BY s.name,k.unit,k.name`).all(me);
    const due = mastery.filter(m => m.next_review <= today() || m.score < 60).length;
    const stats = db.prepare('SELECT points,streak,last_day FROM student_stats WHERE student_id=?').get(me) || { points: 0, streak: 0 };
    const badges = db.prepare('SELECT label,at FROM badges WHERE student_id=? ORDER BY id DESC LIMIT 12').all(me);
    const feedback = db.prepare(`SELECT r.feedback, q.prompt FROM responses r JOIN questions q ON q.id=r.question_id WHERE r.student_id=? AND r.feedback IS NOT NULL ORDER BY r.id DESC LIMIT 5`).all(me);
    res.json({ assignments: assigns, mastery, due, stats, badges, feedback });
  });

  r.post('/assignments/:id/start', (req, res) => {
    const a = db.prepare(`SELECT a.* FROM assignments a JOIN assignment_students x ON x.assignment_id=a.id WHERE a.id=? AND x.student_id=? AND a.archived=0`).get(req.params.id, req.user.id);
    if (!a) throw httpErr(404, 'التقييم غير متاح');
    const open = db.prepare('SELECT id FROM attempts WHERE assignment_id=? AND student_id=? AND finished_at IS NULL ORDER BY id DESC LIMIT 1').get(a.id, req.user.id);
    if (open) return res.json({ id: open.id });
    const plan = E.buildAssignmentPlan(a, req.user.id);
    if (!plan.queue.length) throw httpErr(400, 'التقييم ده مفيهوش أسئلة متاحة');
    const id = db.prepare(`INSERT INTO attempts(assignment_id,student_id,subject_id,kind,plan) VALUES(?,?,?,'assignment',?)`).run(a.id, req.user.id, a.subject_id, JSON.stringify(plan)).lastInsertRowid;
    res.json({ id });
  });

  // مراجعة: المفاهيم المستحقة، أو التدرب على مفهوم بعينه
  r.post('/practice/start', (req, res) => {
    const { subject_id, concept_id } = req.body || {};
    const plan = E.buildReviewPlan(req.user.id, subject_id || null, concept_id || null);
    if (!plan) throw httpErr(400, 'مفيش حاجة مستحقة للمراجعة دلوقتي، عاش!');
    const id = db.prepare(`INSERT INTO attempts(assignment_id,student_id,subject_id,kind,plan) VALUES(NULL,?,?,'review',?)`).run(req.user.id, plan.subject || null, JSON.stringify(plan)).lastInsertRowid;
    res.json({ id });
  });

  r.get('/attempts/:id/next', (req, res) => res.json(E.next(myAttempt(req))));

  r.post('/attempts/:id/confidence', (req, res) => {
    const att = myAttempt(req), resp = currentResp(att, J(att.plan, {}));
    if (!['sure', 'unsure'].includes(req.body.value)) throw httpErr(400, 'قيمة غير صحيحة');
    db.prepare('UPDATE responses SET confidence=? WHERE id=?').run(req.body.value, resp.id); res.json({ ok: true });
  });

  r.post('/attempts/:id/hint', (req, res) => {
    const att = myAttempt(req), plan = J(att.plan, {}), resp = currentResp(att, plan);
    const q = E.getQ(resp.question_id), hl = E.hintList(q);
    const level = Math.min(Math.max(+req.body.level || resp.hints + 1, 1), hl.length);
    db.prepare('UPDATE responses SET hints=MAX(hints,?) WHERE id=?').run(level, resp.id);
    res.json({ level, text: hl[level - 1], total: hl.length });
  });

  const complete = (att, plan, resp, q, out) => {
    const fin = E.finishQuestion(db.prepare('SELECT * FROM responses WHERE id=?').get(resp.id), q);
    E.afterDone(plan, db.prepare('SELECT * FROM responses WHERE id=?').get(resp.id), q);
    E.savePlan(att.id, plan);
    out.points = fin.pts; out.mastery = fin.score;
  };

  r.post('/attempts/:id/check', (req, res) => {
    const att = myAttempt(req), plan = J(att.plan, {}), resp = currentResp(att, plan), q = E.getQ(resp.question_id);
    const g = grade(q, req.body.answer, J(resp.progress, []));
    const wrong = J(resp.wrong, []);
    if (g.wrong) wrong.push(g.label);
    const text = q.type === 'open' ? String((req.body.answer || {}).text || '').slice(0, 4000) : resp.text;
    db.prepare(`UPDATE responses SET progress=?, tries=tries+?, wrong=?, text=?, done=?, done_at=CASE WHEN ? THEN datetime('now') ELSE done_at END WHERE id=?`)
      .run(JSON.stringify(g.progress), g.wrong ? 1 : 0, JSON.stringify(wrong.slice(-30)), text, g.done ? 1 : 0, g.done ? 1 : 0, resp.id);
    const out = { done: g.done, wrong: g.wrong, parts: g.parts, note: g.note, progress: g.progress, partial: g.partial, model: g.model, tries: resp.tries + (g.wrong ? 1 : 0) };
    if (g.done) { out.explanation = q.explanation || null; complete(att, plan, resp, q, out); }
    res.json(out);
  });

  r.post('/attempts/:id/reveal', (req, res) => {
    const att = myAttempt(req), plan = J(att.plan, {}), resp = currentResp(att, plan), q = E.getQ(resp.question_id);
    if (q.type === 'open') throw httpErr(400, 'السؤال المفتوح ملوش إجابة نموذجية قبل الإرسال');
    db.prepare(`UPDATE responses SET revealed=1, done=1, done_at=datetime('now') WHERE id=?`).run(resp.id);
    const out = { text: solution(q), explanation: q.explanation || null };
    complete(att, plan, { ...resp, revealed: 1 }, q, out);
    res.json(out);
  });

  return r;
};
