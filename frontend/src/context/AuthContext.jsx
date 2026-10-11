
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    let alive = true;
    (async function () {
      if (!getToken()) { setLoading(false); return; }
      try {
        const r = await api.get('/auth/me');
        if (alive) setUser(r.user);
      } catch (e) {
        setToken(null);
      }
      if (alive) setLoading(false);
    })();
    return function () { alive = false; };
  }, []);

  const login = function (token, u) { setToken(token); setUser(u); };
  const logout = function () { setToken(null); setUser(null); };

  return (
    <AuthContext.Provider value={{ user: user, loading: loading, login: login, logout: logout }}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
