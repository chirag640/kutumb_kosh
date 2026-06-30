"use client";

import React from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="bg-canvas rounded-xl border border-negative/20 p-8 max-w-md w-full shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-negative-bg/10 flex items-center justify-center mx-auto">
          <TriangleAlert size={28} className="text-negative-darkest" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black text-ink tracking-tight">Something went wrong</h2>
          <p className="text-sm text-body leading-relaxed">
            An unexpected error occurred while loading this page.
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre className="mt-3 p-3 bg-canvas-soft rounded-lg text-xs text-left font-mono text-body max-h-32 overflow-auto border border-black/5">
              {error.message}
              {"\n"}
              {error.stack?.split("\n").slice(1, 4).join("\n")}
            </pre>
          )}
        </div>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-ink text-primary font-bold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      </div>
    </div>
  );
}
