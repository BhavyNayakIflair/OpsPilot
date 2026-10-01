import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { CRM } from './pages/CRM';
import { Quotes, QuoteAcceptance } from './pages/Quotes';
import { ProjectsPage, TimesheetsPage, PeoplePage, InvoicingPage, ExpensesPage, MigrationPage, DocumentsPage, WorkflowsPage, ApprovalsPage } from './pages/Operations';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/quote-accept/:token" element={<QuoteAcceptance />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/crm"
              element={<CRM />}
            />
            <Route
              path="/quotes"
              element={<Quotes />}
            />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/timesheets" element={<TimesheetsPage />} />
            <Route path="/invoicing" element={<InvoicingPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/migration" element={<MigrationPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
