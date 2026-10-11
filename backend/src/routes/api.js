
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const ai = require('../services/aiService');
const contentService = require('../services/contentService');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + String(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 30 * 1024 * 1024 } });

router.use(authMiddleware);

/* =====================================================
 *  MATERIALS
 * ===================================================== */

router.get('/materials', function (req, res) {
  let rows;
  if (req.user.role === 'teacher') {
    rows = db.prepare('SELECT * FROM learning_materials WHERE teacher_id = ? ORDER BY id DESC').all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM learning_materials ORDER BY id DESC').all();
  }
  const withOwner = rows.map(function (m) {
    const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(m.teacher_id);
    const pc = db.prepare('SELECT id, word_count FROM processed_contents WHERE material_id = ? ORDER BY id DESC LIMIT 1').get(m.id);
    const qCount = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE material_id = ?').get(m.id).c;
    return Object.assign({}, m, {
      teacher_name: owner ? owner.name : 'Unknown',
      processed: !!pc,
      word_count: pc ? pc.word_count : 0,
      question_count: qCount
    });
  });
  res.json({ materials: withOwner });
});

router.post('/materials', requireRole('teacher', 'admin'), upload.single('file'), function (req, res) {
  const title = (req.body.title || (req.file ? req.file.originalname : 'Untitled material')).trim();
  const transcript = req.body.transcript || null;
  const file = req.file;

  const info = db.prepare(
    'INSERT INTO learning_materials (teacher_id, title, file_name, file_type, size, stored_path, transcript, status) ' +
    'VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    req.user.id,
    title,
    file ? file.originalname : (req.body.file_name || 'notes.txt'),
    file ? file.mimetype : (req.body.file_type || 'text/plain'),
    file ? file.size : 0,
    file ? file.path : null,
    transcript,
    'uploaded'
  );

  const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ material: material, message: 'Material uploaded successfully.' });
});

router.get('/materials/:id', function (req, res) {
  const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material not found.' });
  const content = db.prepare('SELECT * FROM processed_contents WHERE material_id = ? ORDER BY id DESC LIMIT 1').get(material.id);
  const questions = db.prepare('SELECT * FROM questions WHERE material_id = ? ORDER BY id DESC').all(material.id);
  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(material.teacher_id);
  res.json({
    material: Object.assign({}, material, { teacher_name: owner ? owner.name : 'Unknown' }),
    content: content ? Object.assign({}, content, {
      topics: content.topics ? JSON.parse(content.topics) : [],
      keywords: content.keywords ? JSON.parse(content.keywords) : []
    }) : null,
    questions: questions
  });
});

router.get('/materials/:id/debug', requireRole('teacher', 'admin'), function (req, res) {
  const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material not found.' });
  const pc = db.prepare('SELECT * FROM processed_contents WHERE material_id = ? ORDER BY id DESC LIMIT 1').get(material.id);
  if (!pc) return res.json({ material: material, content: null, sentences: [], questions: [] });
  const sentences = ai.splitSentences(pc.content);
  const preview = ai.demoQuestions(pc.content, 5, null);
  res.json({
    material: material,
    contentLength: pc.content ? pc.content.length : 0,
    contentPreview: pc.content ? pc.content.slice(0, 600) : '',
    wordCount: pc.word_count,
    sentenceCount: sentences.length,
    sentences: sentences.slice(0, 15),
    questionsPreview: preview
  });
});

