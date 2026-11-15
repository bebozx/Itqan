const express = require('express');
const path = require('path');
const { db, hashPw, checkPw, token } = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

/* ---------- أدوات مشتركة ---------- */
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

app.use((req, res, next) => {
  const sid = cookies(req).sid;
  if (sid) {
    const u = db.prepare(`SELECT u.id,u.role,u.name,u.username,u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1`).get(sid);
    if (u) req.user = u;
  }
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(httpErr(401, 'سجّل الدخول أولاً'));
  if (!roles.includes(req.user.role)) return next(httpErr(403, 'غير مسموح'));
  next();
};

/* ---------- تسجيل الدخول ---------- */
const attempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip, now = Date.now();
  const rec = (attempts.get(ip) || []).filter(t => now - t < 60000);
  if (rec.length >= 10) throw httpErr(429, 'محاولات كتير، استنى دقيقة وجرّب تاني');
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username || '').trim());
  if (!u || !checkPw(password, u.pass)) { rec.push(now); attempts.set(ip, rec); throw httpErr(401, 'اسم المستخدم أو كلمة المرور غير صحيحة'); }
  const t = token();
  db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)').run(t, u.id);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${COOKIE_SECURE ? '; Secure' : ''}`);
  res.json({ id: u.id, role: u.role, name: u.name, username: u.username, must_change: u.must_change });
});
app.post('/api/logout', (req, res) => {
  const sid = cookies(req).sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token=?').run(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json(req.user || null));
app.post('/api/change-password', requireRole('admin', 'supervisor', 'teacher', 'student'), (req, res) => {
  const { old, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!checkPw(old, u.pass)) throw httpErr(400, 'كلمة المرور الحالية غير صحيحة');
  if (String(password || '').length < 4) throw httpErr(400, 'كلمة المرور قصيرة (4 أحرف على الأقل)');
  db.prepare('UPDATE users SET pass=?, must_change=0 WHERE id=?').run(hashPw(password), u.id);
  res.json({ ok: true });
});

/* ---------- الراوترات ---------- */
const ctx = { httpErr, requireRole };
app.use('/api/a', requireRole('admin'), require('./routes-admin')(ctx));
app.use('/api/t', requireRole('teacher', 'supervisor'), require('./routes-teacher')(ctx));
app.use('/api/sv', requireRole('supervisor'), require('./routes-supervisor')(ctx));
app.use('/api/s', requireRole('student'), require('./routes-student')(ctx));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => req.path.startsWith('/api/') ? next(httpErr(404, 'غير موجود')) : res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'حصل خطأ في السيرفر' });
});

/* ---------- أول تشغيل ---------- */
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users(role,name,username,pass,must_change) VALUES(?,?,?,?,1)').run('admin', 'مدير النظام', 'admin', hashPw(pw));
  console.log(`تم إنشاء حساب الأدمن: admin / ${pw}  (غيّر كلمة المرور بعد أول دخول)`);
}
setInterval(() => db.prepare(`DELETE FROM sessions WHERE created_at < datetime('now','-30 days')`).run(), 6 * 3600 * 1000).unref();

if (require.main === module) app.listen(PORT, () => console.log(`إتقان شغّال على http://localhost:${PORT}`));
module.exports = app;
