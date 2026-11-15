// بيانات تجريبية: node server/seed.js
const { db, hashPw, addDays } = require('./db');

if (db.prepare("SELECT 1 FROM subjects WHERE name='Chemistry'").get()) { console.log('البيانات التجريبية موجودة قبل كده.'); process.exit(0); }

if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get())
  db.prepare("INSERT INTO users(role,name,username,pass,must_change) VALUES('admin','مدير النظام','admin',?,1)").run(hashPw('admin123'));

const user = (role, name, username, pw = '1234') => db.prepare('INSERT INTO users(role,name,username,pass) VALUES(?,?,?,?)').run(role, name, username, hashPw(pw)).lastInsertRowid;
const chem = db.prepare("INSERT INTO subjects(name) VALUES('Chemistry')").run().lastInsertRowid;
const teacher = user('teacher', 'أ. أحمد (معلم تجريبي)', 't1');
const sup = user('supervisor', 'أ. منى (مشرفة الكيمياء)', 'm1');
[teacher, sup].forEach(u => db.prepare('INSERT INTO user_subjects VALUES(?,?)').run(u, chem));
const cls = db.prepare("INSERT INTO classes(name,grade) VALUES('9-A','Grade 9')").run().lastInsertRowid;
db.prepare('INSERT INTO class_teachers VALUES(?,?,?)').run(cls, teacher, chem);
const names = ['سارة محمود', 'يوسف علي', 'مريم حسن', 'عمر خالد', 'نور إبراهيم', 'كريم سامي'];
const studs = names.map((n, i) => { const id = user('student', n, 's' + (i + 1)); db.prepare('INSERT INTO class_students VALUES(?,?)').run(cls, id); return id; });

const concept = (unit, name, prereq = null) => db.prepare('INSERT INTO concepts(subject_id,unit,name,prereq_id,created_by) VALUES(?,?,?,?,?)').run(chem, unit, name, prereq, teacher).lastInsertRowid;
const A = concept('Atoms', 'Atomic structure'), B = concept('Bonding', 'Covalent bonding', A), C = concept('Bonding', 'Ionic bonding', A);