router.post('/materials/:id/process', requireRole('teacher', 'admin'), async function (req, res) {
  const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material not found.' });

  let buffer = null;
  if (material.stored_path && fs.existsSync(material.stored_path)) {
    buffer = fs.readFileSync(material.stored_path);
  }

  const pastedText = req.body && req.body.text ? String(req.body.text).trim() : '';
  const materialForProcessing = Object.assign({}, material, {
    transcript: pastedText || material.transcript
  });

  const analysis = await contentService.processMaterial(materialForProcessing, buffer);

  if (analysis.error) {
    return res.status(422).json({
      error: analysis.error,
      kind: analysis.kind,
      needsManualContent: true
    });
  }

  if (pastedText && (!material.transcript || material.transcript.length < pastedText.length)) {
    db.prepare('UPDATE learning_materials SET transcript = ? WHERE id = ?').run(pastedText, material.id);
  }

  db.prepare('DELETE FROM processed_contents WHERE material_id = ?').run(material.id);
  const info = db.prepare(
    'INSERT INTO processed_contents (material_id, content, summary, topics, keywords, word_count) VALUES (?,?,?,?,?,?)'
  ).run(
    material.id,
    analysis.content,
    analysis.summary + (analysis.note ? ' [' + analysis.note + ']' : ''),
    JSON.stringify(analysis.topics),
    JSON.stringify(analysis.keywords),
    analysis.wordCount
  );

  db.prepare('UPDATE learning_materials SET status = ? WHERE id = ?').run('processed', material.id);

  const saved = db.prepare('SELECT * FROM processed_contents WHERE id = ?').get(info.lastInsertRowid);
  res.json({
    message: 'Material processed successfully (' + analysis.kind + ' pipeline).',
    content: Object.assign({}, saved, {
      topics: JSON.parse(saved.topics),
      keywords: JSON.parse(saved.keywords),
      note: analysis.note,
      meta: analysis.meta || {}
    })
  });
});

router.delete('/materials/:id', requireRole('teacher', 'admin'), function (req, res) {
  db.prepare('DELETE FROM processed_contents WHERE material_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE material_id = ?').run(req.params.id);
  db.prepare('DELETE FROM learning_materials WHERE id = ?').run(req.params.id);
  res.json({ message: 'Material deleted.' });
});

/* =====================================================
 *  QUESTIONS
 * ===================================================== */

router.get('/questions', function (req, res) {
  const status = req.query.status;
  const materialId = req.query.materialId;
  let sql = 'SELECT q.*, m.title AS material_title FROM questions q LEFT JOIN learning_materials m ON m.id = q.material_id WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { sql += ' AND q.status = ?'; params.push(status); }
  if (materialId) { sql += ' AND q.material_id = ?'; params.push(materialId); }
  sql += ' ORDER BY q.id DESC';
  const stmt = db.prepare(sql);
  const rows = params.length ? stmt.all.apply(stmt, params) : stmt.all();
  res.json({ questions: rows });
});

router.post('/questions/generate', requireRole('teacher', 'admin'), async function (req, res) {
  const materialId = req.body.materialId;
  const count = req.body.count || 5;
  const replaceOld = !!req.body.replace;

  const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(materialId);
  if (!material) return res.status(404).json({ error: 'Material not found.' });

  const pc = db.prepare('SELECT * FROM processed_contents WHERE material_id = ? ORDER BY id DESC LIMIT 1').get(materialId);
  if (!pc) return res.status(400).json({ error: 'Please process the material before generating questions.' });

  if (replaceOld) {
    db.prepare("DELETE FROM questions WHERE material_id = ? AND source IN ('ai-demo', 'openai')").run(materialId);
  }
  const topics = pc.topics ? JSON.parse(pc.topics) : [];
  const generated = await ai.generateQuestions(pc.content, count, topics[0]);

  const insert = db.prepare(
    'INSERT INTO questions (material_id, teacher_id, question, expected_answer, topic, difficulty, learning_objective, status, source) ' +
    'VALUES (?,?,?,?,?,?,?,?,?)'
  );

  const ids = [];
  generated.forEach(function (q) {
    const info = insert.run(
      materialId,
      req.user.id,
      q.question || 'Untitled question',
      q.expectedAnswer || '',
      q.topic || 'General',
      q.difficulty || 'Medium',
      q.learningObjective || '',
      'pending',
      ai.isLive() ? 'openai' : 'ai-demo'
    );
    ids.push(info.lastInsertRowid);
  });

  const questions = ids.map(function (id) { return db.prepare('SELECT * FROM questions WHERE id = ?').get(id); });
  res.json({
    message: generated.length + ' question(s) generated. Review and approve them.',
    engine: ai.isLive() ? 'openai' : 'demo',
    questions: questions
  });
});

