const express = require('express');
const { db } = require('./db');

module.exports = () => {
  const r = express.Router();

  r.get('/overview', (req, res) => {
    const subjects = db.prepare('SELECT s.id,s.name FROM user_subjects us JOIN subjects s ON s.id=us.subject_id WHERE us.user_id=? ORDER BY s.name').all(req.user.id);
    const out = subjects.map(s => {
      const teachers = db.prepare(`SELECT u.id,u.name FROM user_subjects us JOIN users u ON u.id=us.user_id WHERE us.subject_id=? AND u.role='teacher' AND u.active=1 ORDER BY u.name`).all(s.id).map(t => {
        const classes = db.prepare('SELECT COUNT(DISTINCT class_id) n FROM class_teachers WHERE teacher_id=? AND subject_id=?').get(t.id, s.id).n;
        const students = db.prepare('SELECT COUNT(DISTINCT cs.student_id) n FROM class_teachers ct JOIN class_students cs ON cs.class_id=ct.class_id WHERE ct.teacher_id=? AND ct.subject_id=?').get(t.id, s.id).n;
        const questions = db.prepare('SELECT COUNT(*) n FROM questions WHERE teacher_id=? AND subject_id=? AND archived=0').get(t.id, s.id).n;
        const assignments = db.prepare('SELECT COUNT(*) n FROM assignments WHERE teacher_id=? AND subject_id=? AND archived=0').get(t.id, s.id).n;
        const recent = db.prepare(`SELECT COUNT(*) n FROM assignments WHERE teacher_id=? AND subject_id=? AND created_at > datetime('now','-14 days')`).get(t.id, s.id).n;
        const tot = db.prepare('SELECT COUNT(*) n FROM assignment_students x JOIN assignments a ON a.id=x.assignment_id WHERE a.teacher_id=? AND a.subject_id=? AND a.archived=0').get(t.id, s.id).n;
        const fin = db.prepare(`SELECT COUNT(*) n FROM (SELECT DISTINCT t.assignment_id, t.student_id FROM attempts t JOIN assignments a ON a.id=t.assignment_id WHERE a.teacher_id=? AND a.subject_id=? AND a.archived=0 AND t.finished_at IS NOT NULL)`).get(t.id, s.id).n;
        const avg = db.prepare(`SELECT ROUND(AVG(m.score)) v FROM mastery m JOIN concepts k ON k.id=m.concept_id WHERE k.subject_id=? AND m.student_id IN (SELECT cs.student_id FROM class_teachers ct JOIN class_students cs ON cs.class_id=ct.class_id WHERE ct.teacher_id=? AND ct.subject_id=?)`).get(s.id, t.id, s.id).v;
        return { ...t, classes, students, questions, assignments, recent, completion: tot ? Math.round(100 * fin / tot) : null, avg };
      });
      const concepts = db.prepare(`SELECT k.id,k.name,k.unit,ROUND(AVG(m.score)) avg,COUNT(*) students FROM concepts k JOIN mastery m ON m.concept_id=k.id WHERE k.subject_id=? GROUP BY k.id ORDER BY avg ASC`).all(s.id);
      return { ...s, teachers, concepts };
    });
    res.json(out);
  });

  return r;
};
