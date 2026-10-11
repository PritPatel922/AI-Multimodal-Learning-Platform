
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  Card, Stat, Badge, Button, Spinner, EmptyState, useToast,
  Progress, PageHeader, ScoreRing, MetricBar
} from '../components/ui';

const chartTip = {
  contentStyle: { background: '#111a2e', border: '1px solid #1f2e4d', borderRadius: 10, color: '#e9eefb', fontSize: 12 }
};

/* ---------------- DASHBOARD ---------------- */
export function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const navigate = useNavigate();

  useEffect(function () {
    api.get('/analytics/student').then(setData).catch(function () {});
    api.get('/assessments').then(function (r) { setAssessments(r.assessments); }).catch(function () {});
  }, []);

  if (!data) return <Spinner label="Loading your dashboard..." />;

  const s = data.summary;
  const pending = assessments.filter(function (a) { return !a.completed; });

  return (
    <div>
      <PageHeader
        title={'Welcome back, ' + user.name.split(' ')[0] + ' 👋'}
        subtitle="Here is your learning performance overview"
        actions={<Button variant="primary" onClick={function () { navigate('/student/assessments'); }}>Start an assessment</Button>}
      />

      <div className="grid grid-4">
        <Stat label="Avg AI Score" value={s.avgAiScore || 0} hint="across all answers" />
        <Stat label="Avg Teacher Score" value={s.avgTeacherScore || 0} hint="human evaluation" />
        <Stat label="Answers Submitted" value={s.totalResponses} hint={s.completedAssessments + ' assessment(s) completed'} />
        <Stat label="Concept Coverage" value={(s.avgCoverage || 0) + '%'} hint="AI measured" />
      </div>

      <div className="grid grid-2 mt-16">
        <Card title="Performance trend" subtitle="AI vs teacher score per answer">
          {data.trend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
                <XAxis dataKey="name" stroke="#8b9dc4" fontSize={12} />
                <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
                <Tooltip {...chartTip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="ai" name="AI score" stroke="#6366f1" strokeWidth={2.5} />
                <Line type="monotone" dataKey="teacher" name="Teacher score" stroke="#22d3ee" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No answers yet" message="Attempt an assessment to see your trend." />}
        </Card>

        <Card title="Topic performance" subtitle="Average AI score per topic">
          {data.byTopic.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byTopic}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
                <XAxis dataKey="topic" stroke="#8b9dc4" fontSize={11} />
                <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
                <Tooltip {...chartTip} />
                <Bar dataKey="score" name="Score" fill="#a855f7" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No topic data" message="Complete an assessment first." />}
        </Card>
      </div>

      <div className="grid grid-2 mt-16">
        <Card title="Pending assessments" subtitle={pending.length + ' to attempt'}>
          {pending.length ? pending.map(function (a) {
            return (
              <div key={a.id} className="row-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{a.title}</strong>
                  <div className="tiny muted">{a.question_count} questions · {a.teacher_name}</div>
                </div>
                <Button size="sm" variant="primary" onClick={function () { navigate('/student/assessment/' + a.id); }}>Attempt</Button>
              </div>
            );
          }) : <EmptyState icon="🎉" title="All caught up" message="You have completed every available assessment." />}
        </Card>

        <Card title="Strengths & weak areas" subtitle="Derived from your topic performance">
          <div className="mb-12">
            <div className="tiny muted mb-8">STRENGTHS</div>
            <div className="row wrap">
              {data.strengths.length ? data.strengths.map(function (t) { return <Badge key={t} tone="green">{t}</Badge>; })
                : <span className="small muted">Not enough data yet</span>}
            </div>
          </div>
          <div>
            <div className="tiny muted mb-8">AREAS TO IMPROVE</div>
            <div className="row wrap">
              {data.weakAreas.length ? data.weakAreas.map(function (t) { return <Badge key={t} tone="amber">{t}</Badge>; })
                : <span className="small muted">Not enough data yet</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- ASSESSMENT LIST ---------------- */
export function StudentAssessments() {
  const [items, setItems] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(function () {
    api.get('/assessments').then(function (r) { setItems(r.assessments); })
      .catch(function (e) { toast(e.message, 'error'); });
  }, []);

  if (!items) return <Spinner label="Loading assessments..." />;

  return (
    <div>
      <PageHeader title="Available Assessments" subtitle="Questions generated by AI and approved by your teacher" />
      {items.length ? (
        <div className="grid grid-3">
          {items.map(function (a) {
            const pct = a.question_count ? Math.round((a.answered_count / a.question_count) * 100) : 0;
            return (
              <Card key={a.id}>
                <div className="row-between mb-8">
                  <Badge tone={a.completed ? 'green' : pct > 0 ? 'amber' : 'blue'}>
                    {a.completed ? 'Completed' : pct > 0 ? 'In progress' : 'New'}
                  </Badge>
                  <span className="tiny muted">{a.question_count} questions</span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15.5 }}>{a.title}</h3>
                <p className="small muted" style={{ margin: '0 0 14px', minHeight: 38 }}>{a.description}</p>
                <Progress value={pct} />
                <div className="tiny muted mt-8">{a.answered_count} of {a.question_count} answered</div>
                <Button
                  variant="primary" block className="mt-16"
                  onClick={function () { navigate('/student/assessment/' + a.id); }}
                >
                  {a.completed ? 'Review answers' : pct > 0 ? 'Continue' : 'Start assessment'}
                </Button>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon="📋" title="No assessments available" message="Your teacher has not published an assessment yet." />}
    </div>
  );
}

/* ---------------- TAKE ASSESSMENT ---------------- */
export function TakeAssessment() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [types, setTypes] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState({});

  function load() {
    api.get('/assessments/' + id).then(function (r) {
      setData(r);
      const t = {};
      r.questions.forEach(function (q) { t[q.id] = 'text'; });
      setTypes(t);
      r.responses.forEach(function (resp) {
        api.get('/responses/' + resp.id).then(function (d) {
          setResults(function (prev) { return Object.assign({}, prev, { [resp.question_id]: d }); });
        });
      });
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  useEffect(function () { load(); }, [id]);

  function setAnswer(qid, v) { setAnswers(function (p) { return Object.assign({}, p, { [qid]: v }); }); }
  function setType(qid, v) { setTypes(function (p) { return Object.assign({}, p, { [qid]: v }); }); }
  function setBusyFor(qid, v) { setBusy(function (p) { return Object.assign({}, p, { [qid]: v }); }); }

  async function submit(q) {
    const text = answers[q.id] || '';
    if (text.trim().length < 3) { toast('Please write or generate an answer first.', 'error'); return; }
    setBusyFor(q.id, true);
    try {
      const r = await api.post('/responses', {
        assessmentId: Number(id),
        questionId: q.id,
        answerType: types[q.id] || 'text',
        answerText: text
      });
      const detail = await api.get('/responses/' + r.response.id);
      setResults(function (p) { return Object.assign({}, p, { [q.id]: detail }); });
      toast('Answer submitted. AI score: ' + Math.round(r.evaluation.overall_score) + '/100', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyFor(q.id, false);
    }
  }

  async function simulateVoice(q) {
    setBusyFor(q.id, true);
    try {
      const fd = new FormData();
      fd.append('file', new Blob(['demo-audio'], { type: 'audio/webm' }), 'answer.webm');
      const r = await api.post('/speech-to-text', fd);
      setAnswer(q.id, r.transcript);
      setType(q.id, 'voice');
      toast('Speech-to-text complete (demo engine).', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusyFor(q.id, false); }
  }

  async function uploadHandwritten(q, file) {
    setBusyFor(q.id, true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/ocr', fd);
      setAnswer(q.id, r.text);
      setType(q.id, 'handwritten');
      toast('Handwriting recognised (demo OCR engine).', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusyFor(q.id, false); }
  }

  if (!data) return <Spinner label="Loading assessment..." />;

  return (
    <div>
      <PageHeader
        title={data.assessment.title}
        subtitle={data.questions.length + ' questions · answer with text, voice or handwriting'}
        actions={<Badge tone="blue">AI evaluated instantly</Badge>}
      />

      {data.questions.map(function (q, idx) {
        const result = results[q.id];
        const mode = types[q.id] || 'text';
        return (
          <div key={q.id} className="q-card mb-16">
            <div className="row-between wrap">
              <div className="row wrap">
                <Badge tone="violet">Q{idx + 1}</Badge>
                <Badge tone={q.difficulty === 'Easy' ? 'green' : q.difficulty === 'Hard' ? 'red' : 'amber'}>{q.difficulty}</Badge>
                <Badge tone="gray">{q.topic}</Badge>
              </div>
              {result ? <Badge tone="green">Evaluated</Badge> : null}
            </div>

            <div className="q-text">{q.question}</div>

            {q.learning_objective ? (
              <div className="tiny muted mb-12">🎯 {q.learning_objective}</div>
            ) : null}

            {!result ? (
              <div>
                <div className="tabs mb-12">
                  <button className={'tab' + (mode === 'text' ? ' active' : '')} onClick={function () { setType(q.id, 'text'); }}>✎ Text</button>
                  <button className={'tab' + (mode === 'voice' ? ' active' : '')} onClick={function () { setType(q.id, 'voice'); }}>🎙 Voice</button>
                  <button className={'tab' + (mode === 'handwritten' ? ' active' : '')} onClick={function () { setType(q.id, 'handwritten'); }}>✍ Handwritten</button>
                </div>

                {mode === 'text' ? (
                  <textarea
                    className="input"
                    placeholder="Type your answer here..."
                    value={answers[q.id] || ''}
                    onChange={function (e) { setAnswer(q.id, e.target.value); }}
                  />
                ) : null}

                {mode === 'voice' ? (
                  <div>
                    <div className="demo-panel mb-12">
                      <strong>Voice Answer</strong>
                      Record your answer and the platform converts speech to text, then evaluates it.
                      Demo STT engine is used when no external provider is configured.
                    </div>
                    <div className="row wrap mb-12">
                      <Button size="sm" onClick={function () { simulateVoice(q); }} disabled={busy[q.id]}>
                        {busy[q.id] ? 'Transcribing...' : '🎙 Record & transcribe'}
                      </Button>
                      <span className="tiny muted">or type the transcript below</span>
                    </div>
                    <textarea
                      className="input"
                      placeholder="Transcript appears here..."
                      value={answers[q.id] || ''}
                      onChange={function (e) { setAnswer(q.id, e.target.value); }}
                    />
                  </div>
                ) : null}

                {mode === 'handwritten' ? (
                  <div>
                    <div className="demo-panel mb-12">
                      <strong>Handwritten Answer</strong>
                      Upload a photo of your handwritten answer. OCR extracts the text and AI evaluates it.
                    </div>
                    <input
                      type="file" accept="image/*" className="input"
                      onChange={function (e) { if (e.target.files[0]) uploadHandwritten(q, e.target.files[0]); }}
                    />
                    <textarea
                      className="input mt-12"
                      placeholder="Extracted text appears here..."
                      value={answers[q.id] || ''}
                      onChange={function (e) { setAnswer(q.id, e.target.value); }}
                    />
                  </div>
                ) : null}

                <div className="row-between mt-16">
                  <span className="tiny muted">
                    {answers[q.id] ? (answers[q.id].trim().split(' ').length + ' words') : 'No answer yet'}
                  </span>
                  <Button variant="primary" onClick={function () { submit(q); }} disabled={busy[q.id]}>
                    {busy[q.id] ? 'Evaluating...' : 'Submit & evaluate'}
                  </Button>
                </div>
              </div>
            ) : (
              <AIResultPanel detail={result} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- RESULT PANEL ---------------- */
export function AIResultPanel(props) {
  const d = props.detail;
  const ai = d.aiEvaluation;
  const te = d.teacherEvaluation;

  if (!ai) return <EmptyState title="Not evaluated" message="Submit an answer to get AI feedback." />;

  return (
    <div>
      <div className="grid grid-3 mb-16">
        <div className="card" style={{ textAlign: 'center' }}>
          <ScoreRing value={ai.overall_score} label="AI overall score" />
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="tiny muted mb-8">AI METRICS</div>
          <MetricBar name="Correctness" value={ai.correctness} />
          <MetricBar name="Concept coverage" value={ai.concept_coverage} />
          <MetricBar name="Grammar" value={ai.grammar} />
          <MetricBar name="Incorrectness" value={ai.incorrectness} />
          {ai.pronunciation ? <MetricBar name="Pronunciation" value={ai.pronunciation} /> : null}
          {ai.confidence ? <MetricBar name="Confidence" value={ai.confidence} /> : null}
        </div>
      </div>

      <div className="card mb-16">
        <div className="tiny muted mb-8">AI FEEDBACK</div>
        <div style={{ lineHeight: 1.65 }}>{ai.feedback}</div>
        {ai.missing_concepts && ai.missing_concepts.length ? (
          <div className="mt-12">
            <div className="tiny muted mb-8">MISSING CONCEPTS</div>
            <div className="row wrap">
              {ai.missing_concepts.map(function (m) { return <Badge key={m} tone="red">{m}</Badge>; })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="row-between mb-8">
          <div className="tiny muted">TEACHER EVALUATION</div>
          {te ? <Badge tone="cyan">Score {Math.round(te.score)}</Badge> : <Badge tone="gray">Pending review</Badge>}
        </div>
        {te ? (
          <div>
            <div style={{ lineHeight: 1.65 }}>{te.feedback || te.comments || 'No comment provided.'}</div>
            {d.comparison ? (
              <div className="row wrap mt-12">
                <Badge tone="blue">AI {Math.round(d.comparison.ai_score)}</Badge>
                <Badge tone="cyan">Teacher {Math.round(d.comparison.teacher_score)}</Badge>
                <Badge tone="violet">Agreement {Math.round(d.comparison.agreement)}%</Badge>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="small muted">Your teacher has not evaluated this answer yet.</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- RESULTS ---------------- */
export function StudentResults() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(function () {
    api.get('/analytics/student').then(setData).catch(function () {});
  }, []);

  if (!data) return <Spinner label="Loading results..." />;

  if (!data.responses.length) {
    return <EmptyState icon="📊" title="No results yet" message="Attempt an assessment to see your results and feedback." />;
  }

  const radar = data.byTopic.map(function (t) { return { topic: t.topic, score: t.score }; });

  return (
    <div>
      <PageHeader title="My Results" subtitle="AI evaluation, teacher feedback and personalised insights" />

      <div className="grid grid-4 mb-16">
        <Stat label="Avg AI Score" value={data.summary.avgAiScore} />
        <Stat label="Avg Teacher Score" value={data.summary.avgTeacherScore} />
        <Stat label="Correctness" value={data.summary.avgCorrectness + '%'} />
        <Stat label="Grammar" value={data.summary.avgGrammar + '%'} />
      </div>

      <div className="grid grid-2 mb-16">
        <Card title="Topic radar" subtitle="Your strengths across topics">
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radar}>
              <PolarGrid stroke="#1f2e4d" />
              <PolarAngleAxis dataKey="topic" stroke="#8b9dc4" fontSize={11} />
              <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
              <Tooltip {...chartTip} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Suggested improvements" subtitle="Generated from your performance">
          <div className="insight mb-12">
            {data.weakAreas.length
              ? 'Focus on ' + data.weakAreas.join(' and ') + ' — these are your lowest scoring topics.'
              : 'Keep practising to unlock personalised recommendations.'}
          </div>
          <div className="insight mb-12">
            {data.summary.avgCoverage < 70
              ? 'Your concept coverage is below 70%. Try to include definitions, mechanisms and examples in every answer.'
              : 'Great concept coverage! Work on precision and structure to push your scores higher.'}
          </div>
          <div className="insight">
            {data.summary.avgGrammar < 75
              ? 'Grammar and sentence clarity can be improved — write in complete, well-structured sentences.'
              : 'Your written expression is strong. Keep using clear, complete sentences.'}
          </div>
        </Card>
      </div>

      <Card title="Answer-wise results" subtitle="Click a row to see full AI + teacher evaluation">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Question</th><th>Topic</th><th>Type</th><th>AI Score</th><th>Teacher</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.responses.map(function (r) {
                const ai = Math.round(r.ai_score || 0);
                return (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={function () { setOpen(r.id); }}>
                    <td style={{ maxWidth: 380 }}>{r.question}</td>
                    <td><Badge tone="gray">{r.topic}</Badge></td>
                    <td><Badge tone="blue">{r.answer_type}</Badge></td>
                    <td>
                      <div className="row">
                        <div style={{ width: 70 }}><Progress value={ai} /></div>
                        <b>{ai}</b>
                      </div>
                    </td>
                    <td>{r.teacher_score !== null && r.teacher_score !== undefined ? Math.round(r.teacher_score) : '—'}</td>
                    <td><Badge tone={ai >= 70 ? 'green' : ai >= 50 ? 'amber' : 'red'}>{ai >= 70 ? 'Correct' : ai >= 50 ? 'Partial' : 'Weak'}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {open ? <ResponseDetailModal responseId={open} onClose={function () { setOpen(null); }} /> : null}
    </div>
  );
}

export function ResponseDetailModal(props) {
  const [d, setD] = useState(null);
  useEffect(function () {
    api.get('/responses/' + props.responseId).then(setD).catch(function () {});
  }, [props.responseId]);

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={function (e) { e.stopPropagation(); }}>
        <div className="modal-head">
          <h3>Answer detail</h3>
          <button className="x-btn" onClick={props.onClose}>×</button>
        </div>
        <div className="modal-body">
          {!d ? <Spinner /> : (
            <div>
              <div className="tiny muted mb-8">QUESTION</div>
              <div style={{ fontWeight: 650, marginBottom: 14 }}>{d.question.question}</div>
              <div className="tiny muted mb-8">YOUR ANSWER ({d.response.answer_type})</div>
              <div className="card" style={{ marginBottom: 16, lineHeight: 1.6 }}>{d.response.answer_text}</div>
              <AIResultPanel detail={d} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- PROFILE ---------------- */
export function StudentProfile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(function () { api.get('/analytics/student').then(setData).catch(function () {}); }, []);

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account and learning summary" />
      <div className="grid grid-2">
        <Card title="Account details">
          <div className="row" style={{ gap: 16 }}>
            <div className="avatar" style={{ width: 62, height: 62, fontSize: 22 }}>
              {user.name.split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{user.name}</div>
              <div className="small muted">{user.email}</div>
              <div className="mt-8"><Badge tone="blue">{user.role}</Badge></div>
            </div>
          </div>
        </Card>
        <Card title="Learning summary">
          {data ? (
            <div>
              <MetricBar name="Avg AI score" value={data.summary.avgAiScore} />
              <MetricBar name="Avg teacher score" value={data.summary.avgTeacherScore} />
              <MetricBar name="Correctness" value={data.summary.avgCorrectness} />
              <MetricBar name="Concept coverage" value={data.summary.avgCoverage} />
              <MetricBar name="Grammar" value={data.summary.avgGrammar} />
            </div>
          ) : <Spinner />}
        </Card>
      </div>
    </div>
  );
}