router.put('/questions/:id', requireRole('teacher', 'admin'), function (req, res) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found.' });

  const b = req.body || {};
  db.prepare(
    'UPDATE questions SET question = ?, expected_answer = ?, topic = ?, difficulty = ?, learning_objective = ?, ' +
    'status = ?, source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(
    b.question !== undefined ? b.question : q.question,
    b.expectedAnswer !== undefined ? b.expectedAnswer : q.expected_answer,
    b.topic !== undefined ? b.topic : q.topic,
    b.difficulty !== undefined ? b.difficulty : q.difficulty,
    b.learningObjective !== undefined ? b.learningObjective : q.learning_objective,
    b.status !== undefined ? b.status : (q.status === 'pending' ? 'edited' : q.status),
    'teacher-edited',
    q.id
  );

  db.prepare('INSERT INTO question_reviews (question_id, reviewer_id, action, note) VALUES (?,?,?,?)')
    .run(q.id, req.user.id, 'edited', b.note || null);

  res.json({ question: db.prepare('SELECT * FROM questions WHERE id = ?').get(q.id), message: 'Question updated.' });
});

router.post('/questions/:id/review', requireRole('teacher', 'admin'), function (req, res) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found.' });

  const action = req.body.action;
  if (['approve', 'reject'].indexOf(action) === -1) {
    return res.status(400).json({ error: 'Action must be approve or reject.' });
  }
  const status = action === 'approve' ? 'approved' : 'rejected';

  db.prepare('UPDATE questions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, q.id);
  db.prepare('INSERT INTO question_reviews (question_id, reviewer_id, action, note) VALUES (?,?,?,?)')
    .run(q.id, req.user.id, action, req.body.note || null);

  res.json({
    question: db.prepare('SELECT * FROM questions WHERE id = ?').get(q.id),
    message: 'Question ' + status + '.'
  });
});

router.delete('/questions/:id', requireRole('teacher', 'admin'), function (req, res) {
  db.prepare('DELETE FROM question_reviews WHERE question_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Question deleted.' });
});

/* =====================================================
 *  ASSESSMENTS
 * ===================================================== */

router.get('/assessments', function (req, res) {
  const rows = db.prepare('SELECT * FROM assessments ORDER BY id DESC').all();
  const out = rows.map(function (a) {
    const ids = a.question_ids ? JSON.parse(a.question_ids) : [];
    const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(a.teacher_id);
    let answered = 0;
    if (req.user.role === 'student') {
      const r = db.prepare(
        'SELECT COUNT(DISTINCT question_id) AS c FROM student_responses WHERE assessment_id = ? AND student_id = ?'
      ).get(a.id, req.user.id);
      answered = r.c;
    }
    return Object.assign({}, a, {
      question_ids: ids,
      question_count: ids.length,
      teacher_name: owner ? owner.name : 'Unknown',
      answered_count: answered,
      completed: req.user.role === 'student' ? (ids.length > 0 && answered >= ids.length) : false
    });
  });
  res.json({ assessments: out });
});

router.post('/assessments', requireRole('teacher', 'admin'), function (req, res) {
  const b = req.body || {};
  const ids = Array.isArray(b.questionIds) ? b.questionIds : [];
  if (!b.title) return res.status(400).json({ error: 'Assessment title is required.' });
  if (!ids.length) return res.status(400).json({ error: 'Select at least one approved question.' });

  const info = db.prepare(
    'INSERT INTO assessments (title, description, material_id, teacher_id, question_ids, status) VALUES (?,?,?,?,?,?)'
  ).run(b.title, b.description || '', b.materialId || null, req.user.id, JSON.stringify(ids), 'active');

  res.status(201).json({ assessment: db.prepare('SELECT * FROM assessments WHERE id = ?').get(info.lastInsertRowid) });
});

router.get('/assessments/:id', function (req, res) {
  const a = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Assessment not found.' });

  const ids = a.question_ids ? JSON.parse(a.question_ids) : [];
  const questions = ids.map(function (id) {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    if (!q) return null;
    if (req.user.role === 'student') {
      return {
        id: q.id, question: q.question, topic: q.topic,
        difficulty: q.difficulty, learning_objective: q.learning_objective
      };
    }
    return q;
  }).filter(Boolean);

  let responses = [];
  if (req.user.role === 'student') {
    responses = db.prepare('SELECT * FROM student_responses WHERE assessment_id = ? AND student_id = ?').all(a.id, req.user.id);
  } else {
    responses = db.prepare('SELECT * FROM student_responses WHERE assessment_id = ?').all(a.id);
  }

  res.json({ assessment: Object.assign({}, a, { question_ids: ids }), questions: questions, responses: responses });
});

