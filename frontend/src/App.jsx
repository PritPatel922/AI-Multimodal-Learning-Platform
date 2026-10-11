
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, Spinner } from './components/ui';
import Layout from './components/Layout';

import { Login, Signup, OtpVerify, ForgotPassword, ResetPassword } from './pages/auth';
import {
  StudentDashboard, StudentAssessments, TakeAssessment, StudentResults, StudentProfile
} from './pages/student';
import {
  TeacherDashboard, TeacherMaterials, MaterialDetail, QuestionReview,
  TeacherResponses, TeacherEvaluation, TeacherComparison
} from './pages/teacher';
import { AdminDashboard, AdminUsers, AdminAnalytics, AdminResearch } from './pages/admin';

function homeFor(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/teacher/dashboard';
  return '/student/dashboard';
}

function Protected(props) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 60 }}><Spinner label="Loading session..." /></div>;
  if (!user) return <Navigate to="/auth/login" replace />;
  if (props.roles && props.roles.indexOf(user.role) === -1) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return props.children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 60 }}><Spinner label="Loading..." /></div>;
  return <Navigate to={user ? homeFor(user.role) : '/auth/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />

            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="/auth/otp" element={<OtpVerify />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />

            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/student/dashboard" element={<Protected roles={['student']}><StudentDashboard /></Protected>} />
              <Route path="/student/assessments" element={<Protected roles={['student']}><StudentAssessments /></Protected>} />
              <Route path="/student/assessment/:id" element={<Protected roles={['student']}><TakeAssessment /></Protected>} />
              <Route path="/student/results" element={<Protected roles={['student']}><StudentResults /></Protected>} />
              <Route path="/student/profile" element={<Protected roles={['student']}><StudentProfile /></Protected>} />

              <Route path="/teacher/dashboard" element={<Protected roles={['teacher', 'admin']}><TeacherDashboard /></Protected>} />
              <Route path="/teacher/materials" element={<Protected roles={['teacher', 'admin']}><TeacherMaterials /></Protected>} />
              <Route path="/teacher/materials/:id" element={<Protected roles={['teacher', 'admin']}><MaterialDetail /></Protected>} />
              <Route path="/teacher/questions" element={<Protected roles={['teacher', 'admin']}><QuestionReview /></Protected>} />
              <Route path="/teacher/responses" element={<Protected roles={['teacher', 'admin']}><TeacherResponses /></Protected>} />
              <Route path="/teacher/evaluation/:id" element={<Protected roles={['teacher', 'admin']}><TeacherEvaluation /></Protected>} />
              <Route path="/teacher/comparison" element={<Protected roles={['teacher', 'admin']}><TeacherComparison /></Protected>} />

              <Route path="/admin/dashboard" element={<Protected roles={['admin']}><AdminDashboard /></Protected>} />
              <Route path="/admin/users" element={<Protected roles={['admin']}><AdminUsers /></Protected>} />
              <Route path="/admin/analytics" element={<Protected roles={['admin']}><AdminAnalytics /></Protected>} />
              <Route path="/admin/research" element={<Protected roles={['admin']}><AdminResearch /></Protected>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
