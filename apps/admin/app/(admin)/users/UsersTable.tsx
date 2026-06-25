"use client";

import React, { useState, useTransition } from "react";
import { approveUser, rejectUser, resendCredentials, toggleUserSuspension } from "./actions";
import {
  UserCheck,
  UserX,
  Search,
  Mail,
  Users,
  Calendar,
  CheckCircle,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string;
  familyName: string | null;
  memberCount: number | null;
  status: "pending" | "approved" | "suspended" | "rejected" | null;
  approvedAt: Date | null;
  joinedAt: Date | null;
  lastSeen: Date | null;
  appVersion: string | null;
}

interface UsersTableProps {
  initialUsers: User[];
  isSmtpConfigured?: boolean;
}

export function UsersTable({ initialUsers, isSmtpConfigured = true }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  // ── Credential reveal modal (approve + resend) ──────────────────────────────
  const [revealModal, setRevealModal] = useState<{
    isOpen: boolean;
    mode: "approved" | "resent";
    email: string;
    name: string;
    masterPassword?: string;
    emailWarning?: string;
  }>({ isOpen: false, mode: "approved", email: "", name: "" });

  const [copied, setCopied] = useState(false);

  // ── Resend confirm modal ────────────────────────────────────────────────────
  const [resendConfirm, setResendConfirm] = useState<{
    isOpen: boolean;
    userId: string;
    email: string;
    name: string;
  }>({ isOpen: false, userId: "", email: "", name: "" });

  const handleCopy = () => {
    if (revealModal.masterPassword) {
      navigator.clipboard.writeText(revealModal.masterPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Approve ─────────────────────────────────────────────────────────────────
  const handleApprove = (userId: string) => {
    const userToApprove = users.find((u) => u.id === userId);
    if (!userToApprove) return;

    setActionUserId(userId);
    startTransition(async () => {
      try {
        const result = await approveUser(userId);

        if (result?.error) {
          alert(result.error);
          return;
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, status: "approved", approvedAt: new Date() } : u
          )
        );

        if (result?.masterPassword) {
          setRevealModal({
            isOpen: true,
            mode: "approved",
            email: userToApprove.email,
            name: userToApprove.name,
            masterPassword: result.masterPassword,
            emailWarning: result.emailWarning,
          });
        }
      } catch (err) {
        console.error("Failed to approve user:", err);
        alert("Failed to approve user. See console for details.");
      } finally {
        setActionUserId(null);
      }
    });
  };

  // ── Reject ──────────────────────────────────────────────────────────────────
  const handleReject = (userId: string) => {
    setActionUserId(userId);
    startTransition(async () => {
      try {
        const result = await rejectUser(userId);
        if (result?.error) {
          alert(result.error);
          return;
        }
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: "rejected" } : u))
        );
      } catch (err) {
        console.error("Failed to reject user:", err);
        alert("Failed to reject user.");
      } finally {
        setActionUserId(null);
      }
    });
  };

  // ── Resend — open confirm modal ─────────────────────────────────────────────
  const promptResendConfirm = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    setResendConfirm({ isOpen: true, userId, email: user.email, name: user.name });
  };

  // ── Resend — actually execute ────────────────────────────────────────────────
  const executeResend = () => {
    const { userId, email, name } = resendConfirm;
    setResendConfirm({ isOpen: false, userId: "", email: "", name: "" });
    setActionUserId(userId);

    startTransition(async () => {
      try {
        const result = await resendCredentials(userId);
        if (result?.error) {
          alert(result.error);
          return;
        }

        if (result?.masterPassword) {
          setRevealModal({
            isOpen: true,
            mode: "resent",
            email,
            name,
            masterPassword: result.masterPassword,
            emailWarning: result.emailWarning,
          });
        }
      } catch (err) {
        console.error("Failed to resend credentials:", err);
        alert("Failed to resend credentials. See console.");
      } finally {
        setActionUserId(null);
      }
    });
  };

  // ── Toggle Suspension ────────────────────────────────────────────────────────
  const handleToggleSuspension = (userId: string) => {
    setActionUserId(userId);
    startTransition(async () => {
      try {
        const result = await toggleUserSuspension(userId);
        if (result?.error) {
          alert(result.error);
          return;
        }
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: result.status as any } : u))
        );
      } catch (err) {
        console.error("Failed to toggle suspension:", err);
        alert("Failed to toggle suspension.");
      } finally {
        setActionUserId(null);
      }
    });
  };

  // ── Filtering & searching ────────────────────────────────────────────────────
  const filteredUsers = users.filter((user) => {
    const matchesFilter = filter === "all" ? true : user.status === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      (user.familyName && user.familyName.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  // ── Status badge helper ──────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: User["status"] }) => {
    if (status === "approved")
      return (
        <span className="inline-flex bg-primary-pale text-positive-deep font-bold text-[11px] uppercase px-3 py-1 rounded-full border border-positive/10">
          approved
        </span>
      );
    if (status === "suspended")
      return (
        <span className="inline-flex bg-negative/10 text-negative-darkest font-bold text-[11px] uppercase px-3 py-1 rounded-full border border-negative/20">
          suspended
        </span>
      );
    if (status === "pending")
      return (
        <span className="inline-flex bg-warning/10 text-warning-content font-bold text-[11px] uppercase px-3 py-1 rounded-full border border-warning/20">
          pending
        </span>
      );
    if (status === "rejected")
      return (
        <span className="inline-flex bg-negative-bg text-canvas font-bold text-[11px] uppercase px-3 py-1 rounded-full">
          rejected
        </span>
      );
    return null;
  };

  return (
    <div className="space-y-6">
      {!isSmtpConfigured && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3 text-warning-content text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">SMTP / Email is NOT Configured</p>
            <p className="leading-relaxed mt-0.5">
              No SMTP settings detected in your environment. Automatic emails (welcome credentials, recovery OTPs) will fail to send. 
              Please verify your <code>.env</code> file configuration and restart the Next.js server.
            </p>
            <p className="mt-1.5 font-semibold text-xs">
              Note: When you approve or resend credentials, the master password will be shown in a modal so you can copy and share it manually.
            </p>
          </div>
        </div>
      )}
      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-canvas p-4 rounded-xl border border-black/[0.05] shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3.5 text-mute w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name, email, family..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-canvas-soft border border-ink/10 rounded-lg text-sm text-ink focus:outline-none focus:border-ink transition-all"
          />
        </div>

        <div className="flex gap-1.5 bg-canvas-soft p-1 rounded-xl w-full md:w-auto">
          {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex-1 md:flex-initial ${
                filter === tab
                  ? "bg-ink text-primary shadow"
                  : "text-mute hover:text-ink"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-canvas rounded-xl border border-black/[0.05] shadow-sm overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-mute space-y-2">
            <Users size={40} className="mx-auto text-mute/50" />
            <p className="font-bold text-sm">No registration requests found</p>
            <p className="text-xs">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-canvas-soft border-b border-black/[0.05] text-xs font-bold text-mute uppercase tracking-wider">
                  <th className="py-4 px-6">User</th>
                  <th className="py-4 px-6">Family Info</th>
                  <th className="py-4 px-6">Request Date</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-canvas-soft/30 transition-colors text-sm text-ink">
                    {/* User */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-pale text-ink flex items-center justify-center font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <span className="block font-bold">{user.name}</span>
                          <span className="block text-xs text-mute flex items-center gap-1">
                            <Mail size={12} />
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Family */}
                    <td className="py-4 px-6">
                      <span className="block font-semibold">
                        {user.familyName || "No Family Group Name"}
                      </span>
                      <span className="block text-xs text-mute">
                        Limit: {user.memberCount ?? 5} members
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-6 text-xs text-body font-medium">
                      <div className="flex items-center gap-1">
                        <Calendar size={13} className="text-mute" />
                        {user.joinedAt
                          ? new Date(user.joinedAt).toLocaleDateString("en-IN")
                          : "Pending"}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">
                      <StatusBadge status={user.status} />
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      {user.status === "pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            className="bg-primary hover:bg-primary-hover active:bg-primary-active text-ink font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                          >
                            <UserCheck size={14} />
                            {isPending && actionUserId === user.id ? "Approving…" : "Approve"}
                          </button>
                          <button
                            onClick={() => handleReject(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            className="bg-canvas border border-ink/20 hover:bg-canvas-soft text-negative-darkest font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            <UserX size={14} />
                            {isPending && actionUserId === user.id ? "…" : "Reject"}
                          </button>
                        </div>
                      )}

                      {(user.status === "approved" || user.status === "suspended") && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => promptResendConfirm(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            title="Regenerate & Resend Master Password"
                            className="bg-canvas border border-ink/10 hover:bg-canvas-soft text-ink font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={isPending && actionUserId === user.id ? "animate-spin" : ""} />
                            {isPending && actionUserId === user.id ? "Sending…" : "Resend Credentials"}
                          </button>
                          <button
                            onClick={() => handleToggleSuspension(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            className={`font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50 ${
                              user.status === "suspended"
                                ? "bg-primary hover:bg-primary-hover text-ink"
                                : "bg-canvas border border-negative/20 text-negative-darkest hover:bg-negative-bg hover:text-white"
                            }`}
                          >
                            {user.status === "suspended" ? "Activate" : "Suspend"}
                          </button>
                        </div>
                      )}

                      {user.status === "rejected" && (
                        <span className="text-xs text-negative-darkest font-semibold">
                          Request Rejected
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Resend Confirm Modal ──────────────────────────────────────────────── */}
      {resendConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-canvas w-full max-w-md rounded-xl border border-black/[0.08] p-8 shadow-xl space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                <TriangleAlert size={24} className="text-warning-deep" />
              </div>
              <div>
                <h3 className="text-lg font-black text-ink">Regenerate Credentials?</h3>
                <p className="text-sm text-body mt-1 leading-relaxed">
                  This will generate a <strong>new master password</strong> for{" "}
                  <strong>{resendConfirm.name}</strong> ({resendConfirm.email}) and send it
                  via email.
                </p>
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning-content text-[12px] leading-relaxed">
              <p className="font-bold mb-1">⚠️ This action cannot be undone:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>The old master password will be <strong>invalidated immediately</strong>.</li>
                <li>Their stored cloud database URL will be <strong>cleared</strong> from our servers (it was encrypted with the old key).</li>
                <li>They will need to re-enter their database URL after logging in on their device.</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setResendConfirm({ isOpen: false, userId: "", email: "", name: "" })}
                className="flex-1 bg-canvas-soft text-ink font-bold py-2.5 rounded-xl hover:bg-canvas border border-ink/10 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={executeResend}
                className="flex-1 bg-ink text-primary font-bold py-2.5 rounded-xl hover:opacity-90 transition-all text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw size={15} />
                Yes, Regenerate & Resend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credential Reveal Modal (approve + resend) ────────────────────────── */}
      {revealModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-canvas w-full max-w-lg rounded-xl border border-black/[0.08] p-8 shadow-xl space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex w-14 h-14 rounded-full bg-primary-pale flex items-center justify-center mx-auto mb-2">
                {revealModal.mode === "approved" ? (
                  <CheckCircle size={32} className="text-positive" />
                ) : (
                  <RefreshCw size={28} className="text-ink" />
                )}
              </div>
              <h3 className="text-2xl font-black tracking-tight text-ink">
                {revealModal.mode === "approved"
                  ? "User Approved Successfully!"
                  : "Credentials Regenerated!"}
              </h3>
              <p className="text-sm text-body">
                {revealModal.mode === "approved"
                  ? <>
                      Welcome email sent to <strong>{revealModal.name}</strong> ({revealModal.email}).
                    </>
                  : <>
                      New master password sent to <strong>{revealModal.name}</strong> ({revealModal.email}).{" "}
                      Their old password is now invalid.
                    </>
                }
              </p>
            </div>

            {/* Email warning banner (shown if SMTP failed) */}
            {revealModal.emailWarning && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3 text-warning-content text-xs">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-0.5">Email delivery failed</p>
                  <p className="leading-relaxed">{revealModal.emailWarning}</p>
                  <p className="mt-1 font-semibold">Share the password below directly with the user.</p>
                </div>
              </div>
            )}

            {/* Password box */}
            {revealModal.masterPassword && (
              <div className="bg-canvas-soft border-2 border-primary rounded-xl p-5 space-y-4">
                <div className="text-center space-y-1">
                  <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">
                    {revealModal.mode === "approved" ? "Generated Master Access Password" : "New Master Access Password"}
                  </span>
                  <span className="block font-mono text-2xl font-black tracking-widest text-ink select-all">
                    {revealModal.masterPassword}
                  </span>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 bg-ink text-primary font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-sm"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-positive" />
                        Copied to Clipboard
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy Master Password
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-warning-deep/10 border border-warning/20 p-3 rounded-lg flex items-start gap-2.5 text-warning-content text-[11px]">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p className="leading-normal font-medium">
                    <strong>CRITICAL SECURITY NOTE:</strong> This password is shown{" "}
                    <strong>ONLY ONCE</strong>. It is not stored in plaintext anywhere.
                    Ensure the email arrives, or copy it to share directly.
                  </p>
                </div>
              </div>
            )}

            {/* Close */}
            <button
              onClick={() => {
                setRevealModal({ isOpen: false, mode: "approved", email: "", name: "" });
                setCopied(false);
              }}
              className="w-full bg-ink text-canvas-soft font-bold py-3 px-6 rounded-xl transition-all hover:bg-black/90 active:scale-[0.99]"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
