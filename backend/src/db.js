
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'app.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

/* ==================================================================
 * DATABASE DRIVER
 * ------------------------------------------------------------------
 * Primary: Node's BUILT-IN SQLite (node:sqlite, Node >= 22.5).
 *          -> no native compilation, no Visual Studio, no node-gyp.
 * Fallback: better-sqlite3 (only used if it happens to be installed).
 * Both are wrapped behind the same tiny better-sqlite3-like API.
 * ================================================================== */
function createDriver() {
  let raw = null;
  let kind = '';

  try {
    const { DatabaseSync } = require('node:sqlite');
    raw = new DatabaseSync(DB_PATH);
    kind = 'node:sqlite';
  } catch (builtinErr) {
    let Better = null;
    try {
      Better = require('better-sqlite3');
    } catch (fallbackErr) {
      console.error('');
      console.error('  [db] No usable SQLite driver was found.');
      console.error('       Current Node version: ' + process.version);
      console.error('       node:sqlite requires Node >= 22.5.');
      console.error('       Fix: upgrade Node, or run  cd backend && npm install better-sqlite3');
      console.error('');
      throw fallbackErr;
    }
    raw = new Better(DB_PATH);
    kind = 'better-sqlite3';
  }

  return {
    kind: kind,
    exec: function (sql) { raw.exec(sql); },
    pragma: function (s) { try { raw.exec('PRAGMA ' + s); } catch (e) { /* ignore */ } },
    prepare: function (sql) {
      const stmt = raw.prepare(sql);
      return {
        run: function () {
          const r = stmt.run.apply(stmt, arguments);
          return {
            changes: Number(r && r.changes !== undefined ? r.changes : 0),
            lastInsertRowid: Number(r && r.lastInsertRowid !== undefined ? r.lastInsertRowid : 0)
          };
        },
        get: function () { return stmt.get.apply(stmt, arguments); },
        all: function () { return stmt.all.apply(stmt, arguments); }
      };
    }
  };
}

const db = createDriver();
db.pragma('journal_mode = WAL');

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'student\', created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS otp_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code TEXT NOT NULL, purpose TEXT NOT NULL, payload TEXT, attempts INTEGER DEFAULT 0, consumed INTEGER DEFAULT 0, expires_at INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER DEFAULT 0, locked INTEGER DEFAULT 0, last_attempt TEXT)',
  'CREATE TABLE IF NOT EXISTS learning_materials (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, title TEXT NOT NULL, file_name TEXT, file_type TEXT, size INTEGER DEFAULT 0, stored_path TEXT, transcript TEXT, status TEXT DEFAULT \'uploaded\', uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(teacher_id) REFERENCES users(id))',
  'CREATE TABLE IF NOT EXISTS processed_contents (id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER NOT NULL, content TEXT, summary TEXT, topics TEXT, keywords TEXT, word_count INTEGER DEFAULT 0, processed_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(material_id) REFERENCES learning_materials(id))',
  'CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, teacher_id INTEGER, question TEXT NOT NULL, expected_answer TEXT, topic TEXT, difficulty TEXT DEFAULT \'Medium\', learning_objective TEXT, status TEXT DEFAULT \'pending\', source TEXT DEFAULT \'ai\', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS question_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL, reviewer_id INTEGER, action TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, material_id INTEGER, teacher_id INTEGER, question_ids TEXT, status TEXT DEFAULT \'active\', created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS student_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL, question_id INTEGER NOT NULL, student_id INTEGER NOT NULL, answer_type TEXT DEFAULT \'text\', answer_text TEXT, media_path TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS ai_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, overall_score REAL, correctness REAL, concept_coverage REAL, grammar REAL, incorrectness REAL, missing_concepts TEXT, feedback TEXT, pronunciation REAL, confidence REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS teacher_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, teacher_id INTEGER, score REAL, correctness REAL, comments TEXT, feedback TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS evaluation_comparisons (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER NOT NULL, ai_score REAL, teacher_score REAL, difference REAL, agreement REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, metric TEXT NOT NULL, value REAL, meta TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE INDEX IF NOT EXISTS idx_resp_assessment ON student_responses(assessment_id)',
  'CREATE INDEX IF NOT EXISTS idx_resp_student ON student_responses(student_id)',
  'CREATE INDEX IF NOT EXISTS idx_q_status ON questions(status)'
].join(';\n');

db.exec(SCHEMA);

module.exports = db;
module.exports.driver = db.kind;
