/**
 * AI SERVICE — the demo engine builds questions ONLY from the actual
 * sentences of the uploaded material. If it cannot find enough
 * sentences, it returns FEWER questions instead of recycling keywords.
 */

const STOPWORDS = {};
('the a an and or but if then than that this these those is are was were be been being to of in on for with as by at from it its their there here we you they he she i not no do does did can could should would will may might must about into over under more most other some such only own same so too very just don now also using used use which what when where who whom whose how why').split(' ').forEach(function (w) { STOPWORDS[w] = true; });

function words(text) {
  return String(text || '').toLowerCase().match(/[a-z][a-z0-9'-]{1,}/g) || [];
}
function keywords(text) {
  const list = words(text);
  const freq = {};
  list.forEach(function (w) {
    if (STOPWORDS[w] || w.length < 4) return;
    freq[w] = (freq[w] || 0) + 1;
  });
  const keys = Object.keys(freq);
  keys.sort(function (a, b) { return (freq[b] - freq[a]) || a.localeCompare(b); });
  return keys;
}
function uniqueKeywords(text) {
  const seen = {}; const out = [];
  keywords(text).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
  return out;
}
function hash(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0; }
  return h >>> 0;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ==================================================================
 * ROBUST SENTENCE SPLITTING
 * ------------------------------------------------------------------
 * Handles: normal punctuation, bullets, numbered lists, ALL-CAPS
 * headers, and line-per-sentence PDFs. Rejects fragments.
 * ================================================================== */

function splitSentences(text) {
  let t = String(text || '');

  // Normalise line endings and common bullet/number glyphs
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(/[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA]/g, '\n');   // bullets -> newline
  t = t.replace(/\u00A0/g, ' ');

  // Normalise numbered list starts (1. 2. 3.) to their own line
  t = t.replace(/(^|\n)\s*(\d{1,3})[.)]\s+/g, '$1\n');

  // Insert sentence break before capital letters preceded by punctuation
  t = t.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
  // Insert sentence break before capital after closing quote/paren
  t = t.replace(/([.!?]["')\]]?)\s+(?=[A-Z])/g, '$1\n');

  const rawLines = t.split('\n').map(function (s) { return s.replace(/\s+/g, ' ').trim(); });

  const sentences = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.length < 45) continue;        // too short to be a real sentence

    // If the line contains multiple sentences still joined, split again
    const parts = line.split(/(?<=[.!?])\s+/);
    parts.forEach(function (p) {
      p = p.trim();
      if (p.length < 45) return;
      if (p.length > 600) p = p.slice(0, 600);   // guard against giant blobs
      // reject lines that are mostly numbers or symbols
      const letterCount = (p.match(/[A-Za-z]/g) || []).length;
      if (letterCount < p.length * 0.5) return;
      // reject obvious headers (ALL CAPS short lines)
      const capsCount = (p.match(/[A-Z]/g) || []).length;
      if (p.length < 90 && capsCount > p.length * 0.6) return;
      sentences.push(p);
    });
  }

  // Deduplicate identical sentences (common in PDF headers/footers)
  const seen = new Set();
  const out = [];
  sentences.forEach(function (s) {
    const key = s.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });

  return out;
}

function hasApiKey() {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 10;
}

async function callOpenAI(messages, temperature) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: model, messages: messages, temperature: temperature || 0.4 })
  });
  if (!res.ok) throw new Error('OpenAI HTTP ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

/* ---------------- CONTENT ANALYSIS ---------------- */

function analyzeContent(text) {
  const sentences = splitSentences(text);
  const keys = uniqueKeywords(text).slice(0, 12);
  const summary = sentences.slice(0, 3).join('. ').slice(0, 400) + (sentences.length > 3 ? '.' : '');
  return {
    content: String(text || '').trim(),
    summary: summary || String(text || '').slice(0, 300),
    topics: keys.slice(0, 5).map(cap),
    keywords: keys,
    wordCount: words(text).length,
    sentenceCount: sentences.length
  };
}

/* ==================================================================
 * SENTENCE -> QUESTION
 * ================================================================== */

function naturalSubject(s) {
  return String(s || '').trim().replace(/^(The|A|An)\s+/, function (m) { return m.toLowerCase(); });
}
function verbFor(subject) {
  const last = String(subject || '').trim().split(/\s+/).pop() || '';
  if (/s$/.test(last) && !/ss$/.test(last)) return 'do';
  return 'does';
}
function extractSubject(sentence) {
  const m = sentence.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)(?:\s+(?:is|are|provides?|allows?|includes?|contains?|works?|uses?|requires?|depends?|translates?|converts?|forwards?|routes?|sends?|refers?|means?|denotes?|delivers?|gives?|enables?|offers?|supplies?|supports?|comprises?|consists?|involves?|maps?))/);
  if (m) return m[1].trim();
  var guess = sentence.split(/\s+/).slice(0, 4).join(' ');
  guess = guess.replace(/[.,;:!?]+$/, '').trim();
  // Strip trailing verbs if any leaked in
  guess = guess.replace(/\s+(refers|refer|is|are|was|were|means|mean|denotes|denote|includes|include|contains|contain|consists|consist|comprises|comprise|involves|involve|requires|require|needs|need|uses|use|works|work|functions|function|acts|act|behaves|behave|provides|provide|gives|give|delivers|deliver|offers|offer|supplies|supply|allows|allow|enables|enable|permits|permit|lets|let|supports|support|translates|translate|converts|convert|transforms|transform|maps|map|forwards|forward|routes|route|sends|send|depends|depend|relies|rely)$/i, '');
  return guess;
}

