const express = require('express');
const { db, J, tx } = require('./db');
const { pub, grade, validate } = require('./grade');

module.exports = ({ httpErr }) => {
  const r = express.Router();
  const TYPES = ['mcq', 'multi', 'tf', 'fill', 'wordbank', 'short', 'numeric', 'match', 'order', 'sort', 'error', 'open'];
  const TIERS = ['foundation', 'core', 'stretch'];
  const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate'];

  // المشرف يقرأ فقط وبيحدد المعلم بـ ?t=
  r.use((req, res, next) => {
    if (req.user.role === 'teacher') { req.tid = req.user.id; return next(); }
    if (req.method !== 'GET') return next(httpErr(403, 'المشرف يتابع فقط (قراءة)'));
    const t = +req.query.t;
    if (!t) return next(httpErr(400, 'حدد المعلم'));
    const ok = db.prepare('SELECT 1 FROM user_subjects a JOIN user_subjects b ON a.subject_id=b.subject_id WHERE a.user_id=? AND b.user_id=?').get(req.user.id, t);
    if (!ok) return next(httpErr(403, 'المعلم ده مش من معلميك'));
    req.tid = t; next();
  });

  const mySubjects = tid => db.prepare('SELECT s.id,s.name FROM user_subjects us JOIN subjects s ON s.id=us.subject_id WHERE us.user_id=? ORDER BY s.name').all(tid);
  const teachesClass = (tid, cid) => db.prepare('SELECT 1 FROM class_teachers WHERE teacher_id=? AND class_id=?').get(tid, cid);
  const needClass = (req, cid = req.params.id) => { if (!teachesClass(req.tid, cid)) throw httpErr(403, 'الفصل ده مش مربوط بحسابك'); };
  const ownQuestion = (tid, id) => { const q = db.prepare('SELECT * FROM questions WHERE id=? AND teacher_id=?').get(id, tid); if (!q) throw httpErr(404, 'السؤال غير موجود'); return q; };
  const ownAssignment = (tid, id) => { const a = db.prepare('SELECT * FROM assignments WHERE id=? AND teacher_id=?').get(id, tid); if (!a) throw httpErr(404, 'التقييم غير موجود'); return a; };
  const subjectOK = (tid, sid) => { if (!db.prepare('SELECT 1 FROM user_subjects WHERE user_id=? AND subject_id=?').get(tid, sid)) throw httpErr(400, 'المادة مش مربوطة بحسابك'); };

  r.get('/subjects', (req, res) => res.json(mySubjects(req.tid)));
  r.get('/who', (req, res) => res.json(db.prepare('SELECT id,name FROM users WHERE id=?').get(req.tid)));

  /* ---------- الفصول ---------- */
  r.get('/classes', (req, res) => res.json(db.prepare(
    `SELECT c.id,c.name,c.grade,s.id subject_id,s.name subject,(SELECT COUNT(*) FROM class_students WHERE class_id=c.id) students
     FROM class_teachers ct JOIN classes c ON c.id=ct.class_id JOIN subjects s ON s.id=ct.subject_id WHERE ct.teacher_id=? ORDER BY c.grade,c.name`).all(req.tid)));
  r.get('/classes/available', (req, res) => res.json(db.prepare(
    `SELECT c.id,c.name,c.grade,(SELECT COUNT(*) FROM class_students WHERE class_id=c.id) students FROM classes c ORDER BY c.grade,c.name`).all()));
  r.post('/classes/:id/join', (req, res) => {
    const sid = +req.body.subjectId; subjectOK(req.tid, sid);
    if (!db.prepare('SELECT 1 FROM classes WHERE id=?').get(req.params.id)) throw httpErr(404, 'الفصل غير موجود');
    db.prepare('INSERT OR IGNORE INTO class_teachers VALUES(?,?,?)').run(req.params.id, req.tid, sid); res.json({ ok: true });
  });
  r.delete('/classes/:id/leave/:sid', (req, res) => { db.prepare('DELETE FROM class_teachers WHERE class_id=? AND teacher_id=? AND subject_id=?').run(req.params.id, req.tid, req.params.sid); res.json({ ok: true }); });

  r.get('/classes/:id', (req, res) => {
    needClass(req);
    const c = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
    const subjects = db.prepare('SELECT s.id,s.name FROM class_teachers ct JOIN subjects s ON s.id=ct.subject_id WHERE ct.class_id=? AND ct.teacher_id=?').all(c.id, req.tid);
    const sid = +req.query.subject || subjects[0]?.id;
    c.subjects = subjects;
    c.students = db.prepare(`SELECT u.id,u.name,
        (SELECT ROUND(AVG(m.score)) FROM mastery m JOIN concepts k ON k.id=m.concept_id WHERE m.student_id=u.id AND k.subject_id=?) avg
      FROM class_students cs JOIN users u ON u.id=cs.student_id WHERE cs.class_id=? AND u.active=1 ORDER BY u.name`).all(sid, c.id);
    c.groups = db.prepare('SELECT * FROM student_groups WHERE class_id=? AND teacher_id=? ORDER BY id').all(c.id, req.tid)
      .map(g => ({ ...g, students: db.prepare('SELECT student_id FROM student_group_members WHERE group_id=?').all(g.id).map(x => x.student_id) }));
    res.json(c);
  });

  /* المجموعات */
  const saveGroup = (gid, name, ids, classId) => {
    db.prepare('DELETE FROM student_group_members WHERE group_id=?').run(gid);
    const ok = db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?');
    (ids || []).filter(s => ok.get(classId, s)).forEach(s => db.prepare('INSERT OR IGNORE INTO student_group_members VALUES(?,?)').run(gid, s));
  };
  r.post('/classes/:id/groups', (req, res) => {
    needClass(req);
    if (!String(req.body.name || '').trim()) throw httpErr(400, 'اسم المجموعة مطلوب');
    tx(() => {
      const gid = db.prepare('INSERT INTO student_groups(class_id,teacher_id,name) VALUES(?,?,?)').run(req.params.id, req.tid, req.body.name.trim()).lastInsertRowid;
      saveGroup(gid, req.body.name, req.body.studentIds, req.params.id);
    })();
    res.json({ ok: true });
  });
  r.put('/groups/:gid', (req, res) => {
    const g = db.prepare('SELECT * FROM student_groups WHERE id=? AND teacher_id=?').get(req.params.gid, req.tid);
    if (!g) throw httpErr(404, 'غير موجود');
    tx(() => { db.prepare('UPDATE student_groups SET name=? WHERE id=?').run(String(req.body.name || g.name).trim(), g.id); saveGroup(g.id, null, req.body.studentIds, g.class_id); })();
    res.json({ ok: true });
  });
  r.delete('/groups/:gid', (req, res) => {
    const g = db.prepare('SELECT * FROM student_groups WHERE id=? AND teacher_id=?').get(req.params.gid, req.tid);
    if (!g) throw httpErr(404, 'غير موجود');
    tx(() => { db.prepare('DELETE FROM student_group_members WHERE group_id=?').run(g.id); db.prepare('DELETE FROM student_groups WHERE id=?').run(g.id); })();
    res.json({ ok: true });
  });

  /* خريطة الإتقان + اقتراح المجموعات */
  r.get('/classes/:id/heatmap', (req, res) => {
    needClass(req);
    const subjectId = +req.query.subject;
    const students = db.prepare('SELECT u.id,u.name FROM class_students cs JOIN users u ON u.id=cs.student_id WHERE cs.class_id=? AND u.active=1 ORDER BY u.name').all(req.params.id);
    const concepts = db.prepare(`SELECT id,name,unit FROM concepts WHERE subject_id=? AND id IN (SELECT DISTINCT concept_id FROM questions WHERE teacher_id=? AND archived=0) ORDER BY unit,id`).all(subjectId, req.tid);
    const ms = db.prepare(`SELECT m.student_id,m.concept_id,m.score FROM mastery m JOIN class_students cs ON cs.student_id=m.student_id WHERE cs.class_id=?`).all(req.params.id);
    const sureWrong = db.prepare(`SELECT r.student_id, COUNT(*) n FROM responses r JOIN class_students cs ON cs.student_id=r.student_id JOIN concepts k ON k.id=r.concept_id
      WHERE cs.class_id=? AND k.subject_id=? AND r.confidence='sure' AND r.tries>0 GROUP BY r.student_id`).all(req.params.id, subjectId);
    const sw = Object.fromEntries(sureWrong.map(x => [x.student_id, x.n]));
    const cset = new Set(concepts.map(c => c.id));
    const out = students.map(s => {
      const scores = {}; ms.filter(m => m.student_id === s.id && cset.has(m.concept_id)).forEach(m => scores[m.concept_id] = Math.round(m.score));
      const vals = Object.values(scores);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      return { ...s, scores, avg, sureWrong: sw[s.id] || 0 };
    });
    const withData = out.filter(s => s.avg !== null);
    res.json({
      concepts, students: out,
      suggest: {
        support: withData.filter(s => s.avg < 50).map(s => s.id),
        mid: withData.filter(s => s.avg >= 50 && s.avg < 75).map(s => s.id),
        challenge: withData.filter(s => s.avg >= 75).map(s => s.id),
        new: out.filter(s => s.avg === null).map(s => s.id)
      }
    });
  });

  /* ---------- المفاهيم ---------- */
  r.get('/concepts', (req, res) => {
    const ids = mySubjects(req.tid).map(s => s.id); if (!ids.length) return res.json([]);
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.concept_id=c.id AND q.teacher_id=? AND q.archived=0) qcount FROM concepts c WHERE c.subject_id IN (${ids.map(() => '?').join(',')}) ORDER BY c.unit,c.name`).all(req.tid, ...ids);
    res.json(rows);
  });
  r.post('/concepts', (req, res) => {
    const b = req.body; subjectOK(req.tid, +b.subject_id);
    if (!String(b.name || '').trim()) throw httpErr(400, 'اسم المفهوم مطلوب');
    res.json({ id: db.prepare('INSERT INTO concepts(subject_id,unit,name,prereq_id,created_by) VALUES(?,?,?,?,?)').run(b.subject_id, (b.unit || '').trim(), b.name.trim(), b.prereq_id || null, req.tid).lastInsertRowid });
  });
  r.put('/concepts/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM concepts WHERE id=?').get(req.params.id); if (!c) throw httpErr(404, 'غير موجود'); subjectOK(req.tid, c.subject_id);
    if (+req.body.prereq_id === c.id) throw httpErr(400, 'المفهوم مينفعش يكون متطلب لنفسه');
    db.prepare('UPDATE concepts SET name=?, unit=?, prereq_id=? WHERE id=?').run(String(req.body.name || c.name).trim(), (req.body.unit ?? c.unit).trim(), req.body.prereq_id || null, c.id); res.json({ ok: true });
  });
  r.delete('/concepts/:id', (req, res) => {
    if (db.prepare('SELECT 1 FROM questions WHERE concept_id=?').get(req.params.id)) throw httpErr(400, 'المفهوم عليه أسئلة');
    db.prepare('UPDATE concepts SET prereq_id=NULL WHERE prereq_id=?').run(req.params.id);
    db.prepare('DELETE FROM concepts WHERE id=?').run(req.params.id); res.json({ ok: true });
  });

  /* ---------- بنك الأسئلة ---------- */
  r.get('/questions', (req, res) => {
    let sql = `SELECT q.id,q.type,q.tier,q.bloom,q.prompt,q.concept_id,q.subject_id,c.name concept,
      (SELECT COUNT(*) FROM responses x WHERE x.question_id=q.id AND x.done=1) uses,
      (SELECT ROUND(100.0*SUM(CASE WHEN x.tries=0 AND x.hints=0 AND x.revealed=0 THEN 1 ELSE 0 END)/COUNT(*)) FROM responses x WHERE x.question_id=q.id AND x.done=1) first_try
      FROM questions q JOIN concepts c ON c.id=q.concept_id WHERE q.teacher_id=? AND q.archived=0`;
    const p = [req.tid], f = req.query;
    if (f.subject) { sql += ' AND q.subject_id=?'; p.push(f.subject); }
    if (f.concept) { sql += ' AND q.concept_id=?'; p.push(f.concept); }
    if (f.type) { sql += ' AND q.type=?'; p.push(f.type); }
    if (f.tier) { sql += ' AND q.tier=?'; p.push(f.tier); }
    if (f.q) { sql += ' AND q.prompt LIKE ?'; p.push(`%${f.q}%`); }
    res.json(db.prepare(sql + ' ORDER BY q.id DESC LIMIT 500').all(...p));
  });
  r.get('/questions/:id', (req, res) => {
    const q = ownQuestion(req.tid, req.params.id);
    res.json({ ...q, data: J(q.data, {}), hints: J(q.hints, []) });
  });
  const readQuestion = (req, existing) => {
    const b = req.body;
    if (!TYPES.includes(b.type)) throw httpErr(400, 'نوع السؤال غير صحيح');
    const c = db.prepare('SELECT * FROM concepts WHERE id=?').get(b.concept_id);
    if (!c) throw httpErr(400, 'اختر المفهوم'); subjectOK(req.tid, c.subject_id);
    if (!String(b.prompt || '').trim()) throw httpErr(400, 'نص السؤال مطلوب');
    const err = validate(b.type, b.data); if (err) throw httpErr(400, err);
    return [c.subject_id, c.id, b.type, TIERS.includes(b.tier) ? b.tier : 'core', BLOOM.includes(b.bloom) ? b.bloom : 'understand', b.prompt.trim(), JSON.stringify(b.data), (b.explanation || '').trim(), JSON.stringify((b.hints || []).map(h => String(h).trim()).filter(Boolean).slice(0, 2))];
  };
  r.post('/questions', (req, res) => {
    const v = readQuestion(req);
    res.json({ id: db.prepare('INSERT INTO questions(teacher_id,subject_id,concept_id,type,tier,bloom,prompt,data,explanation,hints) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.tid, ...v).lastInsertRowid });
  });
  r.put('/questions/:id', (req, res) => {
    ownQuestion(req.tid, req.params.id);
    db.prepare('UPDATE questions SET subject_id=?,concept_id=?,type=?,tier=?,bloom=?,prompt=?,data=?,explanation=?,hints=? WHERE id=?').run(...readQuestion(req), req.params.id);
    res.json({ ok: true });
  });
  r.delete('/questions/:id', (req, res) => {
    ownQuestion(req.tid, req.params.id);
    db.prepare('UPDATE questions SET archived=1 WHERE id=?').run(req.params.id); res.json({ ok: true });
  });
  // معاينة بدون حفظ: السؤال اللي بيتكتب دلوقتي
  r.post('/preview', (req, res) => {
    const b = req.body, err = validate(b.type, b.data); if (err) throw httpErr(400, err);
    res.json(pub({ id: 0, type: b.type, tier: b.tier || 'core', prompt: b.prompt || '', concept_id: 0, data: b.data }));
  });
  r.post('/preview/check', (req, res) => {
    const b = req.body, err = validate(b.type, b.data); if (err) throw httpErr(400, err);
    const g = grade({ type: b.type, data: b.data }, b.answer, b.progress || []);
    res.json({ done: g.done, wrong: g.wrong, parts: g.parts, note: g.note, progress: g.progress, partial: g.partial, model: g.model, explanation: g.done ? b.explanation : undefined });
  });

  /* ---------- التقييمات ---------- */
  r.get('/assignments', (req, res) => {
    const rows = db.prepare(`SELECT a.*, c.name class_name, s.name subject FROM assignments a JOIN classes c ON c.id=a.class_id JOIN subjects s ON s.id=a.subject_id WHERE a.teacher_id=? AND a.archived=0 ORDER BY a.id DESC`).all(req.tid);
    res.json(rows.map(a => {
      const total = db.prepare('SELECT COUNT(*) n FROM assignment_students WHERE assignment_id=?').get(a.id).n;
      const finished = db.prepare('SELECT COUNT(DISTINCT student_id) n FROM attempts WHERE assignment_id=? AND finished_at IS NOT NULL').get(a.id).n;
      const started = db.prepare('SELECT COUNT(DISTINCT student_id) n FROM attempts WHERE assignment_id=?').get(a.id).n;
      return { ...a, opts: J(a.opts, {}), total, finished, started };
    }));
  });

  r.post('/assignments', (req, res) => {
    const b = req.body, cid = +b.class_id; needClass(req, cid);
    const subjectId = +b.subject_id; subjectOK(req.tid, subjectId);
    if (!db.prepare('SELECT 1 FROM class_teachers WHERE class_id=? AND teacher_id=? AND subject_id=?').get(cid, req.tid, subjectId)) throw httpErr(400, 'المادة دي مش مربوطة بالفصل ده');
    const title = String(b.title || '').trim(); if (!title) throw httpErr(400, 'عنوان التقييم مطلوب');
    if (!['fixed', 'adaptive'].includes(b.mode)) throw httpErr(400, 'نمط غير صحيح');

    // المستهدفون
    const t = b.targets || { type: 'class' }; let ids, desc;
    if (t.type === 'groups') {
      const gs = db.prepare(`SELECT * FROM student_groups WHERE class_id=? AND teacher_id=? AND id IN (${(t.groupIds || [0]).map(() => '?').join(',')})`).all(cid, req.tid, ...(t.groupIds || [0]));
      ids = [...new Set(gs.flatMap(g => db.prepare('SELECT student_id FROM student_group_members WHERE group_id=?').all(g.id).map(x => x.student_id)))];
      desc = 'مجموعات: ' + gs.map(g => g.name).join('، ');
    } else if (t.type === 'students') {
      ids = (t.studentIds || []).filter(s => db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?').get(cid, s));
      desc = ids.length + ' طلاب محددين';
    } else {
      ids = db.prepare('SELECT student_id FROM class_students WHERE class_id=?').all(cid).map(x => x.student_id); desc = 'كل الفصل';
    }
    if (!ids.length) throw httpErr(400, 'مفيش طلاب مستهدفين');

    let conceptIds = [], qids = [];
    if (b.mode === 'fixed') {
      qids = (b.question_ids || []).filter(id => db.prepare('SELECT 1 FROM questions WHERE id=? AND teacher_id=? AND archived=0 AND subject_id=?').get(id, req.tid, subjectId));
      if (!qids.length) throw httpErr(400, 'اختر أسئلة التقييم');
    } else {
      conceptIds = (b.concept_ids || []).filter(id => db.prepare('SELECT 1 FROM questions WHERE concept_id=? AND teacher_id=? AND archived=0').get(id, req.tid));
      if (!conceptIds.length) throw httpErr(400, 'اختر مفاهيم عندها أسئلة');
    }
    const o = b.opts || {};
    const opts = { confidence: !!o.confidence, stretch: o.stretch !== false, retrieval: !!o.retrieval };
    const id = tx(() => {
      const aid = db.prepare('INSERT INTO assignments(teacher_id,class_id,subject_id,title,mode,concept_ids,size,opts,due,target_desc) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(req.tid, cid, subjectId, title, b.mode, JSON.stringify(conceptIds), Math.max(3, Math.min(30, +b.size || 10)), JSON.stringify(opts), b.due || null, desc).lastInsertRowid;
      qids.forEach((q, i) => db.prepare('INSERT INTO assignment_questions VALUES(?,?,?)').run(aid, q, i));
      ids.forEach(s => db.prepare('INSERT INTO assignment_students VALUES(?,?)').run(aid, s));
      return aid;
    })();
    res.json({ id, students: ids.length });
  });

  r.delete('/assignments/:id', (req, res) => { ownAssignment(req.tid, req.params.id); db.prepare('UPDATE assignments SET archived=1 WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  r.get('/assignments/:id/results', (req, res) => {
    const a = ownAssignment(req.tid, req.params.id);
    const students = db.prepare('SELECT u.id,u.name FROM assignment_students x JOIN users u ON u.id=x.student_id WHERE x.assignment_id=? ORDER BY u.name').all(a.id);
    const rows = db.prepare(`SELECT r.*, q.type, q.prompt, q.data, a2.finished_at FROM responses r JOIN attempts a2 ON a2.id=r.attempt_id JOIN questions q ON q.id=r.question_id WHERE a2.assignment_id=? AND r.done=1`).all(a.id);
    const att = db.prepare('SELECT student_id, MAX(finished_at IS NOT NULL) fin, COUNT(*) n FROM attempts WHERE assignment_id=? GROUP BY student_id').all(a.id);
    const attBy = Object.fromEntries(att.map(x => [x.student_id, x]));
    const clean = x => !x.tries && !x.hints && !x.revealed;
    const stuOut = students.map(s => {
      const rs = rows.filter(x => x.student_id === s.id);
      const status = !attBy[s.id] ? 'new' : attBy[s.id].fin ? 'done' : 'doing';
      return { ...s, status, answered: rs.length, firstTry: rs.length ? Math.round(100 * rs.filter(clean).length / rs.length) : null, avgTries: rs.length ? +(rs.reduce((t, x) => t + x.tries, 0) / rs.length).toFixed(1) : null, hints: rs.reduce((t, x) => t + x.hints, 0), sureWrong: rs.filter(x => x.confidence === 'sure' && x.tries > 0).length, unsureRight: rs.filter(x => x.confidence === 'unsure' && x.tries === 0).length };
    });
    const byQ = {};
    rows.forEach(x => { (byQ[x.question_id] ||= []).push(x); });
    const qOut = Object.entries(byQ).map(([qid, rs]) => {
      const freq = {};
      rs.forEach(x => J(x.wrong, []).forEach(w => { if (w) freq[w] = (freq[w] || 0) + 1; }));
      const d = J(rs[0].data, {}), notes = d.notes || [];
      return {
        id: +qid, type: rs[0].type, prompt: rs[0].prompt, n: rs.length,
        firstTry: Math.round(100 * rs.filter(clean).length / rs.length), avgTries: +(rs.reduce((t, x) => t + x.tries, 0) / rs.length).toFixed(1),
        sureWrong: rs.filter(x => x.confidence === 'sure' && x.tries > 0).length,
        wrongAnswers: Object.entries(freq).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([label, n]) => ({ label, n, note: (d.options || []).includes(label) ? notes[d.options.indexOf(label)] || null : null }))
      };
    }).sort((p, q) => p.firstTry - q.firstTry);
    const open = rows.filter(x => x.type === 'open' && x.text).map(x => ({ id: x.id, student: students.find(s => s.id === x.student_id)?.name, prompt: x.prompt, text: x.text, feedback: x.feedback, model: J(x.data, {}).model || '' }));
    res.json({ assignment: { ...a, opts: J(a.opts, {}), concept_ids: J(a.concept_ids, []) }, students: stuOut, questions: qOut, open });
  });

  r.put('/responses/:id/feedback', (req, res) => {
    const x = db.prepare(`SELECT r.id FROM responses r JOIN attempts t ON t.id=r.attempt_id JOIN assignments a ON a.id=t.assignment_id WHERE r.id=? AND a.teacher_id=?`).get(req.params.id, req.tid);
    if (!x) throw httpErr(404, 'غير موجود');
    db.prepare('UPDATE responses SET feedback=? WHERE id=?').run(String(req.body.feedback || '').trim() || null, x.id); res.json({ ok: true });
  });

  r.get('/assignment-form-data', (req, res) => res.json({ subjects: mySubjects(req.tid) }));
  return r;
};
