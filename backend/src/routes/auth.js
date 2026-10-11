
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const otp = require('../services/otpService');
const { sign, authMiddleware } = require('../middleware/auth');

const router = express.Router();
const MAX_LOGIN_ATTEMPTS = 3;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

function validEmail(e) {
  return typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function validPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}

/* ---------------- SIGN UP (OTP REQUIRED) ---------------- */

router.post('/signup/request-otp', async function (req, res) {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = ['student', 'teacher'].indexOf(req.body.role) !== -1 ? req.body.role : 'student';

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'This email is already registered.' });

  const payload = JSON.stringify({
    name: name,
    email: email,
    password_hash: bcrypt.hashSync(password, 10),
    role: role
  });

  const result = await otp.issueAsync(email, 'signup', payload, name);
  res.json({
    message: result.emailSent ? ('A verification code was emailed to ' + email + '.') : ('OTP sent to ' + email + ' (demo mode).'),
    demoOtp: result.demoOtp,
    expiresInMinutes: result.expiresInMinutes,
    emailSent: result.emailSent,
    emailError: result.emailError || null
  });
});

router.post('/signup/verify-otp', function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = req.body.code;

  const result = otp.verify(email, 'signup', code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const p = result.payload || {};
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'This email is already registered.' });

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)'
  ).run(p.name || 'New User', email, p.password_hash || bcrypt.hashSync('Demo@123', 10), p.role || 'student');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);

  res.json({ message: 'Account created successfully.', token: sign(user), user: publicUser(user) });
});

/* ---------------- SIGN IN ---------------- */

router.post('/login', async function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'No account found for this email.' });

  const record = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email) || { attempts: 0, locked: 0 };

  // Already locked -> OTP required (server side enforcement)
  if (record.locked) {
    const o = await otp.issueAsync(email, 'login');
    return res.status(403).json({
      otpRequired: true,
      email: email,
      demoOtp: o.demoOtp,
      reason: 'locked',
      message: 'Account locked after ' + MAX_LOGIN_ATTEMPTS + ' failed attempts. OTP verification is required.'
    });
  }

  const passwordOk = bcrypt.compareSync(password, user.password_hash);

  if (!passwordOk) {
    const attempts = (record.attempts || 0) + 1;
    const locked = attempts >= MAX_LOGIN_ATTEMPTS ? 1 : 0;

    db.prepare(
      'INSERT INTO login_attempts (email, attempts, locked, last_attempt) VALUES (?,?,?,?) ' +
      'ON CONFLICT(email) DO UPDATE SET attempts = ?, locked = ?, last_attempt = ?'
    ).run(email, attempts, locked, new Date().toISOString(), attempts, locked, new Date().toISOString());

    if (locked) {
      const o = await otp.issueAsync(email, 'login');
      return res.status(403).json({
        otpRequired: true,
        email: email,
        demoOtp: o.demoOtp,
        reason: 'locked',
        attempts: attempts,
        message: '3 incorrect password attempts. OTP verification is now required to continue.'
      });
    }

    return res.status(401).json({
      error: 'Incorrect password.',
      attempts: attempts,
      attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts
    });
  }

  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
  res.json({ token: sign(user), user: publicUser(user) });
});

/* ---------------- SIGN IN WITH OTP (explicit) ---------------- */

router.post('/login/request-otp', async function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found for this email.' });
  const o = await otp.issueAsync(email, 'login');
  res.json({
    message: 'OTP sent to ' + email + '.',
    demoOtp: o.demoOtp,
    emailSent: o.emailSent,
    emailError: o.emailError || null,
    expiresInMinutes: o.expiresInMinutes
  });
});

router.post('/login/verify-otp', function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = req.body.code;

  const result = otp.verify(email, 'login', code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
  res.json({ message: 'Verified.', token: sign(user), user: publicUser(user) });
});

/* ---------------- FORGOT / RESET PASSWORD ---------------- */

router.post('/forgot-password', async function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found for this email.' });

  const o = await otp.issueAsync(email, 'reset');
  res.json({
    message: 'Password reset OTP sent to ' + email + '.',
    demoOtp: o.demoOtp,
    emailSent: o.emailSent,
    emailError: o.emailError || null,
    expiresInMinutes: o.expiresInMinutes
  });
});

router.post('/verify-reset-otp', function (req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = req.body.code;

  const result = otp.verify(email, 'reset', code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const resetToken = sign(user, '15m');
  res.json({ message: 'OTP verified. You can now set a new password.', resetToken: resetToken });
});

router.post('/reset-password', function (req, res) {
  const { verifyToken } = require('../middleware/auth');
  const email = (req.body.email || '').trim().toLowerCase();
  const resetToken = req.body.resetToken;
  const password = req.body.password || '';
  const confirm = req.body.confirmPassword || '';

  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (password !== confirm) return res.status(400).json({ error: 'Passwords do not match.' });

  const payload = verifyToken(resetToken);
  if (!payload || payload.email !== email) {
    return res.status(400).json({ error: 'Reset session expired. Please restart the process.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(bcrypt.hashSync(password, 10), email);
  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);

  res.json({ message: 'Password updated successfully. Please sign in.' });
});

/* ---------------- CURRENT USER ---------------- */

router.get('/me', authMiddleware, function (req, res) {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