/* -----------------------------------------------------------------
 * Rotating generic question styles.
 * Two similar sentences will get DIFFERENT styles because the
 * style is chosen by a hash of the sentence, plus a global offset.
 * ----------------------------------------------------------------- */
const QUESTION_STYLES = [
  function (t) { return 'Define "' + t + '".'; },
  function (t) { return 'What is "' + t + '"? Explain it in your own words.'; },
  function (t) { return 'Describe "' + t + '" and explain its role in the system.'; },
  function (t) { return 'Explain the concept of "' + t + '" with a concrete example.'; },
  function (t) { return 'Why is "' + t + '" important in this subject? Justify your answer.'; },
  function (t) { return 'How does "' + t + '" work? Explain step by step.'; },
  function (t) { return 'What are the key features of "' + t + '"?'; },
  function (t) { return 'Compare and contrast "' + t + '" with a related concept.'; },
  function (t) { return 'List the main characteristics of "' + t + '".'; },
  function (t) { return 'Give a real-world example that illustrates "' + t + '".'; }
];
let __styleOffset = 0;

function pickStyle(key) {
  const idx = (hash(key) + __styleOffset) % QUESTION_STYLES.length;
  __styleOffset = (__styleOffset + 1) % QUESTION_STYLES.length;
  return QUESTION_STYLES[idx];
}