const Q = (cid, type, tier, bloom, prompt, data, explanation = '', hints = []) =>
  db.prepare('INSERT INTO questions(teacher_id,subject_id,concept_id,type,tier,bloom,prompt,data,explanation,hints) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(teacher, chem, cid, type, tier, bloom, prompt, JSON.stringify(data), explanation, JSON.stringify(hints)).lastInsertRowid;

const q = [];
q.push(Q(A, 'fill', 'foundation', 'remember', 'Complete the sentence about the atom.', { text: 'An atom is made of protons, neutrons and [[electrons]]. Protons have a [[positive|+]] charge.' }, 'Protons (+) and neutrons (0) are in the nucleus; electrons (−) orbit around it.', ['راجع جدول الجسيمات تحت الذرية في الكتاب.']));
q.push(Q(A, 'mcq', 'foundation', 'remember', 'Which particle is found in the nucleus and has no charge?', { options: ['Proton', 'Neutron', 'Electron', 'Ion'], correct: 1, notes: ['The proton is in the nucleus but it is positive.', null, 'Electrons are outside the nucleus.', 'An ion is a charged atom, not a particle.'] }, 'The neutron is neutral and sits in the nucleus.'));
q.push(Q(A, 'wordbank', 'core', 'understand', 'Fill the gaps using the word bank.', { text: 'The number of [[protons]] is called the atomic number. The mass number equals protons plus [[neutrons]].', distractors: ['electrons', 'ions'] }, 'Mass number = protons + neutrons.'));
q.push(Q(A, 'numeric', 'core', 'apply', 'An atom has atomic number 17 and mass number 35. How many neutrons does it have?', { answer: 18, tol: 0, unit: 'neutrons' }, 'Neutrons = mass number − atomic number = 35 − 17 = 18.', ['استخدم: الكتلة الذرية − العدد الذري.']));
q.push(Q(A, 'error', 'stretch', 'analyze', 'A student calculated the neutrons in carbon-14 (atomic number 6). Find the step with the mistake.', { steps: ['Mass number = 14', 'Atomic number = 6', 'Neutrons = mass number + atomic number = 20', 'So carbon-14 has 20 neutrons'], correct: 2 }, 'Neutrons = mass number − atomic number = 14 − 6 = 8.'));
q.push(Q(B, 'tf', 'foundation', 'remember', 'In a covalent bond, atoms share pairs of electrons.', { answer: true }, 'Covalent bonds form by sharing electron pairs between non-metal atoms.'));
q.push(Q(B, 'match', 'core', 'understand', 'Match each molecule to its formula.', { pairs: [['Water', 'H₂O'], ['Carbon dioxide', 'CO₂'], ['Methane', 'CH₄'], ['Ammonia', 'NH₃']] }));
q.push(Q(B, 'order', 'core', 'apply', 'Put the steps of drawing a dot-and-cross diagram for H₂ in order.', { items: ['Draw the two hydrogen atoms with one electron each', 'Overlap the outer shells', 'Show the shared pair of electrons', 'Check each atom now has a full outer shell'] }));
q.push(Q(B, 'multi', 'core', 'understand', 'Select ALL properties of simple covalent substances.', { options: ['Low melting point', 'Do not conduct electricity', 'High melting point', 'Conduct when molten'], correct: [0, 1], notes: [null, null, 'That is true for giant structures, not simple molecules.', 'Simple molecules have no free ions or electrons.'] }, 'Weak forces between molecules are easy to overcome, and there are no charged particles to carry current.'));
q.push(Q(B, 'open', 'stretch', 'evaluate', 'Why does diamond have a very high melting point although it is covalently bonded?', { min: 30, model: 'Diamond is a giant covalent structure: every carbon atom is bonded to four others by strong covalent bonds throughout the crystal, so a lot of energy is needed to break them.' }));
q.push(Q(C, 'fill', 'foundation', 'remember', 'Complete the sentence about ionic bonds.', { text: 'Ionic bonds form when electrons are [[transferred]] from a metal to a [[non-metal|nonmetal]].' }));
q.push(Q(C, 'sort', 'core', 'understand', 'Sort the compounds into ionic or covalent.', { cats: ['Ionic', 'Covalent'], items: [{ t: 'NaCl', cat: 0 }, { t: 'MgO', cat: 0 }, { t: 'H₂O', cat: 1 }, { t: 'CH₄', cat: 1 }, { t: 'KBr', cat: 0 }] }));
q.push(Q(C, 'short', 'core', 'remember', 'What is the name of the force between oppositely charged ions?', { answers: ['electrostatic attraction', 'electrostatic force', 'electrostatic'] }, 'Strong electrostatic attraction holds the ions together in the lattice.'));
q.push(Q(C, 'mcq', 'stretch', 'analyze', 'Why do ionic compounds conduct electricity only when molten or dissolved?', { options: ['The ions are free to move', 'The electrons are free to move', 'The molecules break apart', 'The bonds become covalent'], correct: 0, notes: [null, 'In ionic solids electrons are held in ions; current is carried by ions.', 'Ionic compounds do not form molecules.', 'Bonding type does not change on melting.'] }, 'In the solid lattice ions are fixed; when molten or dissolved they can move and carry charge.'));

// تقييمات تجريبية
const asg = (title, mode, cids, size, opts, studIds, desc) => {
  const id = db.prepare('INSERT INTO assignments(teacher_id,class_id,subject_id,title,mode,concept_ids,size,opts,target_desc) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(teacher, cls, chem, title, mode, JSON.stringify(cids), size, JSON.stringify(opts), desc).lastInsertRowid;
  studIds.forEach(s => db.prepare('INSERT INTO assignment_students VALUES(?,?)').run(id, s));
  return id;
};
asg('Bonding check (adaptive)', 'adaptive', [B, C], 10, { confidence: true, stretch: true, retrieval: true }, studs, 'كل الفصل');
const fixed = asg('Atoms starter (support group)', 'fixed', [], 0, { confidence: false, stretch: false }, studs.slice(0, 2), '2 طلاب محددين');
q.slice(0, 4).forEach((id, i) => db.prepare('INSERT INTO assignment_questions VALUES(?,?,?)').run(fixed, id, i));
const g = db.prepare('INSERT INTO student_groups(class_id,teacher_id,name) VALUES(?,?,?)').run(cls, teacher, 'مجموعة الدعم').lastInsertRowid;
studs.slice(0, 2).forEach(s => db.prepare('INSERT INTO student_group_members VALUES(?,?)').run(g, s));

// إتقان تجريبي عشان الـ heatmap
const scores = [[35, 20, 15], [82, 70, 55], [50, 45, 60], [90, 85, 78], [60, 30, 40], [25, 10, null]];
studs.forEach((s, i) => [A, B, C].forEach((c, j) => { const v = scores[i][j]; if (v != null) db.prepare('INSERT INTO mastery VALUES(?,?,?,?,?,?)').run(s, c, v, addDays(v < 60 ? -1 : 3), 3, new Date().toISOString()); }));

console.log('تم تجهيز البيانات التجريبية:\n  أدمن: admin / admin123\n  مشرف: m1 / 1234\n  معلم: t1 / 1234\n  طلاب: s1..s6 / 1234');