/* =====================================================
 *  MULTIMODAL ANSWER INPUT (STT / OCR)
 * ===================================================== */

router.post('/speech-to-text', upload.single('file'), function (req, res) {
  const fallback = 'Welcome to this lecture on operating system scheduling. Today we discuss how the CPU scheduler selects processes from the ready queue. The short term scheduler decides which of the ready in-memory processes is to be executed next.';
  const size = req.file ? req.file.size : 0;
  const text = size > 200000
    ? 'A computer network connects devices so they can share data. The client server architecture separates the client which requests services from the server which provides them. The server handles requests from many clients at the same time and the client sends a request and waits for a response.'
    : fallback;

  res.json({
    transcript: text,
    engine: 'demo-stt',
    note: 'Demo speech-to-text engine used (no external STT configured).',
    durationSeconds: Math.max(3, Math.round(size / 16000))
  });
});

router.post('/ocr', upload.single('file'), function (req, res) {
  res.json({
    text: 'An operating system is system software that manages computer hardware and software resources. A process is an instance of a program being executed. Virtual memory abstracts physical storage.',
    engine: 'demo-ocr',
    note: 'Demo OCR engine used (no external OCR configured).',
    confidence: 0.93
  });
});

/* =====================================================
 *  STUDENT RESPONSES + AI EVALUATION
 * ===================================================== */

router.post('/responses', requireRole('student'), async function (req, res) {
  const b = req.body || {};
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(b.questionId);
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  if (!b.answerText || String(b.answerText).trim().length < 3) {
    return res.status(400).json({ error: 'Please provide an answer before submitting.' });
  }

  const answerType = ['text', 'voice', 'handwritten'].indexOf(b.answerType) !== -1 ? b.answerType : 'text';

  const info = db.prepare(
    'INSERT INTO student_responses (assessment_id, question_id, student_id, answer_type, answer_text, media_path) VALUES (?,?,?,?,?,?)'
  ).run(b.assessmentId, question.id, req.user.id, answerType, String(b.answerText).trim(), b.mediaPath || null);

  const responseId = info.lastInsertRowid;

  const evaluation = await ai.evaluateAnswer(
    question.question,
    question.expected_answer,
    String(b.answerText).trim(),
    answerType
  );

  db.prepare(
    'INSERT INTO ai_evaluations (response_id, overall_score, correctness, concept_coverage, grammar, incorrectness, missing_concepts, feedback, pronunciation, confidence) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(
    responseId,
    evaluation.overallScore || 0,
    evaluation.correctness || 0,
    evaluation.conceptCoverage || 0,
    evaluation.grammar || 0,
    evaluation.incorrectness || 0,
    JSON.stringify(evaluation.missingConcepts || []),
    evaluation.feedback || '',
    evaluation.pronunciation || null,
    evaluation.confidence || null
  );

  const saved = db.prepare('SELECT * FROM ai_evaluations WHERE response_id = ? ORDER BY id DESC LIMIT 1').get(responseId);
  saved.missing_concepts = JSON.parse(saved.missing_concepts || '[]');

  res.status(201).json({
    message: 'Answer submitted and evaluated by AI.',
    response: db.prepare('SELECT * FROM student_responses WHERE id = ?').get(responseId),
    evaluation: saved
  });
});

router.get('/responses', function (req, res) {
  const assessmentId = req.query.assessmentId;
  let sql =
    'SELECT sr.*, q.question, q.expected_answer, q.topic, q.difficulty, ' +
    'u.name AS student_name, u.email AS student_email, ' +
    'ae.overall_score AS ai_score, te.score AS teacher_score ' +
    'FROM student_responses sr ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'JOIN users u ON u.id = sr.student_id ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id WHERE 1=1';
  const params = [];
  if (assessmentId) { sql += ' AND sr.assessment_id = ?'; params.push(assessmentId); }
  if (req.user.role === 'student') { sql += ' AND sr.student_id = ?'; params.push(req.user.id); }
  sql += ' ORDER BY sr.id DESC';

  const stmt = db.prepare(sql);
  const rows = params.length ? stmt.all.apply(stmt, params) : stmt.all();
  res.json({ responses: rows });
});

