
const bcrypt = require('bcryptjs');
const db = require('./db');
const ai = require('./services/aiService');

const NET_TEXT =
  'A computer network is a collection of interconnected devices that communicate and share resources using common protocols. ' +
  'The client-server architecture is a distributed application structure that partitions tasks between providers of a resource, called servers, and requesters of the resource, called clients. ' +
  'The Transmission Control Protocol provides reliable, ordered and error-checked delivery of a stream of bytes between applications running on hosts communicating over an IP network. ' +
  'The Internet Protocol address is a numerical label assigned to each device connected to a computer network that uses the Internet Protocol for communication. ' +
  'Routers forward data packets between computer networks and perform traffic directing functions on the Internet, choosing the best path for each packet. ' +
  'The Domain Name System translates human readable domain names into numerical IP addresses needed for locating computer services and devices worldwide.';

const DBMS_TEXT =
  'Database normalization is the process of organizing data in a database to reduce redundancy and improve data integrity. ' +
  'First normal form requires that each column contains atomic values and that each record is unique within the table. ' +
  'Second normal form requires that the table is in first normal form and that all non-key attributes are fully functionally dependent on the primary key. ' +
  'Third normal form requires that the table is in second normal form and that there are no transitive dependencies among non key attributes. ' +
  'An index is a data structure that improves the speed of data retrieval operations on a database table at the cost of additional writes and storage space. ' +
  'A foreign key is a column or group of columns in a relational database table that provides a link between data in two tables and enforces referential integrity.';

const OS_TEXT =
  'An operating system is system software that manages computer hardware and software resources and provides common services for computer programs. ' +
  'A process is an instance of a computer program that is being executed and contains the program code and its current activity. ' +
  'Virtual memory is a memory management technique that provides an idealized abstraction of the storage resources that are actually available on a given machine. ' +
  'A deadlock is a state in which each member of a group of actions is waiting for some other member to take action, such as sending a message or releasing a lock. ' +
  'The scheduler is the component of the operating system that decides which process runs at a certain point in time, balancing fairness and throughput.';

