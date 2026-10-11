
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import { api } from '../api';
import {
  Card, Stat, Badge, Button, Spinner, EmptyState, Field, Modal, useToast,
  PageHeader
} from '../components/ui';

const chartTip = {
  contentStyle: { background: '#111a2e', border: '1px solid #1f2e4d', borderRadius: 10, color: '#e9eefb', fontSize: 12 }
};
const COLORS = ['#6366f1', '#22d3ee', '#a855f7', '#22c55e', '#f59e0b'];

function toneForRole(role) {
  return role === 'admin' ? 'violet' : role === 'teacher' ? 'cyan' : 'blue';
}

/* ---------------- DASHBOARD ---------------- */
export function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(function () { api.get('/dashboard/admin').then(setData).catch(function () {}); }, []);
  if (!data) return <Spinner label="Loading system dashboard..." />;
  const o = data.overview;

  return (
    <div>
      <PageHeader title="System Dashboard" subtitle="Platform-wide activity and evaluation statistics" />
      <div className="grid grid-4 mb-16">
        <Stat label="Students" value={o.counts.students} />
        <Stat label="Teachers" value={o.counts.teachers} />
        <Stat label="Questions" value={o.counts.questions} hint={o.counts.approvedQuestions + ' approved'} />
        <Stat label="AI-Human Agreement" value={o.averages.agreement + '%'} />
      </div>
      <div className="grid grid-4 mb-16">
        <Stat label="Materials" value={o.counts.materials} />
        <Stat label="Assessments" value={o.counts.assessments} />
        <Stat label="Responses" value={o.counts.responses} />
        <Stat label="Human Evaluations" value={o.counts.evaluations} />
      </div>
      <Card title="Recent users">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>
              {data.recentUsers.map(function (u) {
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="small muted">{u.email}</td>
                    <td><Badge tone={toneForRole(u.role)}>{u.role}</Badge></td>
                    <td className="tiny muted">{new Date(u.created_at).toLocaleDateString()}</td>
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

/* ---------------- USERS ---------------- */
export function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const toast = useToast();

  function load() { api.get('/users').then(function (r) { setUsers(r.users); }).catch(function () {}); }
  useEffect(function () { load(); }, []);

  async function create() {
    try {
      await api.post('/users', form);
      toast('User created.', 'success');
      setOpen(false); setForm({ name: '', email: '', password: '', role: 'student' });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function changeRole(id, role) {
    try { await api.put('/users/' + id + '/role', { role: role }); toast('Role updated.', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this user?')) return;
    try { await api.del('/users/' + id); toast('User deleted.', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  if (!users) return <Spinner label="Loading users..." />;

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={users.length + ' accounts on the platform'}
        actions={<Button variant="primary" onClick={function () { setOpen(true); }}>+ Add user</Button>}
      />
      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {users.map(function (u) {
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="small muted">{u.email}</td>
                    <td>
                      <select className="input" style={{ width: 130, padding: '6px 10px' }} value={u.role}
                        onChange={function (e) { changeRole(u.id, e.target.value); }}>
                        <option value="student">student</option>
                        <option value="teacher">teacher</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="tiny muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td><Button size="sm" variant="danger" onClick={function () { remove(u.id); }}>Delete</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open} onClose={function () { setOpen(false); }} title="Add user"
        footer={<div className="row"><Button onClick={function () { setOpen(false); }}>Cancel</Button><Button variant="primary" onClick={create}>Create</Button></div>}
      >
        <Field label="Full name">
          <input className="input" value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }} />
        </Field>
        <Field label="Email">
          <input className="input" value={form.email} onChange={function (e) { setForm(Object.assign({}, form, { email: e.target.value })); }} />
        </Field>
        <Field label="Password" hint="Default: Demo@123 if left empty">
          <input className="input" value={form.password} onChange={function (e) { setForm(Object.assign({}, form, { password: e.target.value })); }} />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={function (e) { setForm(Object.assign({}, form, { role: e.target.value })); }}>
            <option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option>
          </select>
        </Field>
      </Modal>
    </div>
  );
}

/* ---------------- ANALYTICS ---------------- */
export function AdminAnalytics() {
  const [d, setD] = useState(null);
  useEffect(function () { api.get('/analytics/overview').then(setD).catch(function () {}); }, []);
  if (!d) return <Spinner label="Loading analytics..." />;

  const dist = d.distribution.map(function (b) { return { name: b.bucket, count: b.count }; });
  const types = d.byType.map(function (t) { return { name: t.type, value: t.count }; });

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Assessment and evaluation statistics across the platform" />

      <div className="grid grid-4 mb-16">
        <Stat label="Questions Generated" value={d.counts.questions} />
        <Stat label="Questions Approved" value={d.counts.approvedQuestions} />
        <Stat label="Assessments" value={d.counts.assessments} />
        <Stat label="Responses" value={d.counts.responses} />
      </div>

      <div className="grid grid-2 mb-16">
        <Card title="AI vs Teacher average scores">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={d.aiVsTeacher}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="name" stroke="#8b9dc4" fontSize={12} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Bar dataKey="score" fill="#6366f1" radius={[7, 7, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Score distribution" subtitle="AI overall scores">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="name" stroke="#8b9dc4" fontSize={11} />
              <YAxis stroke="#8b9dc4" fontSize={12} />
              <Tooltip {...chartTip} />
              <Bar dataKey="count" fill="#a855f7" radius={[7, 7, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-2 mb-16">
        <Card title="Performance by difficulty" subtitle="AI, teacher and agreement">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={d.byDifficulty}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="difficulty" stroke="#8b9dc4" fontSize={12} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ai" name="AI" fill="#6366f1" radius={[6, 6, 0, 0]} />
              <Bar dataKey="teacher" name="Teacher" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              <Bar dataKey="agreement" name="Agreement %" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Answer modality distribution" subtitle="Text vs voice vs handwritten">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={types} dataKey="value" nameKey="name" outerRadius={90} label>
                {types.map(function (entry, i) { return <Cell key={i} fill={COLORS[i % COLORS.length]} />; })}
              </Pie>
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Student performance over time" subtitle="Batched AI vs teacher averages">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={d.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
            <XAxis dataKey="name" stroke="#8b9dc4" fontSize={12} />
            <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
            <Tooltip {...chartTip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ai" name="AI score" stroke="#6366f1" strokeWidth={2.5} />
            <Line type="monotone" dataKey="teacher" name="Teacher score" stroke="#22d3ee" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

/* ---------------- RESEARCH ---------------- */
export function AdminResearch() {
  const [d, setD] = useState(null);
  useEffect(function () { api.get('/analytics/research').then(setD).catch(function () {}); }, []);
  if (!d) return <Spinner label="Loading research analytics..." />;

  const o = d.overview;
  const stamp = new Date(d.generatedAt).toLocaleTimeString();

  return (
    <div>
      <PageHeader
        title="Research Insights"
        subtitle="AI vs human evaluation research analytics"
        actions={<Badge tone="violet">{'Updated ' + stamp}</Badge>}
      />

      <div className="grid grid-4 mb-16">
        <Stat label="Evaluated Responses" value={d.comparisonRows.length} />
        <Stat label="Avg AI Score" value={o.averages.aiScore} />
        <Stat label="Avg Teacher Score" value={o.averages.teacherScore} />
        <Stat label="Avg Agreement" value={o.averages.agreement + '%'} hint={'avg diff ' + o.averages.difference + ' pts'} />
      </div>

      <Card title="Automated research findings" subtitle="Derived from actual platform data" className="mb-16">
        {d.insights.map(function (t, i) {
          return <div key={i} className="insight mb-12">{t}</div>;
        })}
      </Card>

      <div className="grid grid-2 mb-16">
        <Card title="AI vs Teacher by topic">
          <ResponsiveContainer width="100%" height={260}>
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

        <Card title="Agreement by answer modality" subtitle="Where does AI disagree with humans?">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={o.byType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2e4d" />
              <XAxis dataKey="type" stroke="#8b9dc4" fontSize={12} />
              <YAxis stroke="#8b9dc4" fontSize={12} domain={[0, 100]} />
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="agreement" name="Agreement %" fill="#a855f7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ai" name="Avg AI score" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Dataset summary" subtitle="Underlying counts used for research">
        <div className="grid grid-4">
          <Stat label="Students" value={o.counts.students} />
          <Stat label="Teachers" value={o.counts.teachers} />
          <Stat label="Materials" value={o.counts.materials} />
          <Stat label="Questions" value={o.counts.questions} />
        </div>
      </Card>
    </div>
  );
}
