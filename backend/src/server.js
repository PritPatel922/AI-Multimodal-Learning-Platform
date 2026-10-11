// -- Node 24 Windows DNS fix (c-ares regression) --
const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[dns] forced resolvers:', dns.getServers());
} catch (e) {
  console.warn('[dns] could not set resolvers:', e.message);
}

require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const { seed } = require('./seed');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', function (req, res) {
  res.json({
    ok: true,
    service: 'ai-multimodal-learning-backend',
    driver: db.driver || 'unknown',
    demoMode: String(process.env.OTP_DEMO_MODE || 'true') !== 'false',
    aiEngine: process.env.OPENAI_API_KEY ? 'openai' : 'demo',
    time: new Date().toISOString()
  });
});

app.get('/api/health/smtp', async function (req, res) {
  const emailService = require('./services/emailService');
  const s = emailService.status();
  let verify = { ok: false, reason: 'disabled' };
  if (s.enabled) verify = await emailService.verifyConnection();
  res.json({ status: s, verify: verify });
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use(function (req, res) {
  res.status(404).json({ error: 'Endpoint not found: ' + req.method + ' ' + req.originalUrl });
});

app.use(function (err, req, res, next) {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

seed();

app.listen(PORT, function () {
  console.log('');
  console.log('  Backend running on http://localhost:' + PORT);
  console.log('  SQLite driver: ' + (db.driver || 'unknown'));
  console.log('  AI engine: ' + (process.env.OPENAI_API_KEY ? 'OpenAI' : 'DEMO (mock)'));
  console.log('  OTP demo mode: ' + (String(process.env.OTP_DEMO_MODE || 'true') !== 'false' ? 'ON' : 'OFF'));
  console.log('');
});
