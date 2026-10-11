
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend
} from 'recharts';
import { api } from '../api';
import {
  Card, Stat, Badge, Button, Spinner, EmptyState, Field, Modal, useToast,
  PageHeader, statusTone, Progress, MetricBar
} from '../components/ui';

const chartTip = {
  contentStyle: { background: '#111a2e', border: '1px solid #1f2e4d', borderRadius: 10, color: '#e9eefb', fontSize: 12 }
};

/* ---------------- DASHBOARD ---------------- */
export function TeacherDashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  useEffect(function () { api.get('/dashboard/teacher').then(setData).catch(function () {}); }, []);
  if (!data) return <Spinner label="Loading teacher dashboard..." />;

  const o = data.overview;
  return (
    <div>
      <PageHeader
        title="Teacher Dashboard"
        subtitle="Your content, questions and student evaluation activity"
        actions={<Button variant="primary" onClick={function () { navigate('/teacher/materials'); }}>Upload material</Button>}
      />

      <div className="grid grid-4">
        <Stat label="Materials" value={o.counts.materials} hint="uploaded & processed" />
        <Stat label="Questions" value={o.counts.questions} hint={o.counts.pendingQuestions + ' pending review'} />
        <Stat label="Responses" value={o.counts.responses} hint="student answers" />
        <Stat label="AI-Human Agreement" value={o.averages.agreement + '%'} hint="avg across evaluations" />
      </div>

      <div className="grid grid-2 mt-16">
        <Card title="AI vs Teacher average scores" subtitle="Across all evaluated responses">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={o.aiVsTeacher}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="name" stroke="#8b9dc4" fontSize={12} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Bar dataKey="score" fill="#6366f1" radius={[7, 7, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Performance by topic" subtitle="AI vs teacher per topic">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={o.byTopic}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="topic" stroke="#8b9dc4" fontSize={10} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ai" name="AI" fill="#6366f1" radius={[6, 6, 0, 0]} />
              <Bar dataKey="teacher" name="Teacher" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-2 mt-16">
        <Card title="Recent student responses" subtitle="Latest submissions needing review">
          {data.recentResponses.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Question</th><th>AI</th><th>Teacher</th></tr></thead>
                <tbody>
                  {data.recentResponses.map(function (r) {
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={function () { navigate('/teacher/evaluation/' + r.id); }}>
                        <td>{r.student_name}</td>
                        <td style={{ maxWidth: 260 }} className="small">{r.question}</td>
                        <td><b>{Math.round(r.ai_score || 0)}</b></td>
                        <td>{r.teacher_score ? Math.round(r.teacher_score) : <Badge tone="amber">Pending</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No responses yet" />}
        </Card>

        <Card title="Recent materials">
          {data.recentMaterials.length ? data.recentMaterials.map(function (m) {
            return (
              <div key={m.id} className="row-between" style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong style={{ fontSize: 13.5 }}>{m.title}</strong>
                  <div className="tiny muted">{m.file_type}</div>
                </div>
                <Badge tone={statusTone(m.status)}>{m.status}</Badge>
              </div>
            );
          }) : <EmptyState title="No materials yet" message="Upload your first learning material." />}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- MATERIALS ---------------- */
export function TeacherMaterials() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', transcript: '' });
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  function load() { api.get('/materials').then(function (r) { setItems(r.materials); }).catch(function () {}); }
  useEffect(function () { load(); }, []);

  async function upload() {
    if (!file && !form.title) { toast('Please select a file or enter a title.', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('title', form.title || (file ? file.name : 'Untitled material'));
      if (form.transcript) fd.append('transcript', form.transcript);
      await api.post('/materials', fd);
      toast('Material uploaded successfully.', 'success');
      setOpen(false); setFile(null); setForm({ title: '', transcript: '' });
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function process(id) {
    try {
      const r = await api.post('/materials/' + id + '/process', {});
      toast(r.message, 'success');
      navigate('/teacher/materials/' + id);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this material and its questions?')) return;
    try { await api.del('/materials/' + id); toast('Material deleted.', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  if (!items) return <Spinner label="Loading materials..." />;

  return (
    <div>
      <PageHeader
        title="Learning Materials"
        subtitle="Upload PDFs, notes, handwritten images or videos — then process and generate questions"
        actions={<Button variant="primary" onClick={function () { setOpen(true); }}>+ Upload material</Button>}
      />

      {items.length ? (
        <div className="grid grid-2">
          {items.map(function (m) {
            return (
              <Card key={m.id}>
                <div className="row-between mb-8">
                  <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  <span className="tiny muted">{new Date(m.uploaded_at).toLocaleDateString()}</span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15.5 }}>{m.title}</h3>
                <div className="tiny muted mb-12">
                  {m.file_name} · {m.file_type} · {(m.size / 1024).toFixed(0)} KB
                </div>
                <div className="row wrap mb-12">
                  <Badge tone="gray">{m.processed ? m.word_count + ' words extracted' : 'Not processed'}</Badge>
                  <Badge tone="violet">{m.question_count} questions</Badge>
                  <Badge tone="blue">{m.teacher_name}</Badge>
                </div>
                <div className="row wrap">
                  <Button size="sm" variant="primary" onClick={function () { process(m.id); }}>
                    {m.processed ? 'Reprocess' : 'Process content'}
                  </Button>
                  <Button size="sm" onClick={function () { navigate('/teacher/materials/' + m.id); }}>Open</Button>
                  <Button size="sm" variant="danger" onClick={function () { remove(m.id); }}>Delete</Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon="📁" title="No materials yet" message="Upload a PDF, notes file, handwritten image or video to get started." />}

      <Modal
        open={open}
        onClose={function () { setOpen(false); }}
        title="Upload learning material"
        footer={
          <div className="row">
            <Button onClick={function () { setOpen(false); }}>Cancel</Button>
            <Button variant="primary" onClick={upload} disabled={busy}>{busy ? 'Uploading...' : 'Upload'}</Button>
          </div>
        }
      >
        <Field label="Material title">
          <input className="input" value={form.title} placeholder="e.g. Computer Networks — Lecture 1"
            onChange={function (e) { setForm(function (p) { return Object.assign({}, p, { title: e.target.value }); }); }} />
        </Field>

        <div
          className={'dropzone' + (drag ? ' drag' : '')}
          onClick={function () { inputRef.current.click(); }}
          onDragOver={function (e) { e.preventDefault(); setDrag(true); }}
          onDragLeave={function () { setDrag(false); }}
          onDrop={function (e) {
            e.preventDefault(); setDrag(false);
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="ico">⬆</div>
          <div style={{ fontWeight: 650 }}>{file ? file.name : 'Drag & drop a file, or click to browse'}</div>
          <div className="tiny muted mt-8">PDF · TXT · DOCX · PNG/JPG (handwritten) · MP4 (video)</div>
          <input
            ref={inputRef} type="file" style={{ display: 'none' }}
            onChange={function (e) { if (e.target.files[0]) setFile(e.target.files[0]); }}
          />
        </div>

        <Field label="Optional: paste content (used if PDF/DOCX extraction fails)" hint="Paste text here to override file extraction, or provide a transcript for video/audio uploads.">
          <textarea className="input" value={form.transcript}
            onChange={function (e) { setForm(function (p) { return Object.assign({}, p, { transcript: e.target.value }); }); }} />
        </Field>
      </Modal>
    </div>
  );
}

/* ---------------- MATERIAL DETAIL ---------------- */
export function MaterialDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [count, setCount] = useState(5);
  const [gen, setGen] = useState(false);
  const [replaceOld, setReplaceOld] = useState(false);
  const toast = useToast();

  function load() { api.get('/materials/' + id).then(setData).catch(function () {}); }
  useEffect(function () { load(); }, [id]);

  async function generate() {
    setGen(true);
    try {
      const r = await api.post('/questions/generate', { materialId: Number(id), count: count, replace: replaceOld });
      toast(r.message + ' (engine: ' + r.engine + ')', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setGen(false); }
  }

  async function review(qid, action) {
    try {
      const r = await api.post('/questions/' + qid + '/review', { action: action });
      toast(r.message, 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  if (!data) return <Spinner label="Loading material..." />;
  const material = data.material;
  const content = data.content;
  const questions = data.questions;

  return (
    <div>
      <PageHeader
        title={material.title}
        subtitle={material.file_name + ' · ' + material.file_type}
        actions={
          <div className="row">
            <select className="input" style={{ width: 130 }} value={count} onChange={function (e) { setCount(Number(e.target.value)); }}>
              {[3, 5, 8, 10].map(function (n) { return <option key={n} value={n}>{n} questions</option>; })}
            </select>
            <Button variant="primary" onClick={generate} disabled={gen || !content}>
              {gen ? 'Generating...' : '⚡ Generate questions'}
            </Button>
            <label className="row" style={{ fontSize: 12.5, cursor: 'pointer', marginLeft: 8 }}>
              <input type="checkbox" checked={replaceOld} onChange={function (e) { setReplaceOld(e.target.checked); }} />
              <span className="muted">Replace old AI questions</span>
            </label>
                      </div>
        }
      />

      <div className="grid grid-2">
        <Card title="Extracted content" subtitle={content ? content.word_count + ' words · ' + (content.topics || []).join(', ') : 'Not processed'}>
          {content ? (
            <div>
              <div className="card" style={{ maxHeight: 320, overflowY: 'auto', lineHeight: 1.7, fontSize: 13.5, background: 'var(--panel2)' }}>
                {content.content}
              </div>
              <div className="mt-12">
                <div className="tiny muted mb-8">DETECTED TOPICS</div>
                <div className="row wrap">
                  {(content.topics || []).map(function (t) { return <Badge key={t} tone="violet">{t}</Badge>; })}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon="🧠" title="Not processed yet" message="Click 'Process content' to extract text."
              action={<Button variant="primary" onClick={function () { api.post('/materials/' + id + '/process', {}).then(function (r) { toast(r.message, 'success'); load(); }); }}>Process now</Button>} />
          )}
        </Card>

        <Card title="AI generated questions" subtitle={questions.length + ' total · ' + questions.filter(function (q) { return q.status === 'approved'; }).length + ' approved'}>
          {questions.length ? questions.map(function (q) {
            return (
              <div key={q.id} style={{ padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="row-between mb-8">
                  <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                  <div className="row">
                    <Badge tone={q.difficulty === 'Easy' ? 'green' : q.difficulty === 'Hard' ? 'red' : 'amber'}>{q.difficulty}</Badge>
                    <Badge tone="gray">{q.topic}</Badge>
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.55 }}>{q.question}</div>
                <div className="tiny muted mt-8">🎯 {q.learning_objective}</div>
                {q.status === 'pending' || q.status === 'edited' ? (
                  <div className="row mt-12">
                    <Button size="sm" variant="success" onClick={function () { review(q.id, 'approve'); }}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={function () { review(q.id, 'reject'); }}>Reject</Button>
                  </div>
                ) : null}
              </div>
            );
          }) : <EmptyState icon="⚡" title="No questions yet" message="Click 'Generate questions' to create AI questions from this material." />}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- QUESTION REVIEW ---------------- */
export function QuestionReview() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "" });
  const [selectedQIds, setSelectedQIds] = useState([]);
  const toast = useToast();

  function load() {
    api.get('/questions?status=' + filter).then(function (r) { setItems(r.questions); }).catch(function () {});
  }
  useEffect(function () { load(); }, [filter]);

  async function review(id, action) {
    try {
      const r = await api.post('/questions/' + id + '/review', { action: action });
      toast(r.message, 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function createAssessment() {
    if (!createForm.title) { toast("Please enter a title", "error"); return; }
    if (selectedQIds.length === 0) { toast("Select at least one approved question", "error"); return; }
    try {
      await api.post("/assessments", {
        title: createForm.title,
        description: createForm.description,
        questionIds: selectedQIds
      });
      toast("Assessment published!", "success");
      setShowCreate(false);
      setCreateForm({ title: "", description: "" });
      setSelectedQIds([]);
    } catch (e) { toast(e.message, "error"); }
  }

  function toggleQ(id) {
    setSelectedQIds(function (prev) {
      return prev.indexOf(id) !== -1 ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]);
    });
  }

  async function saveEdit() {
    try {
      await api.put('/questions/' + editing.id, editing);
      toast('Question updated.', 'success');
      setEditing(null); load();
    } catch (e) { toast(e.message, 'error'); }
  }

  if (!items) return <Spinner label="Loading questions..." />;

  return (
    <div>
      <PageHeader
        title="Question Review"
        subtitle="Teacher-in-the-loop validation — approve, edit or reject AI generated questions"
        actions={
          <div className="row wrap">
            <Button variant="primary" onClick={function () { setShowCreate(true); }} disabled={!items || !items.filter(function (q) { return q.status === "approved"; }).length}>
              + Create Assessment
            </Button>
            <select className="input" style={{ width: 170 }} value={filter} onChange={function (e) { setFilter(e.target.value); }}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="edited">Edited</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        }
      />

      {items.length ? items.map(function (q) {
        return (
          <div key={q.id} className="q-card mb-16">
            <div className="row-between wrap mb-8">
              <div className="row wrap">
                <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                <Badge tone={q.difficulty === 'Easy' ? 'green' : q.difficulty === 'Hard' ? 'red' : 'amber'}>{q.difficulty}</Badge>
                <Badge tone="gray">{q.topic}</Badge>
                <Badge tone="blue">{q.source}</Badge>
              </div>
              <span className="tiny muted">{q.material_title}</span>
            </div>

            <div className="q-text">{q.question}</div>

            <div className="tiny muted mb-12">🎯 {q.learning_objective}</div>

            <div className="row wrap">
              {q.status !== 'approved' ? (
                <Button size="sm" variant="success" onClick={function () { review(q.id, 'approve'); }}>✓ Approve</Button>
              ) : null}
              <Button size="sm" variant="warn" onClick={function () { setEditing(Object.assign({}, q)); }}>✎ Edit</Button>
              {q.status !== 'rejected' ? (
                <Button size="sm" variant="danger" onClick={function () { review(q.id, 'reject'); }}>✕ Reject</Button>
              ) : null}
            </div>
          </div>
        );
      }) : <EmptyState icon="✓" title="No questions in this filter" message="Generate questions from a learning material first." />}

      <Modal
        open={showCreate}
        onClose={function () { setShowCreate(false); }}
        title="Publish new assessment"
        footer={
          <div className="row">
            <Button onClick={function () { setShowCreate(false); }}>Cancel</Button>
            <Button variant="primary" onClick={createAssessment}>Publish</Button>
          </div>
        }
      >
        <Field label="Assessment title">
          <input className="input" value={createForm.title} placeholder="e.g. Computer Networks — Midterm"
            onChange={function (e) { setCreateForm(Object.assign({}, createForm, { title: e.target.value })); }} />
        </Field>
        <Field label="Description (optional)">
          <textarea className="input" value={createForm.description} placeholder="What is this assessment about?"
            onChange={function (e) { setCreateForm(Object.assign({}, createForm, { description: e.target.value })); }} />
        </Field>
        <Field label={"Select approved questions (" + selectedQIds.length + " selected)"}>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
            {items && items.filter(function (q) { return q.status === "approved"; }).length ? (
              items.filter(function (q) { return q.status === "approved"; }).map(function (q) {
                return (
                  <label key={q.id} className="row" style={{ padding: "8px 6px", cursor: "pointer", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                    <input type="checkbox" checked={selectedQIds.indexOf(q.id) !== -1}
                      onChange={function () { toggleQ(q.id); }} style={{ marginTop: 4 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>{q.question}</div>
                      <div className="tiny muted mt-8"><Badge tone={q.difficulty === "Easy" ? "green" : q.difficulty === "Hard" ? "red" : "amber"}>{q.difficulty}</Badge> {q.topic}</div>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="empty" style={{ padding: 20 }}>No approved questions yet. Approve some first.</div>
            )}
          </div>
        </Field>
      </Modal>

      <Modal
        open={!!editing}
        onClose={function () { setEditing(null); }}
        title="Edit question"
        footer={
          <div className="row">
            <Button onClick={function () { setEditing(null); }}>Cancel</Button>
            <Button variant="primary" onClick={saveEdit}>Save changes</Button>
          </div>
        }
      >
        {editing ? (
          <div>
            <Field label="Question">
              <textarea className="input" value={editing.question}
                onChange={function (e) { setEditing(Object.assign({}, editing, { question: e.target.value })); }} />
            </Field>
            <Field label="Expected answer">
              <textarea className="input" value={editing.expected_answer}
                onChange={function (e) { setEditing(Object.assign({}, editing, { expected_answer: e.target.value })); }} />
            </Field>
            <div className="grid grid-2">
              <Field label="Topic">
                <input className="input" value={editing.topic || ''}
                  onChange={function (e) { setEditing(Object.assign({}, editing, { topic: e.target.value })); }} />
              </Field>
              <Field label="Difficulty">
                <select className="input" value={editing.difficulty}
                  onChange={function (e) { setEditing(Object.assign({}, editing, { difficulty: e.target.value })); }}>
                  <option>Easy</option><option>Medium</option><option>Hard</option>
                </select>
              </Field>
            </div>
            <Field label="Learning objective">
              <input className="input" value={editing.learning_objective || ''}
                onChange={function (e) { setEditing(Object.assign({}, editing, { learning_objective: e.target.value })); }} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------------- RESPONSES ---------------- */
export function TeacherResponses() {
  const [items, setItems] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(function () {
    api.get('/responses').then(function (r) { setItems(r.responses); }).catch(function (e) { toast(e.message, 'error'); });
  }, []);

  if (!items) return <Spinner label="Loading responses..." />;

  return (
    <div>
      <PageHeader title="Student Responses" subtitle="Review AI evaluations and add your own human evaluation" />
      {items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Student</th><th>Question</th><th>Topic</th><th>Type</th><th>AI Score</th><th>Teacher</th><th></th></tr>
            </thead>
            <tbody>
              {items.map(function (r) {
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.student_name}</div>
                      <div className="tiny muted">{r.student_email}</div>
                    </td>
                    <td style={{ maxWidth: 320 }} className="small">{r.question}</td>
                    <td><Badge tone="gray">{r.topic}</Badge></td>
                    <td><Badge tone="blue">{r.answer_type}</Badge></td>
                    <td>
                      <div className="row">
                        <div style={{ width: 64 }}><Progress value={r.ai_score || 0} /></div>
                        <b>{Math.round(r.ai_score || 0)}</b>
                      </div>
                    </td>
                    <td>{r.teacher_score !== null && r.teacher_score !== undefined
                      ? <Badge tone="cyan">{Math.round(r.teacher_score)}</Badge>
                      : <Badge tone="amber">Pending</Badge>}</td>
                    <td>
                      <Button size="sm" variant="primary" onClick={function () { navigate('/teacher/evaluation/' + r.id); }}>
                        Evaluate
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="✎" title="No student responses yet" message="Once students submit answers they will appear here." />}
    </div>
  );
}

/* ---------------- EVALUATION ---------------- */
export function TeacherEvaluation() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ score: '', correctness: '', comments: '', feedback: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function load() {
    api.get('/responses/' + id).then(function (r) {
      setD(r);
      if (r.teacherEvaluation) {
        setForm({
          score: r.teacherEvaluation.score,
          correctness: r.teacherEvaluation.correctness,
          comments: r.teacherEvaluation.comments || '',
          feedback: r.teacherEvaluation.feedback || ''
        });
      } else if (r.aiEvaluation) {
        setForm({
          score: Math.round(r.aiEvaluation.overall_score),
          correctness: Math.round(r.aiEvaluation.correctness),
          comments: '',
          feedback: ''
        });
      }
    }).catch(function () {});
  }
  useEffect(function () { load(); }, [id]);

  async function save() {
    setSaving(true);
    try {
      await api.post('/responses/' + id + '/evaluate', form);
      toast('Teacher evaluation saved.', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  if (!d) return <Spinner label="Loading response..." />;

  const ai = d.aiEvaluation;
  const cmp = d.comparison;

  return (
    <div>
      <PageHeader
        title="Human Evaluation"
        subtitle={'Student: ' + (d.student ? d.student.name : '') + ' · ' + d.response.answer_type + ' answer'}
        actions={cmp ? (
          <div className="row">
            <Badge tone="blue">AI {Math.round(cmp.ai_score)}</Badge>
            <Badge tone="cyan">Teacher {Math.round(cmp.teacher_score)}</Badge>
            <Badge tone="violet">Agreement {Math.round(cmp.agreement)}%</Badge>
          </div>
        ) : null}
      />

      <div className="grid grid-2">
        <div>
          <Card title="Question" subtitle={d.question.topic + ' · ' + d.question.difficulty}>
            <div style={{ fontWeight: 650, lineHeight: 1.6, marginBottom: 16 }}>{d.question.question}</div>
            <div className="tiny muted mb-8">EXPECTED ANSWER</div>
            <div className="card" style={{ background: 'var(--panel2)', lineHeight: 1.65, fontSize: 13.5 }}>
              {d.question.expected_answer}
            </div>
          </Card>

          <Card title="Student answer" subtitle={'Type: ' + d.response.answer_type} className="mt-16">
            <div className="card" style={{ background: 'var(--panel2)', lineHeight: 1.7, fontSize: 13.5 }}>
              {d.response.answer_text}
            </div>
          </Card>
        </div>

        <div>
          <Card title="AI evaluation" subtitle={'Engine: ' + (ai && ai.engine === 'openai' ? 'OpenAI' : 'Demo AI')}>
            {ai ? (
              <div>
                <div className="row-between mb-16">
                  <div>
                    <div className="tiny muted">OVERALL</div>
                    <div className="score-big" style={{ color: ai.overall_score >= 75 ? '#4ade80' : ai.overall_score >= 50 ? '#fbbf24' : '#f87171' }}>
                      {Math.round(ai.overall_score)}
                    </div>
                  </div>
                  <div style={{ flex: 1, marginLeft: 20 }}>
                    <MetricBar name="Correctness" value={ai.correctness} />
                    <MetricBar name="Coverage" value={ai.concept_coverage} />
                    <MetricBar name="Grammar" value={ai.grammar} />
                    {ai.pronunciation ? <MetricBar name="Pronunciation" value={ai.pronunciation} /> : null}
                    {ai.confidence ? <MetricBar name="Confidence" value={ai.confidence} /> : null}
                  </div>
                </div>
                <div className="insight">{ai.feedback}</div>
              </div>
            ) : <EmptyState title="No AI evaluation" />}
          </Card>

          <Card title="Your evaluation" subtitle="Independent human score — never overwritten by AI" className="mt-16">
            <div className="grid grid-2">
              <Field label="Overall score (0-100)">
                <input className="input" type="number" min="0" max="100" value={form.score}
                  onChange={function (e) { setForm(Object.assign({}, form, { score: e.target.value })); }} />
              </Field>
              <Field label="Correctness (0-100)">
                <input className="input" type="number" min="0" max="100" value={form.correctness}
                  onChange={function (e) { setForm(Object.assign({}, form, { correctness: e.target.value })); }} />
              </Field>
            </div>
            <Field label="Comments">
              <input className="input" value={form.comments} placeholder="Short internal note"
                onChange={function (e) { setForm(Object.assign({}, form, { comments: e.target.value })); }} />
            </Field>
            <Field label="Feedback for student">
              <textarea className="input" value={form.feedback} placeholder="What the student should improve..."
                onChange={function (e) { setForm(Object.assign({}, form, { feedback: e.target.value })); }} />
            </Field>
            <Button variant="primary" block onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save teacher evaluation'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- COMPARISON ---------------- */
export function TeacherComparison() {
  const [data, setData] = useState(null);
  useEffect(function () { api.get('/comparisons').then(setData).catch(function () {}); }, []);

  if (!data) return <Spinner label="Loading comparison analytics..." />;

  const s = data.summary;
  const chartData = data.comparisons.slice(0, 12).map(function (c, i) {
    return { name: '#' + (i + 1), ai: Math.round(c.ai_score), teacher: Math.round(c.teacher_score) };
  });

  return (
    <div>
      <PageHeader title="AI vs Human Evaluation" subtitle="Score differences and agreement across evaluated responses" />

      <div className="grid grid-4 mb-16">
        <Stat label="Evaluated Responses" value={s.count} />
        <Stat label="Avg AI Score" value={s.avgAiScore} />
        <Stat label="Avg Teacher Score" value={s.avgTeacherScore} />
        <Stat label="Avg Agreement" value={s.avgAgreement + '%'} hint={'avg diff ' + s.avgDifference + ' pts'} />
      </div>

      <div className="grid grid-2 mb-16">
        <Card title="AI vs Teacher — per response" subtitle="Latest 12 evaluated responses">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="name" stroke="#8b9dc4" fontSize={11} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ai" name="AI score" fill="#6366f1" radius={[6, 6, 0, 0]} />
              <Bar dataKey="teacher" name="Teacher score" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Agreement distribution" subtitle="Agreement percentage per response">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.comparisons.slice(0, 12).map(function (c, i) { return { name: '#' + (i + 1), agreement: Math.round(c.agreement) }; })}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="name" stroke="#8b9dc4" fontSize={11} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Line type="monotone" dataKey="agreement" name="Agreement %" stroke="#a855f7" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Detailed comparison" subtitle="Score difference and agreement per response">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Student</th><th>Question</th><th>Type</th><th>AI</th><th>Teacher</th><th>Difference</th><th>Agreement</th></tr>
            </thead>
            <tbody>
              {data.comparisons.map(function (c) {
                return (
                  <tr key={c.id}>
                    <td>{c.student_name}</td>
                    <td style={{ maxWidth: 300 }} className="small">{c.question}</td>
                    <td><Badge tone="blue">{c.answer_type}</Badge></td>
                    <td><b>{Math.round(c.ai_score)}</b></td>
                    <td><b>{Math.round(c.teacher_score)}</b></td>
                    <td>{Math.round(c.difference)} pts</td>
                    <td>
                      <div className="row">
                        <div style={{ width: 70 }}><Progress value={c.agreement} /></div>
                        <b>{Math.round(c.agreement)}%</b>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
