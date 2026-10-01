import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-sm font-medium text-slate-500">Loading OpsPilot...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--canvas)] font-sans">
      {sidebarOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenu={() => setSidebarOpen((open) => !open)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
