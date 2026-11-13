import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { useApp } from "./context/AppContext";
import { hasAnyPermission, hasPermission } from "./lib/roleAccess";
import AuditLogs from "./pages/AuditLogs";
import CaseForm from "./pages/CaseForm";
import CaseDetails from "./pages/CaseDetails";
import Cases from "./pages/Cases";
import Dashboard from "./pages/Dashboard";
import DocumentViewer from "./pages/DocumentViewer";
import Documents from "./pages/Documents";
import ForgotPassword from "./pages/ForgotPassword";
import Feedbacks from "./pages/Feedbacks";
import Integrity from "./pages/Integrity";
import Login from "./pages/Login";
import ReadNotifications from "./pages/ReadNotifications";
import Reports from "./pages/Reports";
import ResetPassword from "./pages/ResetPassword";
import Roles from "./pages/Roles";
import Settings from "./pages/Settings";
import Signup from "./pages/Signup";
import UploadDocument from "./pages/UploadDocument";
import Users from "./pages/Users";
import VersionHistory from "./pages/VersionHistory";
import SupervisorTeam from "./pages/SupervisorTeam";

function Protected({ children, permission, permissions, role }) {
  const { user, bootstrapping } = useApp();
  const location = useLocation();
  if (bootstrapping) return <div className="empty">Restoring secure session…</div>;
  if (!user) return <Navigate to="/" replace />;
  const allowedByRole = !role || role === user.role;
  const allowedByPermission = permission
    ? hasPermission(user, permission)
    : !permissions || hasAnyPermission(user, permissions);
  if (!allowedByRole || !allowedByPermission) {
    return (
      <Navigate
        to="/"
        replace
        state={{ accessDenied: true, attemptedPath: location.pathname }}
      />
    );
  }
  return children;
}

function AdminFallback() {
  const { user } = useApp();
  const location = useLocation();
  if (user?.role === "Admin" && hasPermission(user, "admin.users")) {
    return <Navigate to="/admin/users" replace />;
  }
  return (
    <Navigate
      to="/"
      replace
      state={{ accessDenied: true, attemptedPath: location.pathname }}
    />
  );
}

function Guest({ children }) {
  const { user, bootstrapping } = useApp();
  if (bootstrapping) return <div className="empty">Loading…</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function Entry() {
  const { user, bootstrapping } = useApp();
  if (bootstrapping) return <div className="empty">Loading…</div>;
  return user ? (
    <Layout />
  ) : (
    <Signup />
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/signup"
        element={
          <Guest>
            <Signup />
          </Guest>
        }
      />
      <Route
        path="/login"
        element={
          <Guest>
            <Login />
          </Guest>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Guest>
            <ForgotPassword />
          </Guest>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Guest>
            <ResetPassword />
          </Guest>
        }
      />
      <Route
        path="/"
        element={
          <Entry />
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="cases"
          element={
            <Protected permission="cases.view">
              <Cases />
            </Protected>
          }
        />
        <Route
          path="cases/new"
          element={
            <Protected permission="cases.create">
              <CaseForm />
            </Protected>
          }
        />
        <Route
          path="cases/:id"
          element={
            <Protected permission="cases.view">
              <CaseDetails />
            </Protected>
          }
        />
        <Route
          path="cases/:id/edit"
          element={
            <Protected permission="cases.edit">
              <CaseForm />
            </Protected>
          }
        />
        <Route
          path="documents"
          element={
            <Protected permission="docs.view">
              <Documents />
            </Protected>
          }
        />
        <Route
          path="documents/upload"
          element={
            <Protected permission="docs.upload">
              <UploadDocument />
            </Protected>
          }
        />
        <Route
          path="documents/:id"
          element={
            <Protected permission="docs.view">
              <DocumentViewer />
            </Protected>
          }
        />
        <Route
          path="documents/:id/versions"
          element={
            <Protected permission="docs.view">
              <VersionHistory />
            </Protected>
          }
        />
        <Route
          path="security/integrity"
          element={
            <Protected permission="integrity.verify">
              <Integrity />
            </Protected>
          }
        />
        <Route
          path="security/audit"
          element={
            <Protected permission="audit.view">
              <AuditLogs />
            </Protected>
          }
        />
        <Route
          path="reports"
          element={
            <Protected permissions={["reports.view", "reports.generate"]}>
              <Reports />
            </Protected>
          }
        />
        <Route
          path="admin/users"
          element={
            <Protected permission="admin.users" role="Admin">
              <Users />
            </Protected>
          }
        />
        <Route
          path="admin/roles"
          element={
            <Protected permission="admin.users" role="Admin">
              <Roles />
            </Protected>
          }
        />
        <Route
          path="admin/feedback"
          element={
            <Protected permission="admin.users" role="Admin">
              <Feedbacks />
            </Protected>
          }
        />
        <Route
          path="team/officers"
          element={
            <Protected permission="cases.edit" role="Supervisor">
              <SupervisorTeam />
            </Protected>
          }
        />
        <Route
          path="supervisor/review"
          element={
            <Protected permission="cases.view" role="Supervisor">
              <Cases title="Review Cases" initialStatus="On Hold,Pending Review,Pending Closure" />
            </Protected>
          }
        />
        <Route
          path="supervisor/pending"
          element={
            <Protected permission="cases.view" role="Supervisor">
              <Cases title="Pending Approvals" initialStatus="On Hold,Pending Review,Pending Closure" />
            </Protected>
          }
        />
        <Route
          path="notifications"
          element={
            <Protected>
              <ReadNotifications />
            </Protected>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="admin/*" element={<AdminFallback />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