const VIDEO_TEXT =
  'Welcome to this lecture on operating system scheduling. Today we discuss how the CPU scheduler selects processes from the ready queue. ' +
  'The short term scheduler decides which of the ready in-memory processes is to be executed next by the processor. ' +
  'Round robin scheduling assigns a fixed time unit per process and cycles through them in order, which is fair but adds context switching overhead. ' +
  'Priority scheduling assigns each process a priority and the CPU is allocated to the process with the highest priority. ' +
  'Starvation is a problem where a process is indefinitely postponed because other higher priority processes keep arriving in the ready queue.';

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function degradedAnswer(expected, rnd) {
  const parts = String(expected || '').split(' ');
  const keep = Math.max(6, Math.floor(parts.length * (0.5 + rnd() * 0.45)));
  let text = parts.slice(0, keep).join(' ');
  const extra = [
    ' It is used in many real world systems.',
    ' This helps improve overall performance.',
    ' The main idea is that it manages resources efficiently.',
    ' I think this is important for computer science.'
  ];
  return text + extra[Math.floor(rnd() * extra.length)];
}

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (existing > 0) {
    console.log('[seed] database already contains data — skipping seed.');
    return;
  }

  console.log('[seed] inserting demo data...');
  const rnd = mulberry32(20240517);

  /* ---- USERS ---- */
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)');
  const adminId = insertUser.run('Platform Admin', 'admin@demo.com', bcrypt.hashSync('Admin@123', 10), 'admin').lastInsertRowid;
  const teacherId = insertUser.run('Dr. Meera Sharma', 'teacher@demo.com', bcrypt.hashSync('Teacher@123', 10), 'teacher').lastInsertRowid;
  const teacher2Id = insertUser.run('Prof. Arjun Rao', 'teacher2@demo.com', bcrypt.hashSync('Teacher@123', 10), 'teacher').lastInsertRowid;

  const studentNames = [
    ['Riya Kapoor', 'student@demo.com'],
    ['Aarav Mehta', 'aarav@demo.com'],
    ['Diya Nair', 'diya@demo.com'],
    ['Kabir Singh', 'kabir@demo.com'],
    ['Ananya Iyer', 'ananya@demo.com']
  ];
  const studentIds = studentNames.map(function (s) {
    return insertUser.run(s[0], s[1], bcrypt.hashSync('Student@123', 10), 'student').lastInsertRowid;
  });

  /* ---- MATERIALS + PROCESSED CONTENT ---- */
  const materialDefs = [
    { title: 'Computer Networks — Lecture Notes', file_name: 'computer-networks.pdf', file_type: 'application/pdf', text: NET_TEXT },
    { title: 'DBMS Normalization — Digital Notes', file_name: 'dbms-normalization.txt', file_type: 'text/plain', text: DBMS_TEXT },
    { title: 'Operating Systems — Handwritten Notes (OCR)', file_name: 'os-handwritten.png', file_type: 'image/png', text: OS_TEXT },
    { title: 'Operating Systems — Lecture Recording', file_name: 'os-lecture.mp4', file_type: 'video/mp4', text: VIDEO_TEXT }
  ];

  const insertMaterial = db.prepare(
    'INSERT INTO learning_materials (teacher_id, title, file_name, file_type, size, status) VALUES (?,?,?,?,?,?)'
  );
  const insertContent = db.prepare(
    'INSERT INTO processed_contents (material_id, content, summary, topics, keywords, word_count) VALUES (?,?,?,?,?,?)'
  );
  const insertQuestion = db.prepare(
    'INSERT INTO questions (material_id, teacher_id, question, expected_answer, topic, difficulty, learning_objective, status, source) VALUES (?,?,?,?,?,?,?,?,?)'
  );

  const materialIds = [];

  materialDefs.forEach(function (m, idx) {
    const analysis = ai.analyzeContent(m.text);
    const mid = insertMaterial.run(
      idx === 2 ? teacher2Id : teacherId,
      m.title, m.file_name, m.file_type,
      Math.round(m.text.length * 1.6), 'processed'
    ).lastInsertRowid;
    materialIds.push(mid);

    insertContent.run(
      mid, analysis.content, analysis.summary,
      JSON.stringify(analysis.topics), JSON.stringify(analysis.keywords), analysis.wordCount
    );

    const generated = ai.demoQuestions(analysis.content, 5, analysis.topics[0]);
    const statuses = ['approved', 'approved', 'approved', 'pending', 'rejected'];
    generated.forEach(function (q, qi) {
      const status = statuses[qi] || 'pending';
      insertQuestion.run(
        mid, idx === 2 ? teacher2Id : teacherId,
        q.question, q.expectedAnswer, q.topic, q.difficulty, q.learningObjective,
        status, 'ai-demo'
      );
    });
  });

  /* ---- ASSESSMENTS ---- */
  const netQuestions = db.prepare(
    "SELECT id FROM questions WHERE material_id = ? AND status = 'approved' ORDER BY id ASC"
  ).all(materialIds[0]).map(function (r) { return r.id; });
  const dbmsQuestions = db.prepare(
    "SELECT id FROM questions WHERE material_id = ? AND status = 'approved' ORDER BY id ASC"
  ).all(materialIds[1]).map(function (r) { return r.id; });

  const assessmentA = db.prepare(
    'INSERT INTO assessments (title, description, material_id, teacher_id, question_ids, status) VALUES (?,?,?,?,?,?)'
  ).run(
    'Computer Networks — Fundamentals Quiz',
    'Covers client-server architecture, TCP/IP, routing and DNS.',
    materialIds[0], teacherId, JSON.stringify(netQuestions), 'active'
  ).lastInsertRowid;

  const assessmentB = db.prepare(
    'INSERT INTO assessments (title, description, material_id, teacher_id, question_ids, status) VALUES (?,?,?,?,?,?)'
  ).run(
    'DBMS Normalization — Concept Check',
    'Covers 1NF, 2NF, 3NF, indexing and foreign keys.',
    materialIds[1], teacherId, JSON.stringify(dbmsQuestions), 'active'
  ).lastInsertRowid;

  /* ---- STUDENT RESPONSES + AI EVALUATION + TEACHER EVALUATION + COMPARISON ---- */
  const insertResponse = db.prepare(
    'INSERT INTO student_responses (assessment_id, question_id, student_id, answer_type, answer_text) VALUES (?,?,?,?,?)'
  );
  const insertAiEval = db.prepare(
    'INSERT INTO ai_evaluations (response_id, overall_score, correctness, concept_coverage, grammar, incorrectness, missing_concepts, feedback, pronunciation, confidence) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  const insertTeacherEval = db.prepare(
    'INSERT INTO teacher_evaluations (response_id, teacher_id, score, correctness, comments, feedback) VALUES (?,?,?,?,?,?)'
  );
  const insertComparison = db.prepare(
    'INSERT INTO evaluation_comparisons (response_id, ai_score, teacher_score, difference, agreement) VALUES (?,?,?,?,?)'
  );

  const answerTypes = ['text', 'text', 'voice', 'handwritten'];

  [assessmentA, assessmentB].forEach(function (aid, aIdx) {
    const qids = JSON.parse(db.prepare('SELECT question_ids FROM assessments WHERE id = ?').get(aid).question_ids);
    const questions = qids.map(function (id) { return db.prepare('SELECT * FROM questions WHERE id = ?').get(id); });

    studentIds.forEach(function (sid, sIdx) {
      questions.forEach(function (q, qi) {
        const answerType = answerTypes[(sIdx + qi + aIdx) % answerTypes.length];
        const answer = degradedAnswer(q.expected_answer, rnd);
        const rid = insertResponse.run(aid, q.id, sid, answerType, answer).lastInsertRowid;

        const ev = ai.demoEvaluation(q.question, q.expected_answer, answer, answerType);
        insertAiEval.run(
          rid, ev.overallScore, ev.correctness, ev.conceptCoverage, ev.grammar, ev.incorrectness,
          JSON.stringify(ev.missingConcepts), ev.feedback,
          ev.pronunciation || null, ev.confidence || null
        );

        const delta = Math.round((rnd() * 12) - 6);
        const teacherScore = Math.max(10, Math.min(99, ev.overallScore + delta));

        if ((sIdx + qi + aIdx) % 5 !== 4) {
          insertTeacherEval.run(
            rid, teacherId, teacherScore, Math.max(10, Math.min(99, ev.correctness + delta)),
            'Reviewed manually against the expected answer.',
            'Teacher assessment: ' + (teacherScore >= 80
              ? 'Strong conceptual understanding demonstrated.'
              : teacherScore >= 60
                ? 'Correct direction but key details missing.'
                : 'Requires revision of the core concept.')
          );
          const difference = Math.abs(ev.overallScore - teacherScore);
          insertComparison.run(rid, ev.overallScore, teacherScore, difference, Math.max(0, 100 - difference));
        }
      });
    });
  });

  /* ---- SAMPLE ANALYTICS ROWS ---- */
  const insertAnalytics = db.prepare('INSERT INTO analytics (metric, value, meta) VALUES (?,?,?)');
  insertAnalytics.run('platform_seeded_at', Date.now(), JSON.stringify({ version: 1 }));
  insertAnalytics.run('ai_engine', 1, JSON.stringify({ engine: ai.isLive() ? 'openai' : 'demo' }));

  console.log('[seed] done: ' + studentIds.length + ' students, 2 assessments, demo evaluations created.');
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
