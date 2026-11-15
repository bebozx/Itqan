const Database = require('better-sqlite3');
const path = require('path'), fs = require('fs'), crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'itqan.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, active INTEGER DEFAULT 1, must_change INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS user_subjects(user_id INTEGER, subject_id INTEGER, PRIMARY KEY(user_id, subject_id));
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, grade TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS class_students(class_id INTEGER, student_id INTEGER, PRIMARY KEY(class_id, student_id));
CREATE TABLE IF NOT EXISTS class_teachers(class_id INTEGER, teacher_id INTEGER, subject_id INTEGER, PRIMARY KEY(class_id, teacher_id, subject_id));
CREATE TABLE IF NOT EXISTS student_groups(id INTEGER PRIMARY KEY, class_id INTEGER, teacher_id INTEGER, name TEXT);
CREATE TABLE IF NOT EXISTS student_group_members(group_id INTEGER, student_id INTEGER, PRIMARY KEY(group_id, student_id));
CREATE TABLE IF NOT EXISTS concepts(id INTEGER PRIMARY KEY, subject_id INTEGER, unit TEXT DEFAULT '', name TEXT NOT NULL, prereq_id INTEGER, created_by INTEGER);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, teacher_id INTEGER, subject_id INTEGER, concept_id INTEGER, type TEXT, tier TEXT DEFAULT 'core', bloom TEXT DEFAULT 'understand', prompt TEXT, data TEXT, explanation TEXT DEFAULT '', hints TEXT DEFAULT '[]', archived INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY, teacher_id INTEGER, class_id INTEGER, subject_id INTEGER, title TEXT, mode TEXT, concept_ids TEXT DEFAULT '[]', size INTEGER DEFAULT 10, opts TEXT DEFAULT '{}', due TEXT, target_desc TEXT DEFAULT '', archived INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assignment_questions(assignment_id INTEGER, question_id INTEGER, pos INTEGER, PRIMARY KEY(assignment_id, question_id));
CREATE TABLE IF NOT EXISTS assignment_students(assignment_id INTEGER, student_id INTEGER, PRIMARY KEY(assignment_id, student_id));
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY, assignment_id INTEGER, student_id INTEGER, subject_id INTEGER, kind TEXT DEFAULT 'assignment', plan TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT);
CREATE TABLE IF NOT EXISTS responses(id INTEGER PRIMARY KEY, attempt_id INTEGER, student_id INTEGER, question_id INTEGER, concept_id INTEGER, tries INTEGER DEFAULT 0, hints INTEGER DEFAULT 0, revealed INTEGER DEFAULT 0, done INTEGER DEFAULT 0, progress TEXT DEFAULT '[]', wrong TEXT DEFAULT '[]', confidence TEXT, text TEXT, feedback TEXT, points INTEGER DEFAULT 0, started_at TEXT DEFAULT CURRENT_TIMESTAMP, done_at TEXT);
CREATE TABLE IF NOT EXISTS mastery(student_id INTEGER, concept_id INTEGER, score REAL DEFAULT 0, next_review TEXT, seen INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(student_id, concept_id));
CREATE TABLE IF NOT EXISTS student_stats(student_id INTEGER PRIMARY KEY, points INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, last_day TEXT);
CREATE TABLE IF NOT EXISTS badges(id INTEGER PRIMARY KEY, student_id INTEGER, code TEXT, label TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_resp_student ON responses(student_id);
CREATE INDEX IF NOT EXISTS ix_resp_attempt ON responses(attempt_id);
CREATE INDEX IF NOT EXISTS ix_att_assign ON attempts(assignment_id);
CREATE INDEX IF NOT EXISTS ix_q_concept ON questions(concept_id);
`);

const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const pad = n => String(n).padStart(2, '0');
const addDays = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const today = () => addDays(0);

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const token = () => crypto.randomBytes(32).toString('hex');
const tx = fn => db.transaction(fn);

module.exports = { db, J, today, addDays, hashPw, checkPw, token, tx };
