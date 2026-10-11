
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button, Field, useToast } from '../components/ui';

function AuthShell(props) {
  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="brand">
          <div className="auth-logo">AI</div>
          <div>
            <strong style={{ fontSize: '16px' }}>LearnAI Platform</strong>
            <div className="tiny muted">Multimodal learning & evaluation</div>
          </div>
        </div>
        <h1>AI-powered learning,<br />question generation &amp; evaluation.</h1>
        <p>
          Turn any learning material into validated assessments. Students answer with text,
          voice or handwriting — AI evaluates instantly, teachers verify, and the platform
          measures AI vs human agreement.
        </p>
        <div className="pill-row">
          <span className="pill">Content Processing</span>
          <span className="pill">AI Question Gen</span>
          <span className="pill">Teacher Validation</span>
          <span className="pill">Voice + OCR</span>
          <span className="pill">AI vs Human Analytics</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">{props.children}</div>
      </div>
    </div>
  );
}

function DemoOtp(props) {
  if (!props.code) return null;
  return (
    <div className="demo-panel mt-16">
      <strong>Demo Mode — OTP</strong>
      <div className="otp-code">{props.code}</div>
      <div className="tiny mt-8" style={{ opacity: .85 }}>
        Also printed in the backend console. No paid SMS/email provider required.
      </div>
    </div>
  );
}

function ErrorBox(props) {
  if (!props.error) return null;
  return (
    <div className="demo-panel mt-12" style={{ borderColor: 'rgba(239,68,68,.55)', background: 'rgba(239,68,68,.08)', color: '#f87171' }}>
      {props.error}
    </div>
  );
}

