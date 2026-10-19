import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { CRM } from './pages/CRM';
import { Quotes, QuoteAcceptance } from './pages/Quotes';
import { ProjectsPage, TimesheetsPage, PeoplePage, InvoicingPage, ExpensesPage, MigrationPage, DocumentsPage, WorkflowsPage, ApprovalsPage } from './pages/Operations';
import { InvoiceDetailPage, LeaveManagementPage, PersonDetailPage, TasksPage, TeamDetailPage, TeamsPage } from './pages/OperationsManagement';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={<Login />}
            />
            <Route
              path="/forgot-password"
              element={<Login />}
            />
            <Route
              path="/reset-password"
              element={<Login />}
            />
            <Route path="/quote-accept/:token" element={<QuoteAcceptance />} />

            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/crm" element={<CRM />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/timesheets" element={<TimesheetsPage />} />
              <Route path="/invoicing" element={<InvoicingPage />} />
              <Route path="/invoicing/:invoiceId" element={<InvoiceDetailPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/people/:personId" element={<PersonDetailPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/teams/:teamId" element={<TeamDetailPage />} />
              <Route path="/leave" element={<LeaveManagementPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/migration" element={<MigrationPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
