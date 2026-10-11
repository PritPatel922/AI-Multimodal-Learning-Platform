/**
 * EMAIL SERVICE — sends OTP emails via SMTP.
 *
 * Enabled automatically when SMTP_HOST, SMTP_USER and SMTP_PASS are set
 * in backend/.env. If they aren't, isEnabled() returns false and the
 * OTP service falls back to DEMO MODE (OTP shown in API response + console).
 *
 * Gmail users MUST use an App Password (not the account password):
 *   https://myaccount.google.com/apppasswords
 */

const NL = String.fromCharCode(10);

let transporter = null;
let lastError = null;

function env(k) { return (process.env[k] || '').trim(); }

function isEnabled() {
  return !!(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
}

function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = require('nodemailer');
  const port = parseInt(env('SMTP_PORT') || '587', 10);
  const secure = String(env('SMTP_SECURE') || '').toLowerCase() === 'true' || port === 465;
  transporter = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port: port,
    secure: secure,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    tls: { rejectUnauthorized: false },   // <-- fix for antivirus SSL scanning
    connectionTimeout: 12000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });
  return transporter;
}

function fromAddress() {
  return env('SMTP_FROM') || ('AI Learning Platform <' + env('SMTP_USER') + '>');
}

function buildHtml(to, code, purpose, name) {
  const heading = purpose === 'signup' ? 'Verify your email'
    : purpose === 'reset' ? 'Reset your password'
    : 'Your sign-in code';
  const action = purpose === 'signup' ? 'complete your registration'
    : purpose === 'reset' ? 'reset your password'
    : 'sign in to your account';
  const greet = name ? ('Hi ' + name + ',') : 'Hello,';

  return '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#0c1324;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#e9eefb">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1324;padding:32px 0">' +
        '<tr><td align="center">' +
          '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#111a2e;border:1px solid #1f2e4d;border-radius:16px;overflow:hidden">' +
            '<tr><td style="padding:24px 28px;background:linear-gradient(135deg,#6366f1,#22d3ee);">' +
              '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-.3px">LearnAI Platform</div>' +
              '<div style="font-size:12px;color:#e0e7ff;margin-top:2px">Multimodal learning &amp; evaluation</div>' +
            '</td></tr>' +
            '<tr><td style="padding:28px">' +
              '<div style="font-size:20px;font-weight:700;margin-bottom:8px">' + heading + '</div>' +
              '<div style="color:#8b9dc4;font-size:14px;line-height:1.6;margin-bottom:20px">' +
                greet + ' Use the code below to ' + action + '.' +
              '</div>' +
              '<div style="text-align:center;padding:18px;background:#16203a;border:1px solid #1f2e4d;border-radius:12px">' +
                '<div style="font-size:11px;letter-spacing:2px;color:#8b9dc4;text-transform:uppercase;margin-bottom:6px">Your one-time code</div>' +
                '<div style="font-family:ui-monospace,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#fde68a">' + code + '</div>' +
              '</div>' +
              '<div style="color:#8b9dc4;font-size:13px;line-height:1.6;margin-top:20px">' +
                'This code expires in <b style="color:#e9eefb">10 minutes</b>. ' +
                'If you didn\'t request it, you can safely ignore this email.' +
              '</div>' +
            '</td></tr>' +
            '<tr><td style="padding:16px 28px;border-top:1px solid #1f2e4d;color:#8b9dc4;font-size:11.5px">' +
              'AI-Based Multimodal Learning Platform · automated message, please do not reply.' +
            '</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</body></html>';
}

function buildText(code, purpose) {
  const action = purpose === 'signup' ? 'complete your registration'
    : purpose === 'reset' ? 'reset your password'
    : 'sign in';
  return 'LearnAI Platform' + NL + NL +
    'Your one-time code to ' + action + ' is: ' + code + NL + NL +
    'This code expires in 10 minutes.' + NL +
    'If you did not request it, ignore this email.' + NL;
}

async function sendOtp(to, code, purpose, name) {
  if (!isEnabled()) {
    return { sent: false, reason: 'smtp-not-configured' };
  }
  try {
    const subject = purpose === 'signup' ? 'Verify your email — LearnAI'
      : purpose === 'reset' ? 'Reset your password — LearnAI'
      : 'Your sign-in code — LearnAI';
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to: to,
      subject: subject,
      text: buildText(code, purpose),
      html: buildHtml(to, code, purpose, name)
    });
    lastError = null;
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    lastError = e.message;
    console.warn('[emailService] send failed:', e.message);
    return { sent: false, reason: 'send-error', error: e.message };
  }
}

async function verifyConnection() {
  if (!isEnabled()) return { ok: false, reason: 'smtp-not-configured' };
  try {
    await getTransporter().verify();
    lastError = null;
    return { ok: true };
  } catch (e) {
    lastError = e.message;
    return { ok: false, reason: 'verify-failed', error: e.message };
  }
}

function status() {
  return {
    enabled: isEnabled(),
    host: env('SMTP_HOST') || null,
    user: env('SMTP_USER') || null,
    from: fromAddress(),
    lastError: lastError
  };
}

module.exports = { sendOtp, verifyConnection, isEnabled, status };