/* ---------------- LOGIN ---------------- */
export function Login() {
  const [email, setEmail] = useState('teacher@demo.com');
  const [password, setPassword] = useState('Teacher@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  function go(user) {
    const role = user.role;
    navigate(role === 'admin' ? '/admin/dashboard' : role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email: email, password: password });
      login(r.token, r.user);
      toast('Welcome back, ' + r.user.name + '!', 'success');
      go(r.user);
    } catch (err) {
      if (err.data && err.data.otpRequired) {
        navigate('/auth/otp', {
          state: { email: err.data.email, purpose: 'login', demoOtp: err.data.demoOtp, message: err.data.message }
        });
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/auth/login/request-otp', { email: email });
      navigate('/auth/otp', { state: { email: email, purpose: 'login', demoOtp: r.demoOtp, message: r.message } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function quick(e, em, pw) {
    e.preventDefault();
    setEmail(em); setPassword(pw); setError('');
  }

  return (
    <AuthShell>
      <h2>Sign in</h2>
      <p className="sub">Access your role-based dashboard</p>

      <form onSubmit={submit}>
        <Field label="Email address">
          <input className="input" type="email" value={email} onChange={function (e) { setEmail(e.target.value); }} required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={function (e) { setPassword(e.target.value); }} required />
        </Field>
        <ErrorBox error={error} />
        <Button variant="primary" block type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="row-between mt-16">
        <Link to="/auth/forgot-password" className="small" style={{ color: '#67e8f9' }}>Forgot password?</Link>
        <a className="small" style={{ color: '#67e8f9', cursor: 'pointer' }} onClick={requestOtp}>
          Sign in with OTP
        </a>
      </div>

      <div className="divider"></div>
      <div className="tiny muted mb-8">QUICK DEMO LOGIN</div>
      <div className="row wrap">
        <Button size="sm" onClick={function (e) { quick(e, 'teacher@demo.com', 'Teacher@123'); }}>Teacher</Button>
        <Button size="sm" onClick={function (e) { quick(e, 'student@demo.com', 'Student@123'); }}>Student</Button>
        <Button size="sm" onClick={function (e) { quick(e, 'admin@demo.com', 'Admin@123'); }}>Admin</Button>
      </div>
      <div className="tiny muted mt-8">
        Tip: enter a wrong password 3 times to trigger the mandatory OTP lock flow.
      </div>

      <div className="auth-switch">
        New here? <Link to="/auth/signup">Create an account</Link>
      </div>
    </AuthShell>
  );
}

/* ---------------- SIGNUP ---------------- */
export function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function set(k, v) { setForm(function (p) { return Object.assign({}, p, { [k]: v }); }); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/auth/signup/request-otp', form);
      navigate('/auth/otp', {
        state: { email: form.email, purpose: 'signup', demoOtp: r.demoOtp, message: r.message }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h2>Create account</h2>
      <p className="sub">You will verify your email with a one-time password</p>

      <form onSubmit={submit}>
        <Field label="Full name">
          <input className="input" value={form.name} onChange={function (e) { set('name', e.target.value); }} required />
        </Field>
        <Field label="Email address">
          <input className="input" type="email" value={form.email} onChange={function (e) { set('email', e.target.value); }} required />
        </Field>
        <Field label="Password" hint="Minimum 6 characters">
          <input className="input" type="password" value={form.password} onChange={function (e) { set('password', e.target.value); }} required />
        </Field>
        <Field label="I am a">
          <select className="input" value={form.role} onChange={function (e) { set('role', e.target.value); }}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </Field>
        <ErrorBox error={error} />
        <Button variant="primary" block type="submit" disabled={loading}>
          {loading ? 'Sending OTP...' : 'Send OTP & continue'}
        </Button>
      </form>

      <div className="auth-switch">
        Already registered? <Link to="/auth/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}

/* ---------------- OTP ---------------- */
export function OtpVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();

  const st = location.state || {};
  const [email, setEmail] = useState(st.email || '');
  const [purpose, setPurpose] = useState(st.purpose || 'login');
  const [code, setCode] = useState('');
  const [demoOtp, setDemoOtp] = useState(st.demoOtp || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const purposeLabel = purpose === 'signup' ? 'Account verification'
    : purpose === 'reset' ? 'Password reset'
      : 'Sign-in verification';

  async function verify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (purpose === 'signup') {
        const r = await api.post('/auth/signup/verify-otp', { email: email, code: code });
        login(r.token, r.user);
        toast('Account created. Welcome, ' + r.user.name + '!', 'success');
        navigate(r.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
      } else if (purpose === 'reset') {
        const r = await api.post('/auth/verify-reset-otp', { email: email, code: code });
        toast('OTP verified. Set your new password.', 'success');
        navigate('/auth/reset-password', { state: { email: email, resetToken: r.resetToken } });
      } else {
        const r = await api.post('/auth/login/verify-otp', { email: email, code: code });
        login(r.token, r.user);
        toast('Verified. Welcome back!', 'success');
        navigate(r.user.role === 'admin' ? '/admin/dashboard' : r.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      let r;
      if (purpose === 'signup') {
        setError('For security, please restart the sign-up flow to resend the OTP.');
        return;
      } else if (purpose === 'reset') {
        r = await api.post('/auth/forgot-password', { email: email });
      } else {
        r = await api.post('/auth/login/request-otp', { email: email });
      }
      setDemoOtp(r.demoOtp || '');
      toast('A new OTP has been generated.', 'success');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthShell>
      <h2>Enter OTP</h2>
      <p className="sub">{purposeLabel} — we sent a 6-digit code to <b>{email}</b></p>

      {st.message ? <div className="demo-panel mb-16" style={{ borderColor: 'rgba(99,102,241,.5)', background: 'rgba(99,102,241,.09)', color: '#a5b4fc' }}>{st.message}</div> : null}

      <form onSubmit={verify}>
        <Field label="Email address">
          <input className="input" value={email} onChange={function (e) { setEmail(e.target.value); }} required />
        </Field>
        <Field label="One-time password">
          <input
            className="input otp-input"
            maxLength={6}
            value={code}
            onChange={function (e) { setCode(e.target.value.replace(/[^0-9]/g, '')); }}
            placeholder="••••••"
            required
          />
        </Field>
        <ErrorBox error={error} />
        <Button variant="primary" block type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify OTP'}
        </Button>
      </form>

      <DemoOtp code={demoOtp} />

      <div className="row-between mt-16">
        <a className="small" style={{ color: '#67e8f9', cursor: 'pointer' }} onClick={resend}>Resend OTP</a>
        <Link to="/auth/login" className="small" style={{ color: '#67e8f9' }}>Back to sign in</Link>
      </div>
    </AuthShell>
  );
}

/* ---------------- FORGOT PASSWORD ---------------- */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/auth/forgot-password', { email: email });
      navigate('/auth/otp', { state: { email: email, purpose: 'reset', demoOtp: r.demoOtp, message: r.message } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h2>Forgot password</h2>
      <p className="sub">We will send an OTP to reset your password</p>
      <form onSubmit={submit}>
        <Field label="Email address">
          <input className="input" type="email" value={email} onChange={function (e) { setEmail(e.target.value); }} required />
        </Field>
        <ErrorBox error={error} />
        <Button variant="primary" block type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset OTP'}
        </Button>
      </form>
      <div className="auth-switch">
        Remembered it? <Link to="/auth/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}

/* ---------------- RESET PASSWORD ---------------- */
export function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const st = location.state || {};

  const [email] = useState(st.email || '');
  const [resetToken] = useState(st.resetToken || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email, resetToken: resetToken, password: password, confirmPassword: confirm
      });
      toast('Password updated. Please sign in.', 'success');
      navigate('/auth/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!resetToken) {
    return (
      <AuthShell>
        <h2>Reset link expired</h2>
        <p className="sub">Please restart the forgot-password flow.</p>
        <Button variant="primary" block onClick={function () { navigate('/auth/forgot-password'); }}>
          Restart
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2>Set new password</h2>
      <p className="sub">For <b>{email}</b></p>
      <form onSubmit={submit}>
        <Field label="New password">
          <input className="input" type="password" value={password} onChange={function (e) { setPassword(e.target.value); }} required />
        </Field>
        <Field label="Confirm password">
          <input className="input" type="password" value={confirm} onChange={function (e) { setConfirm(e.target.value); }} required />
        </Field>
        <ErrorBox error={error} />
        <Button variant="primary" block type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}
