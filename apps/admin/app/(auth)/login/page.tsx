"use client";

import React, { useState } from "react";
import Link from "next/link";
import { loginAdmin } from "./actions";
import { ShieldAlert, Lock, Mail, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      
      const result = await loginAdmin(null, formData);
      if (result && result.error) {
        setError(result.error);
        setLoading(false);
      }
    } catch (err) {
      // If Next.js redirect happens, it redirects away so we don't need to setLoading(false)
      // otherwise, handle any unexpected errors
      console.error(err);
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-soft text-ink font-sans flex flex-col justify-between selection:bg-primary-active selection:text-on-primary">
      {/* Header / Nav */}
      <header className="max-w-7xl w-full mx-auto px-6 py-6 flex items-center">
        <Link 
          href="/" 
          className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity"
        >
          <ArrowLeft size={16} />
          Back to Signup
        </Link>
      </header>

      {/* Login Card */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-canvas p-8 rounded-xl border border-black/[0.08] shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center mx-auto mb-4">
              <span className="text-primary font-black text-2xl">K</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-ink">Admin Portal</h1>
            <p className="text-sm text-mute">
              Sign in with your administrator credentials.
            </p>
          </div>

          {error && (
            <div className="bg-negative-bg text-negative-darkest text-xs p-3.5 rounded-lg font-medium border border-negative/20 flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-1">
                <Mail size={12} />
                <span>Admin Email</span>
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-canvas text-ink border border-ink/20 rounded-md focus:outline-none focus:border-ink transition-all text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-1">
                <Lock size={12} />
                <span>Password</span>
              </label>
              <input
                id="password"
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-canvas text-ink border border-ink/20 rounded-md focus:outline-none focus:border-ink transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink hover:bg-ink/90 active:bg-black text-primary py-3 px-6 rounded-xl font-bold transition-all duration-200 mt-6 shadow-sm disabled:opacity-50 flex justify-center items-center"
            >
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>

          <div className="pt-4 border-t border-black/[0.05] text-center">
            <p className="text-[11px] text-mute leading-normal">
              Protected area. All actions are logged inside the system audit records for accountability.
            </p>
          </div>
        </div>
      </main>

      {/* Footer spacer */}
      <footer className="py-6 text-center text-xs text-mute">
        KutumbKosh Admin Panel &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
