"use client";

import React, { useState, useTransition } from "react";
import { approveUser, rejectUser } from "./actions";
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
  AlertTriangle
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
}

export function UsersTable({ initialUsers }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  // Password Reveal Modal state
  const [revealModal, setRevealModal] = useState<{
    isOpen: boolean;
    email: string;
    name: string;
    masterPassword?: string;
  }>({ isOpen: false, email: "", name: "" });

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (revealModal.masterPassword) {
      navigator.clipboard.writeText(revealModal.masterPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApprove = async (userId: string) => {
    setActionUserId(userId);
    const userToApprove = users.find(u => u.id === userId);
    if (!userToApprove) return;

    startTransition(async () => {
      try {
        const result = await approveUser(userId);
        
        if (result && result.error) {
          alert(result.error);
          return;
        }

        // Update local state status
        setUsers(prev => 
          prev.map(u => u.id === userId ? { ...u, status: "approved", approvedAt: new Date() } : u)
        );

        if (result && result.masterPassword) {
          setRevealModal({
            isOpen: true,
            email: userToApprove.email,
            name: userToApprove.name,
            masterPassword: result.masterPassword
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

  const handleReject = async (userId: string) => {
    setActionUserId(userId);
    startTransition(async () => {
      try {
        const result = await rejectUser(userId);
        if (result && result.error) {
          alert(result.error);
          return;
        }
        
        // Update local state status
        setUsers(prev => 
          prev.map(u => u.id === userId ? { ...u, status: "rejected" } : u)
        );
      } catch (err) {
        console.error("Failed to reject user:", err);
        alert("Failed to reject user.");
      } finally {
        setActionUserId(null);
      }
    });
  };

  // Filtering & searching
  const filteredUsers = users.filter((user) => {
    const matchesFilter = filter === "all" ? true : user.status === filter;
    const matchesSearch = 
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.familyName && user.familyName.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-canvas p-4 rounded-xl border border-black/[0.05] shadow-sm">
        {/* Search */}
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

        {/* Filter Tabs */}
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

      {/* Users Grid/List */}
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
                    {/* User Profile */}
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

                    {/* Family Info */}
                    <td className="py-4 px-6">
                      <div>
                        <span className="block font-semibold">
                          {user.familyName || "No Family Group Name"}
                        </span>
                        <span className="block text-xs text-mute">
                          Limit: {user.memberCount ?? 5} members
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-6 text-xs text-body font-medium">
                      <div className="flex items-center gap-1">
                        <Calendar size={13} className="text-mute" />
                        {user.joinedAt ? new Date(user.joinedAt).toLocaleDateString("en-IN") : "Pending"}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-6">
                      {user.status === "approved" && (
                        <span className="inline-flex bg-primary-pale text-positive-deep font-bold text-[11px] uppercase px-3 py-1 rounded-full border border-positive/10">
                          approved
                        </span>
                      )}
                      {user.status === "pending" && (
                        <span className="inline-flex bg-warning/10 text-warning-content font-bold text-[11px] uppercase px-3 py-1 rounded-full border border-warning/20">
                          pending
                        </span>
                      )}
                      {user.status === "rejected" && (
                        <span className="inline-flex bg-negative-bg text-canvas font-bold text-[11px] uppercase px-3 py-1 rounded-full">
                          rejected
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      {user.status === "pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            className="bg-primary hover:bg-primary-hover active:bg-primary-active text-on-primary font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                          >
                            <UserCheck size={14} />
                            {isPending && actionUserId === user.id ? "..." : "Approve"}
                          </button>
                          <button
                            onClick={() => handleReject(user.id)}
                            disabled={isPending && actionUserId === user.id}
                            className="bg-canvas border border-ink/20 hover:bg-canvas-soft text-negative-darkest font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            <UserX size={14} />
                            {isPending && actionUserId === user.id ? "..." : "Reject"}
                          </button>
                        </div>
                      )}
                      {user.status === "approved" && (
                        <span className="text-xs text-mute font-medium">
                          Approved on {user.approvedAt ? new Date(user.approvedAt).toLocaleDateString("en-IN") : ""}
                        </span>
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

      {/* Reveal Password Modal */}
      {revealModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-canvas w-full max-w-lg rounded-xl border border-black/[0.08] p-8 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex w-14 h-14 rounded-full bg-primary-pale text-positive flex items-center justify-center mx-auto mb-2">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-ink">User Approved Successfully!</h3>
              <p className="text-sm text-body">
                We've triggered the welcome email notification for <strong>{revealModal.name}</strong> ({revealModal.email}).
              </p>
            </div>

            {/* Password Reveal Section */}
            {revealModal.masterPassword && (
              <div className="bg-canvas-soft border-2 border-primary rounded-xl p-5 space-y-4">
                <div className="text-center space-y-1">
                  <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">
                    Generated Master Access Password
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
                    <strong>CRITICAL SECURITY NOTE:</strong> This password is shown <strong>ONLY ONCE</strong> for your verification. It is <strong>NOT</strong> saved to the database. Ensure the email arrives, or copy this password to give to the user.
                  </p>
                </div>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={() => setRevealModal({ isOpen: false, email: "", name: "" })}
              className="w-full bg-ink text-canvas-soft font-bold py-3 px-6 rounded-xl transition-all hover:bg-black/90 active:scale-[0.99]"
            >
              Done &amp; Close Overview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