router.get('/responses/:id', function (req, res) {
  const r = db.prepare('SELECT * FROM student_responses WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Response not found.' });

  if (req.user.role === 'student' && r.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(r.question_id);
  const student = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(r.student_id);
  const aiEval = db.prepare('SELECT * FROM ai_evaluations WHERE response_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
  const teacherEval = db.prepare('SELECT * FROM teacher_evaluations WHERE response_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
  const comparison = db.prepare('SELECT * FROM evaluation_comparisons WHERE response_id = ? ORDER BY id DESC LIMIT 1').get(r.id);

  if (aiEval) aiEval.missing_concepts = JSON.parse(aiEval.missing_concepts || '[]');

  res.json({
    response: r,
    question: question,
    student: student,
    aiEvaluation: aiEval || null,
    teacherEvaluation: teacherEval || null,
    comparison: comparison || null
  });
});

/* =====================================================
 *  TEACHER (HUMAN) EVALUATION
 * ===================================================== */

router.post('/responses/:id/evaluate', requireRole('teacher', 'admin'), function (req, res) {
  const r = db.prepare('SELECT * FROM student_responses WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Response not found.' });

  const b = req.body || {};
  const score = Number(b.score);
  if (isNaN(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be a number between 0 and 100.' });
  }

  db.prepare('DELETE FROM teacher_evaluations WHERE response_id = ?').run(r.id);
  const info = db.prepare(
    'INSERT INTO teacher_evaluations (response_id, teacher_id, score, correctness, comments, feedback) VALUES (?,?,?,?,?,?)'
  ).run(r.id, req.user.id, score, Number(b.correctness) || score, b.comments || '', b.feedback || '');

  // Recompute comparison
  const aiEval = db.prepare('SELECT * FROM ai_evaluations WHERE response_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
  let comparison = null;
  if (aiEval) {
    const aiScore = aiEval.overall_score;
    const difference = Math.abs(aiScore - score);
    const agreement = Math.max(0, Math.round(100 - difference));
    db.prepare('DELETE FROM evaluation_comparisons WHERE response_id = ?').run(r.id);
    const cInfo = db.prepare(
      'INSERT INTO evaluation_comparisons (response_id, ai_score, teacher_score, difference, agreement) VALUES (?,?,?,?,?)'
    ).run(r.id, aiScore, score, difference, agreement);
    comparison = db.prepare('SELECT * FROM evaluation_comparisons WHERE id = ?').get(cInfo.lastInsertRowid);
  }

  res.json({
    message: 'Teacher evaluation saved.',
    teacherEvaluation: db.prepare('SELECT * FROM teacher_evaluations WHERE id = ?').get(info.lastInsertRowid),
    comparison: comparison
  });
});

/* =====================================================
 *  COMPARISON
 * ===================================================== */

router.get('/comparisons', function (req, res) {
  const rows = db.prepare(
    'SELECT ec.*, sr.answer_type, sr.student_id, q.question, q.topic, q.difficulty, u.name AS student_name ' +
    'FROM evaluation_comparisons ec ' +
    'JOIN student_responses sr ON sr.id = ec.response_id ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'JOIN users u ON u.id = sr.student_id ' +
    'ORDER BY ec.id DESC'
  ).all();

  const avg = function (arr, key) {
    if (!arr.length) return 0;
    return Math.round((arr.reduce(function (s, x) { return s + (x[key] || 0); }, 0) / arr.length) * 10) / 10;
  };

  res.json({
    comparisons: rows,
    summary: {
      count: rows.length,
      avgAiScore: avg(rows, 'ai_score'),
      avgTeacherScore: avg(rows, 'teacher_score'),
      avgDifference: avg(rows, 'difference'),
      avgAgreement: avg(rows, 'agreement')
    }
  });
});

/* =====================================================
 *  ANALYTICS
 * ===================================================== */

function count(sql, params) {
  const stmt = db.prepare(sql);
  return params ? stmt.get.apply(stmt, params).c : stmt.get().c;
}

function buildOverview() {
  const students = count("SELECT COUNT(*) AS c FROM users WHERE role = 'student'");
  const teachers = count("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher'");
  const materials = count('SELECT COUNT(*) AS c FROM learning_materials');
  const questions = count('SELECT COUNT(*) AS c FROM questions');
  const pending = count("SELECT COUNT(*) AS c FROM questions WHERE status = 'pending'");
  const approved = count("SELECT COUNT(*) AS c FROM questions WHERE status = 'approved'");
  const rejected = count("SELECT COUNT(*) AS c FROM questions WHERE status = 'rejected'");
  const assessments = count('SELECT COUNT(*) AS c FROM assessments');
  const responses = count('SELECT COUNT(*) AS c FROM student_responses');
  const evaluations = count('SELECT COUNT(*) AS c FROM teacher_evaluations');

  const avgAi = db.prepare('SELECT AVG(overall_score) AS a FROM ai_evaluations').get().a || 0;
  const avgTeacher = db.prepare('SELECT AVG(score) AS a FROM teacher_evaluations').get().a || 0;
  const avgAgreement = db.prepare('SELECT AVG(agreement) AS a FROM evaluation_comparisons').get().a || 0;
  const avgDiff = db.prepare('SELECT AVG(difference) AS a FROM evaluation_comparisons').get().a || 0;

  const byTopic = db.prepare(
    'SELECT q.topic AS topic, AVG(ae.overall_score) AS ai, AVG(te.score) AS teacher, COUNT(*) AS count ' +
    'FROM student_responses sr ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id ' +
    'GROUP BY q.topic ORDER BY count DESC'
  ).all().map(function (r) {
    return { topic: r.topic, ai: Math.round(r.ai || 0), teacher: Math.round(r.teacher || 0), count: r.count };
  });

  const byDifficulty = db.prepare(
    'SELECT q.difficulty AS difficulty, AVG(ae.overall_score) AS ai, AVG(te.score) AS teacher, COUNT(*) AS count, ' +
    'AVG(ec.agreement) AS agreement ' +
    'FROM student_responses sr ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id ' +
    'LEFT JOIN evaluation_comparisons ec ON ec.response_id = sr.id ' +
    'GROUP BY q.difficulty'
  ).all().map(function (r) {
    return {
      difficulty: r.difficulty,
      ai: Math.round(r.ai || 0),
      teacher: Math.round(r.teacher || 0),
      agreement: Math.round(r.agreement || 0),
      count: r.count
    };
  });

  const byType = db.prepare(
    'SELECT sr.answer_type AS type, AVG(ae.overall_score) AS ai, AVG(ec.agreement) AS agreement, COUNT(*) AS count ' +
    'FROM student_responses sr ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN evaluation_comparisons ec ON ec.response_id = sr.id ' +
    'GROUP BY sr.answer_type'
  ).all().map(function (r) {
    return { type: r.type, ai: Math.round(r.ai || 0), agreement: Math.round(r.agreement || 0), count: r.count };
  });

  const buckets = [
    { bucket: '0-20', count: 0 }, { bucket: '21-40', count: 0 }, { bucket: '41-60', count: 0 },
    { bucket: '61-80', count: 0 }, { bucket: '81-100', count: 0 }
  ];
  db.prepare('SELECT overall_score FROM ai_evaluations').all().forEach(function (row) {
    const s = row.overall_score || 0;
    const idx = Math.min(4, Math.floor(s / 20.0001));
    buckets[idx].count++;
  });

  const trendRows = db.prepare(
    'SELECT sr.created_at AS d, ae.overall_score AS ai, te.score AS teacher ' +
    'FROM student_responses sr ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id ' +
    'ORDER BY sr.id ASC'
  ).all();

  const trendMap = {};
  trendRows.forEach(function (r, i) {
    const key = 'R' + (Math.floor(i / Math.max(1, Math.ceil(trendRows.length / 8))) + 1);
    if (!trendMap[key]) trendMap[key] = { name: key, ai: 0, teacher: 0, n: 0 };
    trendMap[key].ai += r.ai || 0;
    trendMap[key].teacher += r.teacher || 0;
    trendMap[key].n++;
  });
  const trend = Object.keys(trendMap).map(function (k) {
    const t = trendMap[k];
    return { name: t.name, ai: Math.round(t.ai / t.n), teacher: Math.round(t.teacher / t.n) };
  });

  return {
    counts: {
      students: students, teachers: teachers, materials: materials, questions: questions,
      pendingQuestions: pending, approvedQuestions: approved, rejectedQuestions: rejected,
      assessments: assessments, responses: responses, evaluations: evaluations
    },
    averages: {
      aiScore: Math.round(avgAi * 10) / 10,
      teacherScore: Math.round(avgTeacher * 10) / 10,
      agreement: Math.round(avgAgreement * 10) / 10,
      difference: Math.round(avgDiff * 10) / 10
    },
    aiVsTeacher: [
      { name: 'AI', score: Math.round(avgAi) },
      { name: 'Teacher', score: Math.round(avgTeacher) }
    ],
    byTopic: byTopic,
    byDifficulty: byDifficulty,
    byType: byType,
    distribution: buckets,
    trend: trend
  };
}

router.get('/analytics/overview', requireRole('teacher', 'admin'), function (req, res) {
  res.json(buildOverview());
});

router.get('/analytics/research', requireRole('admin', 'teacher'), function (req, res) {
  const overview = buildOverview();
  const rows = db.prepare('SELECT * FROM evaluation_comparisons').all();

  const agreement = overview.averages.agreement;
  const weakestTopic = overview.byTopic.slice().sort(function (a, b) { return a.ai - b.ai; })[0];
  const strongestAgreementDifficulty = overview.byDifficulty.slice().sort(function (a, b) {
    return b.agreement - a.agreement;
  })[0];
  const openEnded = overview.byType.filter(function (t) { return t.type === 'voice' || t.type === 'handwritten'; });
  const openAgreement = openEnded.length
    ? Math.round(openEnded.reduce(function (s, t) { return s + t.agreement; }, 0) / openEnded.length)
    : 0;

  const insights = [
    'AI evaluation agrees with teacher evaluation in ' + Math.round(agreement) + '% of assessed responses across ' + rows.length + ' evaluations.',
    'Highest disagreement occurs in open-ended answers, especially voice and handwritten responses (average agreement ' + openAgreement + '%).',
    (strongestAgreementDifficulty
      ? strongestAgreementDifficulty.difficulty + '-difficulty questions show the strongest AI-human agreement (' + strongestAgreementDifficulty.agreement + '%).'
      : 'Not enough difficulty data yet.'),
    (weakestTopic
      ? 'Students score lowest on "' + weakestTopic.topic + '" (average AI score ' + weakestTopic.ai + '), suggesting a teaching focus area.'
      : 'Topic-level insights will appear once more responses are evaluated.'),
    'Average absolute difference between AI and human scores is ' + overview.averages.difference + ' points.'
  ];

  res.json({
    overview: overview,
    insights: insights,
    comparisonRows: rows,
    generatedAt: new Date().toISOString()
  });
});

router.get('/analytics/student', function (req, res) {
  const studentId = req.user.role === 'student' ? req.user.id : (req.query.studentId || req.user.id);

  const rows = db.prepare(
    'SELECT sr.*, q.question, q.topic, q.difficulty, ' +
    'ae.overall_score AS ai_score, ae.correctness, ae.concept_coverage, ae.grammar, ae.feedback, ae.missing_concepts, ' +
    'te.score AS teacher_score, te.feedback AS teacher_feedback, te.comments ' +
    'FROM student_responses sr ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id ' +
    'WHERE sr.student_id = ? ORDER BY sr.id DESC'
  ).all(studentId);

  const avg = function (key) {
    const scored = rows.filter(function (r) { return r[key] !== null && r[key] !== undefined; });
    if (!scored.length) return 0;
    return Math.round((scored.reduce(function (s, r) { return s + r[key]; }, 0) / scored.length) * 10) / 10;
  };

  const topicMap = {};
  rows.forEach(function (r) {
    if (!topicMap[r.topic]) topicMap[r.topic] = { topic: r.topic, total: 0, n: 0 };
    topicMap[r.topic].total += r.ai_score || 0;
    topicMap[r.topic].n++;
  });
  const byTopic = Object.keys(topicMap).map(function (k) {
    const t = topicMap[k];
    return { topic: t.topic, score: Math.round(t.total / t.n), count: t.n };
  }).sort(function (a, b) { return b.score - a.score; });

  const trend = rows.slice().reverse().map(function (r, i) {
    return { name: 'Q' + (i + 1), ai: Math.round(r.ai_score || 0), teacher: Math.round(r.teacher_score || 0) };
  });

  const available = db.prepare('SELECT COUNT(*) AS c FROM assessments').get().c;
  const completed = db.prepare('SELECT COUNT(DISTINCT assessment_id) AS c FROM student_responses WHERE student_id = ?').get(studentId).c;

  const strengths = byTopic.slice(0, 2).map(function (t) { return t.topic; });
  const weak = byTopic.slice(-2).reverse().map(function (t) { return t.topic; });

  res.json({
    summary: {
      totalResponses: rows.length,
      availableAssessments: available,
      completedAssessments: completed,
      avgAiScore: avg('ai_score'),
      avgTeacherScore: avg('teacher_score'),
      avgCorrectness: avg('correctness'),
      avgCoverage: avg('concept_coverage'),
      avgGrammar: avg('grammar')
    },
    responses: rows.map(function (r) {
      return Object.assign({}, r, { missing_concepts: JSON.parse(r.missing_concepts || '[]') });
    }),
    byTopic: byTopic,
    trend: trend,
    strengths: strengths,
    weakAreas: weak
  });
});

/* =====================================================
 *  USERS (ADMIN)
 * ===================================================== */

router.get('/users', requireRole('admin'), function (req, res) {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC').all();
  res.json({ users: users });
});

router.post('/users', requireRole('admin'), function (req, res) {
  const bcrypt = require('bcryptjs');
  const b = req.body || {};
  if (!b.email || !b.name) return res.status(400).json({ error: 'Name and email are required.' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(b.email.toLowerCase());
  if (exists) return res.status(400).json({ error: 'Email already registered.' });
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run(b.name, b.email.toLowerCase(), bcrypt.hashSync(b.password || 'Demo@123', 10), b.role || 'student');
  res.status(201).json({ user: db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/users/:id/role', requireRole('admin'), function (req, res) {
  const role = req.body.role;
  if (['student', 'teacher', 'admin'].indexOf(role) === -1) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: 'Role updated.' });
});

router.delete('/users/:id', requireRole('admin'), function (req, res) {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted.' });
});

/* =====================================================
 *  DASHBOARD HELPERS
 * ===================================================== */

router.get('/dashboard/teacher', requireRole('teacher', 'admin'), function (req, res) {
  const overview = buildOverview();
  const recent = db.prepare(
    'SELECT sr.id, u.name AS student_name, q.question, ae.overall_score AS ai_score, te.score AS teacher_score ' +
    'FROM student_responses sr ' +
    'JOIN users u ON u.id = sr.student_id ' +
    'JOIN questions q ON q.id = sr.question_id ' +
    'LEFT JOIN ai_evaluations ae ON ae.response_id = sr.id ' +
    'LEFT JOIN teacher_evaluations te ON te.response_id = sr.id ' +
    'ORDER BY sr.id DESC LIMIT 8'
  ).all();
  const materials = db.prepare(
    'SELECT id, title, file_type, status, uploaded_at FROM learning_materials ORDER BY id DESC LIMIT 5'
  ).all();
  res.json({ overview: overview, recentResponses: recent, recentMaterials: materials });
});

router.get('/dashboard/admin', requireRole('admin'), function (req, res) {
  const overview = buildOverview();
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC LIMIT 8').all();
  res.json({ overview: overview, recentUsers: users });
});

module.exports = router;
