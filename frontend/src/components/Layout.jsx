
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = {
  student: [
    { to: '/student/dashboard', label: 'Dashboard', ico: '◧' },
    { to: '/student/assessments', label: 'Assessments', ico: '✎' },
    { to: '/student/results', label: 'My Results', ico: '★' },
    { to: '/student/profile', label: 'Profile', ico: '☺' }
  ],
  teacher: [
    { to: '/teacher/dashboard', label: 'Dashboard', ico: '◧' },
    { to: '/teacher/materials', label: 'Learning Materials', ico: '▤' },
    { to: '/teacher/questions', label: 'Question Review', ico: '✓' },
    { to: '/teacher/responses', label: 'Student Responses', ico: '✎' },
    { to: '/teacher/comparison', label: 'AI vs Human', ico: '⇄' }
  ],
  admin: [
    { to: '/admin/dashboard', label: 'System Dashboard', ico: '◧' },
    { to: '/admin/users', label: 'Users', ico: '☷' },
    { to: '/admin/analytics', label: 'Analytics', ico: '▦' },
    { to: '/admin/research', label: 'Research Insights', ico: '✦' }
  ]
};

const TITLES = {
  '/student/dashboard': ['Student Dashboard', 'Your learning overview'],
  '/student/assessments': ['Assessments', 'Attempt approved AI-generated questions'],
  '/student/results': ['My Results', 'AI and teacher feedback on your answers'],
  '/student/profile': ['Profile', 'Account details'],
  '/teacher/dashboard': ['Teacher Dashboard', 'Class and content overview'],
  '/teacher/materials': ['Learning Materials', 'Upload, process and generate questions'],
  '/teacher/questions': ['Question Review', 'Teacher-in-the-loop validation'],
  '/teacher/responses': ['Student Responses', 'Evaluate answers manually'],
  '/teacher/comparison': ['AI vs Human Evaluation', 'Agreement analytics'],
  '/admin/dashboard': ['System Dashboard', 'Platform-wide overview'],
  '/admin/users': ['User Management', 'Students, teachers and admins'],
  '/admin/analytics': ['Analytics', 'Assessment and evaluation statistics'],
  '/admin/research': ['Research Insights', 'AI vs human evaluation research']
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(function () {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const items = NAV[user.role] || [];
  const titleInfo = TITLES[location.pathname] || ['Dashboard', ''];

  const initials = (user.name || 'U').split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="auth-logo">AI</div>
          <div className="txt">
            <strong>LearnAI</strong>
            <span>Multimodal Platform</span>
          </div>
        </div>

        <div className="nav-label">Menu</div>
        {items.map(function (it) {
          return (
            <NavLink
              key={it.to}
              to={it.to}
              className={function (p) { return 'nav-item' + (p.isActive ? ' active' : ''); }}
            >
              <span className="ico">{it.ico}</span>
              <span>{it.label}</span>
            </NavLink>
          );
        })}

        <div className="spacer"></div>
        <div className="nav-label">Session</div>
        <div className="nav-item" onClick={function () { setTheme(theme === 'dark' ? 'light' : 'dark'); }}>
          <span className="ico">{theme === 'dark' ? '☀' : '☾'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </div>
        <div className="nav-item" onClick={function () { logout(); navigate('/auth/login'); }}>
          <span className="ico">⏻</span>
          <span>Sign out</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{titleInfo[0]}</h1>
            <div className="crumb">{titleInfo[1]}</div>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <div className="avatar">{initials}</div>
              <div className="meta">
                <strong>{user.name}</strong>
                <span>{user.role}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
