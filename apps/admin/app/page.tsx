"use client";

import React, { useState } from "react";
import Link from "next/link";
import { registerUser } from "@/app/(admin)/users/actions";
import { Shield, Users, CheckCircle, ArrowRight, Database } from "lucide-react";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [memberCount, setMemberCount] = useState(5);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      setErrorMessage("Name and email are required.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const result = await registerUser({
        name,
        email,
        familyName: familyName || undefined,
        memberCount: Number(memberCount),
      });
      if (result && result.error) {
        setErrorMessage(result.error);
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to submit registration request. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-canvas-soft text-ink font-sans flex flex-col justify-between selection:bg-primary-active selection:text-on-primary">
      {/* Header */}
      <header className="max-w-7xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-ink flex items-center justify-center">
            <span className="text-primary font-black text-xl">K</span>
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-ink">KutumbKosh</span>
            <span className="block text-[10px] text-mute uppercase tracking-widest font-bold">Family Treasury</span>
          </div>
        </div>
        <Link 
          href="/login"
          className="text-sm font-semibold hover:underline bg-canvas border border-ink px-4 py-2 rounded-xl transition-all duration-200 hover:bg-canvas-soft"
        >
          Admin Portal
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center py-12">
        {/* Left column: Value Prop / Brand Intro */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-4">
            <span className="inline-block bg-primary-pale text-ink-deep font-bold text-xs uppercase px-3 py-1.5 rounded-full tracking-wider">
              Offline-First &amp; Encrypted
            </span>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-[1.05] text-ink">
              Your family's private financial fortress.
            </h1>
            <p className="text-lg lg:text-xl text-body max-w-xl font-normal leading-relaxed">
              KutumbKosh stores and end-to-end encrypts your family's assets, insurance policies, loans, and documents on your own device. Back up to your private database securely.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="bg-canvas p-6 rounded-xl space-y-2 border border-black/5 hover:border-black/10 transition-all">
              <div className="w-10 h-10 rounded-full bg-primary-pale flex items-center justify-center text-ink-deep">
                <Shield size={20} />
              </div>
              <h3 className="font-bold text-base">E2E AES-256 Encryption</h3>
              <p className="text-sm text-body">
                We never see your master password or financial data. Everything is encrypted locally on your phone.
              </p>
            </div>

            <div className="bg-canvas p-6 rounded-xl space-y-2 border border-black/5 hover:border-black/10 transition-all">
              <div className="w-10 h-10 rounded-full bg-primary-pale flex items-center justify-center text-ink-deep">
                <Database size={20} />
              </div>
              <h3 className="font-bold text-base">Self-Hosted Sync</h3>
              <p className="text-sm text-body">
                Configure your own Neon or Supabase DB. Sync on-demand or automatically without paying subscription fees.
              </p>
            </div>
          </div>
        </div>

        {/* Right column: Form Card */}
        <div className="lg:col-span-5">
          <div className="bg-canvas p-8 rounded-xl border border-black/[0.08] shadow-sm">
            {status === "success" ? (
              <div className="text-center space-y-6 py-8">
                <div className="inline-flex w-16 h-16 rounded-full bg-primary-pale text-positive flex items-center justify-center mx-auto">
                  <CheckCircle size={40} className="text-positive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold tracking-tight">Request Submitted!</h2>
                  <p className="text-sm text-body max-w-sm mx-auto">
                    Your request to join KutumbKosh has been sent to the administrator. If approved, you will receive an email with your master password and next steps.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setName("");
                    setEmail("");
                    setFamilyName("");
                    setMemberCount(5);
                    setStatus("idle");
                  }}
                  className="w-full bg-canvas-soft hover:bg-canvas-soft/80 text-ink py-3 px-6 rounded-xl font-semibold transition-all"
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black tracking-tight">Access Request</h2>
                  <p className="text-sm text-mute">
                    Register your family to receive a secure KutumbKosh master password.
                  </p>
                </div>

                {status === "error" && (
                  <div className="bg-negative-bg text-negative-darkest text-xs p-3 rounded-lg font-medium border border-negative/20">
                    {errorMessage}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-mute">
                      Full Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      placeholder="e.g. Rajesh Patel"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={status === "submitting"}
                      className="w-full px-4 py-3 bg-canvas text-ink border border-ink/20 rounded-md focus:outline-none focus:border-ink transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-mute">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="rajesh@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={status === "submitting"}
                      className="w-full px-4 py-3 bg-canvas text-ink border border-ink/20 rounded-md focus:outline-none focus:border-ink transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="familyName" className="text-xs font-bold uppercase tracking-wider text-mute">
                      Family Name <span className="text-mute font-normal">(Optional)</span>
                    </label>
                    <input
                      id="familyName"
                      type="text"
                      placeholder="e.g. Patel Family"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      disabled={status === "submitting"}
                      className="w-full px-4 py-3 bg-canvas text-ink border border-ink/20 rounded-md focus:outline-none focus:border-ink transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="memberCount" className="text-xs font-bold uppercase tracking-wider text-mute flex justify-between">
                      <span>Estimated Family Members</span>
                      <span className="text-ink font-extrabold">{memberCount}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="memberCount"
                        type="range"
                        min="1"
                        max="20"
                        value={memberCount}
                        onChange={(e) => setMemberCount(Number(e.target.value))}
                        disabled={status === "submitting"}
                        className="flex-1 accent-ink cursor-pointer h-2 bg-canvas-soft rounded-lg appearance-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="w-full bg-primary hover:bg-primary-hover active:bg-primary-active text-on-primary py-3 px-6 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 group shadow-sm disabled:opacity-50"
                >
                  {status === "submitting" ? (
                    "Submitting request..."
                  ) : (
                    <>
                      Request Access Code
                      <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-ink text-canvas-soft py-12 px-6">
        <div className="max-w-7xl w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-on-primary font-black text-base">K</span>
            </div>
            <span className="font-extrabold text-sm tracking-tight text-canvas">KutumbKosh</span>
          </div>
          <p className="text-xs text-mute text-center md:text-right">
            &copy; {new Date().getFullYear()} KutumbKosh. All financial data remains end-to-end encrypted. We store absolutely zero ledger database keys or balance sheets on our systems.
          </p>
        </div>
      </footer>
    </div>
  );
}
