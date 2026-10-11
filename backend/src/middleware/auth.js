
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'ai-multimodal-hackathon-demo-secret';

function sign(user, expiresIn) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: expiresIn || '7d' }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  req.user = user;
  next();
}

function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: 'Access denied for role: ' + req.user.role });
    }
    next();
  };
}

module.exports = { sign, verifyToken, authMiddleware, requireRole, SECRET };
