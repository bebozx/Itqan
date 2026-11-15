const express = require('express');
const { db, hashPw, tx } = require('./db');

module.exports = ({ httpErr }) => {
  const r = express.Router();
  const ROLES = ['admin', 'supervisor', 'teacher', 'student'];
  const PREFIX = { admin: 'a', supervisor: 'm', teacher: 't', student: 's' };
  const rnd = n => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  const genUser = role => { let u; do { u = PREFIX[role] + rnd(5); } while (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)); return u; };
  const need = (v, msg) => { if (!String(v || '').trim()) throw httpErr(400, msg); return String(v).trim(); };

  function createUser({ role, name, username, password, subjects = [] }) {
    if (!ROLES.includes(role)) throw httpErr(400, 'دور غير صحيح');
    name = need(name, 'الاسم مطلوب');
    username = (username || '').trim() || genUser(role);
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw httpErr(400, `اسم المستخدم ${username} مستخدم قبل كده`);
    password = (password || '').trim() || rnd(6);
    const id = db.prepare('INSERT INTO users(role,name,username,pass) VALUES(?,?,?,?)').run(role, name, username, hashPw(password)).lastInsertRowid;
    if (role === 'teacher' || role === 'supervisor') for (const s of subjects) db.prepare('INSERT OR IGNORE INTO user_subjects VALUES(?,?)').run(id, s);
    return { id, name, username, password, role };
  }

  r.get('/overview', (req, res) => {
    const c = role => db.prepare('SELECT COUNT(*) n FROM users WHERE role=? AND active=1').get(role).n;
    res.json({
      students: c('student'), teachers: c('teacher'), supervisors: c('supervisor'),
      classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n, subjects: db.prepare('SELECT COUNT(*) n FROM subjects').get().n,
      questions: db.prepare('SELECT COUNT(*) n FROM questions WHERE archived=0').get().n,
      assignments: db.prepare('SELECT COUNT(*) n FROM assignments WHERE archived=0').get().n
    });
  });

  /* المواد */
  r.get('/subjects', (req, res) => res.json(db.prepare('SELECT * FROM subjects ORDER BY name').all()));
  r.post('/subjects', (req, res) => {
    const name = need(req.body.name, 'اسم المادة مطلوب');
    try { res.json({ id: db.prepare('INSERT INTO subjects(name) VALUES(?)').run(name).lastInsertRowid }); } catch { throw httpErr(400, 'المادة موجودة'); }
  });
  r.put('/subjects/:id', (req, res) => { db.prepare('UPDATE subjects SET name=? WHERE id=?').run(need(req.body.name, 'الاسم مطلوب'), req.params.id); res.json({ ok: true }); });
  r.delete('/subjects/:id', (req, res) => {
    if (db.prepare('SELECT 1 FROM concepts WHERE subject_id=?').get(req.params.id)) throw httpErr(400, 'المادة فيها مفاهيم، مينفعش تتحذف');
    db.prepare('DELETE FROM user_subjects WHERE subject_id=?').run(req.params.id);
    db.prepare('DELETE FROM subjects WHERE id=?').run(req.params.id); res.json({ ok: true });
  });

  /* المستخدمون */
  r.get('/users', (req, res) => {
    const { role, q } = req.query;
    let sql = 'SELECT id,role,name,username,active FROM users WHERE 1=1'; const p = [];
    if (role) { sql += ' AND role=?'; p.push(role); }
    if (q) { sql += ' AND (name LIKE ? OR username LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
    const rows = db.prepare(sql + ' ORDER BY name LIMIT 500').all(...p);
    const subj = db.prepare('SELECT s.id,s.name FROM user_subjects us JOIN subjects s ON s.id=us.subject_id WHERE us.user_id=?');
    const cls = db.prepare('SELECT c.id,c.name FROM class_students cs JOIN classes c ON c.id=cs.class_id WHERE cs.student_id=?');
    res.json(rows.map(u => ({ ...u, subjects: u.role === 'teacher' || u.role === 'supervisor' ? subj.all(u.id) : [], classes: u.role === 'student' ? cls.all(u.id) : [] })));
  });
  r.post('/users', (req, res) => res.json(tx(() => createUser(req.body))()));
  r.post('/users/bulk', (req, res) => {
    const { role, names, classId, subjects } = req.body;
    const lines = String(names || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) throw httpErr(400, 'اكتب اسم واحد على الأقل (اسم في كل سطر)');
    if (lines.length > 300) throw httpErr(400, 'الحد الأقصى 300 في المرة');
    const out = tx(() => lines.map(line => {
      const [name, username, password] = line.split(',').map(s => s.trim());
      const u = createUser({ role, name, username, password, subjects });
      if (role === 'student' && classId) db.prepare('INSERT OR IGNORE INTO class_students VALUES(?,?)').run(classId, u.id);
      return u;
    }))();
    res.json(out);
  });
  r.put('/users/:id', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) throw httpErr(404, 'غير موجود');
    const { name, active, subjects } = req.body;
    if (u.id === req.user.id && active === false) throw httpErr(400, 'مينفعش توقف حسابك');
    tx(() => {
      db.prepare('UPDATE users SET name=?, active=? WHERE id=?').run(name ? String(name).trim() : u.name, active === undefined ? u.active : active ? 1 : 0, u.id);
      if (Array.isArray(subjects) && (u.role === 'teacher' || u.role === 'supervisor')) {
        db.prepare('DELETE FROM user_subjects WHERE user_id=?').run(u.id);
        subjects.forEach(s => db.prepare('INSERT OR IGNORE INTO user_subjects VALUES(?,?)').run(u.id, s));
      }
      if (active === false) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    })();
    res.json({ ok: true });
  });
  r.post('/users/:id/reset', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) throw httpErr(404, 'غير موجود');
    const password = (req.body.password || '').trim() || rnd(6);
    db.prepare('UPDATE users SET pass=?, must_change=0 WHERE id=?').run(hashPw(password), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    res.json({ name: u.name, username: u.username, password, role: u.role });
  });

  /* الفصول */
  r.get('/classes', (req, res) => {
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM class_students WHERE class_id=c.id) students FROM classes c ORDER BY c.grade, c.name`).all();
    const t = db.prepare(`SELECT u.name, s.name subject FROM class_teachers ct JOIN users u ON u.id=ct.teacher_id JOIN subjects s ON s.id=ct.subject_id WHERE ct.class_id=?`);
    res.json(rows.map(c => ({ ...c, teachers: t.all(c.id) })));
  });
  r.post('/classes', (req, res) => res.json({ id: db.prepare('INSERT INTO classes(name,grade) VALUES(?,?)').run(need(req.body.name, 'اسم الفصل مطلوب'), (req.body.grade || '').trim()).lastInsertRowid }));
  r.put('/classes/:id', (req, res) => { db.prepare('UPDATE classes SET name=?, grade=? WHERE id=?').run(need(req.body.name, 'اسم الفصل مطلوب'), (req.body.grade || '').trim(), req.params.id); res.json({ ok: true }); });
  r.delete('/classes/:id', (req, res) => {
    const id = req.params.id;
    if (db.prepare('SELECT 1 FROM assignments WHERE class_id=?').get(id)) throw httpErr(400, 'الفصل عليه تقييمات، مينفعش يتحذف (ممكن تشيل الطلاب منه)');
    tx(() => {
      db.prepare('DELETE FROM student_group_members WHERE group_id IN (SELECT id FROM student_groups WHERE class_id=?)').run(id);
      db.prepare('DELETE FROM student_groups WHERE class_id=?').run(id);
      db.prepare('DELETE FROM class_students WHERE class_id=?').run(id);
      db.prepare('DELETE FROM class_teachers WHERE class_id=?').run(id);
      db.prepare('DELETE FROM classes WHERE id=?').run(id);
    })();
    res.json({ ok: true });
  });
  r.get('/classes/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
    if (!c) throw httpErr(404, 'غير موجود');
    c.students = db.prepare(`SELECT u.id,u.name,u.username,u.active FROM class_students cs JOIN users u ON u.id=cs.student_id WHERE cs.class_id=? ORDER BY u.name`).all(c.id);
    c.teachers = db.prepare(`SELECT u.id,u.name,s.id subject_id,s.name subject FROM class_teachers ct JOIN users u ON u.id=ct.teacher_id JOIN subjects s ON s.id=ct.subject_id WHERE ct.class_id=?`).all(c.id);
    res.json(c);
  });
  r.post('/classes/:id/students', (req, res) => {
    tx(() => (req.body.ids || []).forEach(s => db.prepare('INSERT OR IGNORE INTO class_students VALUES(?,?)').run(req.params.id, s)))();
    res.json({ ok: true });
  });
  r.delete('/classes/:id/students/:sid', (req, res) => {
    tx(() => {
      db.prepare('DELETE FROM class_students WHERE class_id=? AND student_id=?').run(req.params.id, req.params.sid);
      db.prepare('DELETE FROM student_group_members WHERE student_id=? AND group_id IN (SELECT id FROM student_groups WHERE class_id=?)').run(req.params.sid, req.params.id);
    })();
    res.json({ ok: true });
  });
  r.post('/classes/:id/teachers', (req, res) => {
    const { teacherId, subjectId } = req.body;
    if (!db.prepare('SELECT 1 FROM user_subjects WHERE user_id=? AND subject_id=?').get(teacherId, subjectId)) throw httpErr(400, 'المعلم ده مش مربوط بالمادة دي (اربطه بالمادة من صفحة المستخدمين)');
    db.prepare('INSERT OR IGNORE INTO class_teachers VALUES(?,?,?)').run(req.params.id, teacherId, subjectId); res.json({ ok: true });
  });
  r.delete('/classes/:id/teachers/:tid/:sid', (req, res) => { db.prepare('DELETE FROM class_teachers WHERE class_id=? AND teacher_id=? AND subject_id=?').run(req.params.id, req.params.tid, req.params.sid); res.json({ ok: true }); });

  return r;
};
