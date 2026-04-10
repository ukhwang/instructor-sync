"use client";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeComparisonProps {
  original: string;
  migrated: string;
}

export function KnowledgeGapReport({ original, migrated }: CodeComparisonProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Original (Outdated)</label>
            <span className="text-[10px] text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">Python</span>
        </div>
        <div className="rounded-xl overflow-hidden border border-red-100 shadow-sm">
          <SyntaxHighlighter 
            language="python" 
            style={oneDark} 
            customStyle={{ 
                margin: 0, 
                padding: '16px',
                fontSize: '13px',
                lineHeight: '1.6',
                background: '#1a1b26'
            }}
          >
            {original}
          </SyntaxHighlighter>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Migrated (Proposed)</label>
            <span className="text-[10px] text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">Python</span>
        </div>
        <div className="rounded-xl overflow-hidden border border-green-100 shadow-sm">
          <SyntaxHighlighter 
            language="python" 
            style={oneDark} 
            customStyle={{ 
                margin: 0, 
                padding: '16px',
                fontSize: '13px',
                lineHeight: '1.6',
                background: '#1a1b26'
            }}
          >
            {migrated}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}
