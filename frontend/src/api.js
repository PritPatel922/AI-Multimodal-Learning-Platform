
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

export function getToken() { return localStorage.getItem('token'); }
export function setToken(t) {
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

async function req(path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const t = getToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;

  const res = await fetch(BASE + path, Object.assign({}, opts, { headers: headers }));
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text }; }

  if (!res.ok) {
    const err = new Error((data && data.error) || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: function (p) { return req(p); },
  post: function (p, b) {
    return req(p, { method: 'POST', body: b instanceof FormData ? b : JSON.stringify(b || {}) });
  },
  put: function (p, b) { return req(p, { method: 'PUT', body: JSON.stringify(b || {}) }); },
  del: function (p) { return req(p, { method: 'DELETE' }); }
};
