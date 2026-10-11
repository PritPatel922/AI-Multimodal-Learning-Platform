const db = require('../db');
const emailService = require('./emailService');

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function isDemoMode() {
  // If SMTP is configured, real emails are sent — demo OTP is NOT returned.
  if (emailService.isEnabled()) return false;
  return String(process.env.OTP_DEMO_MODE || 'true') !== 'false';
}

function findUserName(email) {
  try {
    const u = db.prepare('SELECT name FROM users WHERE email = ?').get(email);
    return u ? u.name : null;
  } catch (e) { return null; }
}

/**
 * Issue an OTP and email it (real SMTP if configured, otherwise demo).
 * Returns: { demoOtp?, expiresInMinutes, purpose, emailSent, emailError? }
 */
async function issueAsync(email, purpose, payload, displayName) {
  const code = String(Math.floor(100000 + Math.random() * 900000));

  db.prepare('UPDATE otp_codes SET consumed = 1 WHERE email = ? AND purpose = ? AND consumed = 0')
    .run(email, purpose);
  db.prepare(
    'INSERT INTO otp_codes (email, code, purpose, payload, attempts, consumed, expires_at) VALUES (?,?,?,?,0,0,?)'
  ).run(email, code, purpose, payload || null, Date.now() + TTL_MS);

  const name = displayName || findUserName(email);
  const sendResult = await emailService.sendOtp(email, code, purpose, name);

  if (sendResult.sent) {
    console.log('  [OTP] sent email code for ' + email + ' via SMTP (' + purpose + ')');
  } else if (sendResult.reason === 'smtp-not-configured') {
    console.log('');
    console.log('  ==============================');
    console.log('   DEMO OTP [' + purpose + '] for ' + email + ': ' + code);
    console.log('   (Set SMTP_HOST / SMTP_USER / SMTP_PASS in backend/.env to email it)');
    console.log('  ==============================');
    console.log('');
  } else {
    // SMTP configured but send failed — still expose the code so the demo isn't broken
    console.log('');
    console.log('  ==============================');
    console.log('   EMAIL SEND FAILED [' + purpose + '] for ' + email);
    console.log('   Reason: ' + (sendResult.error || 'unknown'));
    console.log('   FALLBACK OTP: ' + code);
    console.log('  ==============================');
    console.log('');
  }

  const demo = isDemoMode() || !sendResult.sent;
  return {
    demoOtp: demo ? code : undefined,
    expiresInMinutes: 10,
    purpose: purpose,
    emailSent: !!sendResult.sent,
    emailError: sendResult.sent ? null : (sendResult.error || sendResult.reason)
  };
}

/** Kept for backward compatibility — synchronous version (used by nothing now). */
function issue(email, purpose, payload) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare('UPDATE otp_codes SET consumed = 1 WHERE email = ? AND purpose = ? AND consumed = 0')
    .run(email, purpose);
  db.prepare(
    'INSERT INTO otp_codes (email, code, purpose, payload, attempts, consumed, expires_at) VALUES (?,?,?,?,0,0,?)'
  ).run(email, code, purpose, payload || null, Date.now() + TTL_MS);
  console.log('  [OTP] (sync) code for ' + email + ': ' + code);
  return { demoOtp: isDemoMode() ? code : undefined, expiresInMinutes: 10, purpose: purpose };
}

function verify(email, purpose, code) {
  const row = db.prepare(
    'SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1'
  ).get(email, purpose);

  if (!row) return { ok: false, error: 'No active OTP found. Please request a new one.' };
  if (Date.now() > row.expires_at) return { ok: false, error: 'OTP has expired. Please request a new one.' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Too many incorrect OTP attempts. Request a new OTP.' };

  if (String(row.code) !== String(code || '').trim()) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return { ok: false, error: 'Incorrect OTP. ' + left + ' attempt(s) remaining.' };
  }

  db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(row.id);
  let payload = null;
  try { payload = row.payload ? JSON.parse(row.payload) : null; } catch (e) { payload = null; }
  return { ok: true, payload: payload };
}

module.exports = { issue, issueAsync, verify, isDemoMode, TTL_MS, MAX_ATTEMPTS };
