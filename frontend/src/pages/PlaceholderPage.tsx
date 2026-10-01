import React from 'react';
import { Sparkles, Construction } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  description: string;
  phase: string;
}

export const PlaceholderPage: React.FC<PlaceholderProps> = ({
  title,
  description,
  phase,
}) => {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {description}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-500 border border-sky-500/20">
          Scheduled: {phase}
        </span>
      </div>

      <div className="p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
          <Construction className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {title} Module
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2">
          This module is part of {phase}. Its database models, services, and APIs will be connected in sequence.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-sky-600 dark:text-sky-400 font-medium">
          <Sparkles className="w-4 h-4" />
          <span>OpsPilot Agent-driven architecture</span>
        </div>
      </div>
    </div>
  );
};
