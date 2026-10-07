import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-sky-500 border-t-transparent"></div>
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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: slide-in drawer on mobile, static column on md+ */}
      <div
        className={`${sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 shrink-0 transition-transform duration-300 ease-out md:static md:translate-x-0 md:shadow-none`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenu={() => setSidebarOpen((open) => !open)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-color:rgb(148_163_184/0.5)_transparent] [scrollbar-width:thin] sm:px-6 sm:py-7 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};