function cleanTerm(t) {
  return String(t || '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[\s\-:]+$/, '')
    .trim();
}

/* ---------------- SUBJECT / QUESTION QUALITY GATE ---------------- */

const PRONOUN_SUBJECTS = /^(They|It|This|That|These|Those|We|You|He|She|I|There|Here|Such|Some|Many|Most|All|Both|Each|Every|Either|Neither|None|Any|One|Another|Others|Them|Us|Me|Him|Her|Its|Their|Our|Your|My|His)\b/i;

const BAD_SUBJECT_CHARS = /[\/\\|<>(){}[\]@#$%^&*+=~`"]/;

const TRAILING_VERBS = /\b(refers|refer|is|are|was|were|means|mean|denotes|denote|includes|include|contains|contain|consists|consist|comprises|comprise|involves|involve|requires|require|needs|need|uses|use|works|work|functions|function|acts|act|behaves|behave|provides|provide|gives|give|delivers|deliver|offers|offer|supplies|supply|allows|allow|enables|enable|permits|permit|lets|let|supports|support|translates|translate|converts|convert|transforms|transform|maps|map|forwards|forward|routes|route|sends|send|depends|depend|relies|rely|has|have|had|can|could|will|would|should|may|might|must)$/i;

function isGoodSubject(s) {
  if (!s) return false;
  s = String(s).trim();
  if (s.length < 3 || s.length > 80) return false;
  const words = s.split(/\s+/);
  if (words.length === 0 || words.length > 8) return false;
  if (PRONOUN_SUBJECTS.test(words[0])) return false;
  if (BAD_SUBJECT_CHARS.test(s)) return false;
  if (TRAILING_VERBS.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (/^[a-z]/.test(s)) return false;
  return true;
}

function isGoodQuestion(q) {
  if (!q || q.length < 12) return false;
  var badStart = /^\s*(Describe|Define|What is|What are|Explain|Why|How|List|Compare|Give)\s+["']?(They|It|This|That|These|Those|We|You|He|She|I|There|Here)\b/i;
  if (badStart.test(q)) return false;
  if (/["'][^"']{0,2}["']/.test(q)) return false;
  if (/\b(refers|denotes|consists|comprises)\b\s*["']?\s*$/i.test(q)) return false;
  return true;
}

function sentenceToQuestion(sentence) {
  const s = sentence.trim().replace(/\s+/g, ' ');
  let m;

  /* ---- 0. "Term - definition" or "Term: definition" bullet ---- */
  // Handles: "Assembly Language Level - Symbolic machine language"
  //          "Instruction Set Architecture (ISA) - Machine language interface"
  //          "TCP: reliable transport protocol"
  m = s.match(/^([A-Z][A-Za-z0-9\s\(\)\/\.]{2,80}?)\s*[\-\u2013\u2014:]\s+(.{12,})$/);
  if (m) {
    const term = cleanTerm(m[1]);
    const def = m[2].trim();
    if (term && term.split(/\s+/).length <= 10) {
      const style = pickStyle(term);
      return {
        question: style(term),
        expectedAnswer: def + ' (as defined in the study material)',
        difficulty: (QUESTION_STYLES.indexOf(style) >= 5) ? 'Medium' : 'Easy',
        focus: term
      };
    }
  }

  /* ---- 1. "X is/are used for/to Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(?:is|are)\s+(?:used|employed|applied)\s+(?:for|to)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim();
    return { question: 'What is ' + naturalSubject(subj) + ' used for? Provide a concrete example.', difficulty: 'Easy', focus: subj };
  }

  /* ---- 2. "X refers to / means / denotes Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(?:refers to|means|denotes|is defined as|is known as)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim();
    return { question: 'What does ' + naturalSubject(subj) + ' mean? Give a clear definition in your own words.', difficulty: 'Easy', focus: subj };
  }

  /* ---- 3. "X works/operates/functions by Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(?:works?|operates?|functions?|acts?|behaves?)\s+by\s+(.+)$/);
  if (m) {
    const subj = m[1].trim();
    return { question: 'How does ' + naturalSubject(subj) + ' work? Explain the mechanism in detail.', difficulty: 'Medium', focus: subj };
  }

  /* ---- 4. "X provides/gives/delivers/offers/supplies Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(provides?|gives?|delivers?|offers?|supplies?)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim(); const verb = m[2].toLowerCase(); const aux = verbFor(subj);
    return { question: 'What ' + aux + ' ' + naturalSubject(subj) + ' ' + verb + '? Describe it with an example.', difficulty: 'Medium', focus: subj };
  }

  /* ---- 5. "X allows/enables/permits/lets/supports Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(allows?|enables?|permits?|lets?|supports?)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim(); const verb = m[2].toLowerCase(); const aux = verbFor(subj);
    return { question: 'What ' + aux + ' ' + naturalSubject(subj) + ' ' + verb + '? Explain the impact.', difficulty: 'Medium', focus: subj };
  }

  /* ---- 6. "X includes/contains/comprises/consists of/involves Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(includes?|contains?|comprises?|consists?\s+of|involves?)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim(); const verb = m[2].toLowerCase().replace(/\s+/g, ' '); const aux = verbFor(subj);
    return { question: 'What ' + aux + ' ' + naturalSubject(subj) + ' ' + verb + '? List the key elements.', difficulty: 'Easy', focus: subj };
  }

  /* ---- 7. "X requires/needs/depends on/relies on Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(requires?|needs?|depends?\s+on|relies?\s+on)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim(); const verb = m[2].toLowerCase().replace(/\s+/g, ' '); const aux = verbFor(subj);
    return { question: 'What ' + aux + ' ' + naturalSubject(subj) + ' ' + verb + '? Explain why this dependency exists.', difficulty: 'Medium', focus: subj };
  }

  /* ---- 8. "X translates/converts/transforms/maps/forwards/routes/sends Y" ---- */
  m = s.match(/^(?:The\s+|A\s+|An\s+)?([A-Z][\w\s\-]{2,60}?)\s+(translates?|converts?|transforms?|maps?|forwards?|routes?|sends?)\s+(.+)$/);
  if (m) {
    const subj = m[1].trim(); const verb = m[2].toLowerCase(); const aux = verbFor(subj);
    return { question: 'What ' + aux + ' ' + naturalSubject(subj) + ' ' + verb + '? Provide a concrete example.', difficulty: 'Medium', focus: subj };
  }

  /* ---- 9. "X is a/an/the Y" (definition with article) ---- */
  m = s.match(/^(?:(The|A|An)\s+)?([A-Z][\w\s\-]{2,60}?)\s+(?:is|are)\s+(?:a|an|the)\s+(.+)$/);
  if (m) {
    const art = (m[1] || '').toLowerCase(); const subj = m[2].trim();
    const full = art ? (art + ' ' + subj) : subj;
    return { question: 'What is ' + naturalSubject(full) + '? Define it and explain its role.', difficulty: 'Easy', focus: subj };
  }

  /* ---- 10. "X is/are Y" (general copula) ---- */
  m = s.match(/^(?:(The|A|An)\s+)?([A-Z][\w\s\-]{2,60}?)\s+(?:is|are)\s+(?!not\b)(.+)$/);
  if (m) {
    const art = (m[1] || '').toLowerCase(); const subj = m[2].trim();
    const full = art ? (art + ' ' + subj) : subj;
    return { question: 'What is ' + naturalSubject(full) + '? Explain clearly.', difficulty: 'Easy', focus: subj };
  }

  /* ---- 11. "Why ... because ..." ---- */
  if (/\bbecause\b/i.test(s)) {
    const head = s.split(/\bbecause\b/i)[0].trim().replace(/^(The|A|An)\s+/i, '');
    return { question: 'Why ' + head.charAt(0).toLowerCase() + head.slice(1) + '? Justify your answer with reasoning.', difficulty: 'Hard', focus: head.slice(0, 60) };
  }

  /* ---- 12. FINAL fallback — still rotated so nothing repeats ---- */
  const subject = extractSubject(s);
  if (isGoodSubject(subject)) {
    const style = pickStyle(s);
    return {
      question: style(cleanTerm(subject)),
      expectedAnswer: s,
      difficulty: 'Medium',
      focus: subject
    };
  }
  // Last resort: quote the sentence as an "elaborate on this statement" question
  const trimmed = s.length > 150 ? s.slice(0, 150) + '...' : s;
  return {
    question: 'Based on the study material, elaborate on the following statement in your own words: "' + trimmed + '"',
    expectedAnswer: s,
    difficulty: 'Medium',
    focus: extractSubject(s) || 'general'
  };
}

/* ==================================================================
 * DEMO QUESTION GENERATION
 * -- STRICT: only sentences. No keyword recycling.
 * ================================================================== */

function demoQuestions(content, count, topicHint) {
  const wanted = clamp(parseInt(count, 10) || 5, 1, 10);
  const sentences = splitSentences(content);

  // Score sentences for informativeness
  const scored = sentences.map(function (s, i) {
    let score = 0;
    if (/\b(is|are|refers to|means|is defined as|is known as)\b/.test(s)) score += 4;
    if (/\b(provides?|gives?|delivers?|allows?|enables?|includes?|contains?|works? by|used for|used to|requires?|depends on|translates?|converts?|forwards?|routes?|sends?)\b/.test(s)) score += 3;
    if (/\bbecause\b/.test(s)) score += 2;
    score += Math.min(4, uniqueKeywords(s).length);
    const wc = s.split(/\s+/).length;
    if (wc >= 10 && wc <= 45) score += 2;
    return { s: s, i: i, score: score };
  });
  scored.sort(function (a, b) { return (b.score - a.score) || (a.i - b.i); });

  const out = [];
  const usedQText = new Set();
  const usedAnsKey = new Set();
  const usedSubject = new Set();

  function tryAdd(item) {
    const ansKey = item.s.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (usedAnsKey.has(ansKey)) return false;
    const q = sentenceToQuestion(item.s);
    if (!isGoodQuestion(q.question)) return false;
    const qKey = q.question.toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
    if (usedQText.has(qKey)) return false;
    const subjKey = String(q.focus || '').toLowerCase().slice(0, 30);
    if (subjKey && subjKey.length > 3 && usedSubject.has(subjKey)) return false;

    usedQText.add(qKey);
    usedAnsKey.add(ansKey);
    if (subjKey && subjKey.length > 3) usedSubject.add(subjKey);
    out.push({
      question: q.question,
      expectedAnswer: item.s,
      topic: topicHint || cap(String(q.focus || 'General').split(/\s+/).slice(0, 2).join(' ')),
      difficulty: q.difficulty,
      learningObjective: 'Understand and explain: ' + String(q.focus || item.s.slice(0, 60))
    });
    return true;
  }

  // Pass 1: prefer unique subjects
  for (let k = 0; k < scored.length && out.length < wanted; k++) tryAdd(scored[k]);
  // Pass 2: allow reuse of subject but still require unique question + answer
  for (let k = 0; k < scored.length && out.length < wanted; k++) tryAdd(scored[k]);

  // Log what happened so the teacher (and console) can see
  console.log('[aiService] demoQuestions: ' + sentences.length + ' sentences found, '
    + out.length + ' unique questions produced (requested ' + wanted + ').');

  // Return whatever we got — FEWER is fine, recycled is not.
  return out;
}

/* ---------------- OPENAI PATH ---------------- */

async function generateQuestions(content, count, topicHint) {
  const n = clamp(parseInt(count, 10) || 5, 1, 10);
  if (hasApiKey()) {
    try {
      const prompt =
        'You are an expert exam question generator. From the study material below, generate ' +
        n + ' assessment questions. Return ONLY a JSON array. Each element must have keys: ' +
        'question, expectedAnswer, topic, difficulty (Easy|Medium|Hard), learningObjective.' + NL + NL +
        'MATERIAL:' + NL + String(content).slice(0, 6000);
      const raw = await callOpenAI([
        { role: 'system', content: 'You output strict JSON only.' },
        { role: 'user', content: prompt }
      ], 0.4);
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length) return parsed.slice(0, n);
    } catch (e) {
      console.warn('[aiService] OpenAI question generation failed, using demo engine:', e.message);
    }
  }
  return demoQuestions(content, n, topicHint);
}

/* ---------------- ANSWER EVALUATION ---------------- */

function generateFeedback(score, missing, answerType, coverage) {
  const parts = [];
  if (score >= 85) parts.push('Excellent answer - you covered the core concepts accurately and explained them clearly.');
  else if (score >= 70) parts.push('Good answer - the main idea is correct, but the explanation could be more complete.');
  else if (score >= 50) parts.push('Partially correct - you touched on the topic but several important ideas are missing.');
  else parts.push('Your answer needs significant improvement - the core concept was not clearly addressed.');
  if (missing.length) parts.push('Missing concepts: ' + missing.slice(0, 4).join(', ') + '.');
  else parts.push('You covered all the key concepts expected in the answer.');
  if (coverage < 0.6) parts.push('Try to structure your answer around the definition, the mechanism, and a real example.');
  if (answerType === 'voice') parts.push('Your spoken delivery was reasonably clear - keep practising fluency and pacing.');
  if (answerType === 'handwritten') parts.push('Your handwritten response was transcribed successfully; focus on legibility and structure.');
  return parts.join(' ');
}

function demoEvaluation(question, expectedAnswer, studentAnswer, answerType) {
  const ek = uniqueKeywords(expectedAnswer);
  const studentSet = {};
  uniqueKeywords(studentAnswer).forEach(function (k) { studentSet[k] = true; });
  const hit = ek.filter(function (k) { return studentSet[k]; });
  const missing = ek.filter(function (k) { return !studentSet[k]; });
  const coverage = ek.length ? hit.length / ek.length : 0;
  const answerWords = words(studentAnswer).length;
  const lengthFactor = clamp(answerWords / 28, 0, 1);
  const noise = (hash(String(studentAnswer) + String(question)) % 9) - 4;
  let correctness = Math.round(100 * (0.62 * coverage + 0.38 * lengthFactor)) + noise;
  correctness = clamp(correctness, 5, 98);
  const conceptCoverage = clamp(Math.round(coverage * 100) + (noise > 0 ? 3 : -2), 0, 100);
  const grammar = clamp(Math.round(66 + lengthFactor * 28 + (answerWords > 12 ? 4 : -6)), 35, 99);
  const incorrectness = clamp(100 - correctness, 2, 95);
  const overall = clamp(Math.round(0.48 * correctness + 0.32 * conceptCoverage + 0.20 * grammar), 0, 100);
  const feedback = generateFeedback(overall, missing, answerType, coverage);
  const result = {
    overallScore: overall, correctness: correctness, conceptCoverage: conceptCoverage,
    grammar: grammar, incorrectness: incorrectness,
    missingConcepts: missing.slice(0, 6), feedback: feedback, engine: 'demo'
  };
  if (answerType === 'voice') {
    result.pronunciation = clamp(72 + (hash(studentAnswer) % 24), 40, 99);
    result.confidence = clamp(68 + (hash(question + studentAnswer) % 28), 35, 99);
  }
  return result;
}

async function evaluateAnswer(question, expectedAnswer, studentAnswer, answerType) {
  const type = answerType || 'text';
  if (hasApiKey()) {
    try {
      const prompt =
        'Evaluate the student answer. Return ONLY JSON with keys: overallScore (0-100), ' +
        'correctness (0-100), conceptCoverage (0-100), grammar (0-100), incorrectness (0-100), ' +
        'missingConcepts (array of strings), feedback (string).' +
        (type === 'voice' ? ' Also include pronunciation (0-100) and confidence (0-100).' : '') +
        NL + NL + 'QUESTION: ' + question + NL + 'EXPECTED ANSWER: ' + expectedAnswer +
        NL + 'STUDENT ANSWER (' + type + '): ' + studentAnswer;
      const raw = await callOpenAI([
        { role: 'system', content: 'You are a strict but fair academic evaluator that outputs strict JSON only.' },
        { role: 'user', content: prompt }
      ], 0.2);
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      parsed.engine = 'openai';
      return parsed;
    } catch (e) {
      console.warn('[aiService] OpenAI evaluation failed, using demo engine:', e.message);
    }
  }
  return demoEvaluation(question, expectedAnswer, studentAnswer, type);
}

module.exports = {
  generateQuestions: generateQuestions,
  evaluateAnswer: evaluateAnswer,
  generateFeedback: generateFeedback,
  analyzeContent: analyzeContent,
  keywords: keywords,
  uniqueKeywords: uniqueKeywords,
  isLive: hasApiKey,
  demoQuestions: demoQuestions,
  demoEvaluation: demoEvaluation,
  splitSentences: splitSentences
};
