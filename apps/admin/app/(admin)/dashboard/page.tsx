import React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { adminUsers, auditLog } from "@/lib/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { Users, UserCheck, UserX, Clock, Database, Terminal, ArrowRight } from "lucide-react";

export const revalidate = 0; // Disable caching for dashboard

export default async function DashboardPage() {
  // Fetch stats from DB
  let stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
  let audits: any[] = [];
  let errorMsg = "";

  try {
    const [totalRes] = await db.select({ val: count() }).from(adminUsers);
    const [pendingRes] = await db.select({ val: count() }).from(adminUsers).where(eq(adminUsers.status, "pending"));
    const [approvedRes] = await db.select({ val: count() }).from(adminUsers).where(eq(adminUsers.status, "approved"));
    const [rejectedRes] = await db.select({ val: count() }).from(adminUsers).where(eq(adminUsers.status, "rejected"));

    stats = {
      total: totalRes?.val || 0,
      pending: pendingRes?.val || 0,
      approved: approvedRes?.val || 0,
      rejected: rejectedRes?.val || 0,
    };

    audits = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(8);
  } catch (error: any) {
    console.error("Dashboard stats query error:", error);
    errorMsg = "Database tables are not initialized or configured correctly. Please run migrations/db push.";
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-ink">System Overview</h1>
        <p className="text-sm text-body">
          Real-time user onboarding progress, system actions, and metadata tracking.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-warning-deep/10 text-warning-content border border-warning/20 p-4 rounded-xl flex items-start gap-3">
          <Terminal className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Warning: Setup Action Required</p>
            <p className="text-xs mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-canvas p-6 rounded-xl border border-black/[0.05] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">Total Requests</span>
            <span className="block text-3xl font-black tracking-tight">{stats.total}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-canvas-soft flex items-center justify-center text-ink">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-canvas p-6 rounded-xl border border-black/[0.05] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">Pending Approval</span>
            <span className="block text-3xl font-black tracking-tight text-warning-deep">{stats.pending}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary-pale flex items-center justify-center text-warning-deep">
            <Clock size={22} />
          </div>
        </div>

        <div className="bg-canvas p-6 rounded-xl border border-black/[0.05] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">Approved Active</span>
            <span className="block text-3xl font-black tracking-tight text-positive">{stats.approved}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary-pale flex items-center justify-center text-positive">
            <UserCheck size={22} />
          </div>
        </div>

        <div className="bg-canvas p-6 rounded-xl border border-black/[0.05] shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-mute uppercase tracking-wider">Rejected Requests</span>
            <span className="block text-3xl font-black tracking-tight text-negative-darkest">{stats.rejected}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-negative-bg/5 flex items-center justify-center text-negative-darkest">
            <UserX size={22} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* User request CTA panel */}
        <div className="lg:col-span-7 bg-canvas rounded-xl border border-black/[0.05] p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-black/[0.05] pb-4">
            <h3 className="font-extrabold text-lg text-ink tracking-tight">Onboarding Queue</h3>
            <Link 
              href="/users" 
              className="text-xs font-bold text-ink hover:underline flex items-center gap-1 bg-primary px-3 py-1.5 rounded-full"
            >
              <span>Manage Requests</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-canvas-soft rounded-lg space-y-2">
              <h4 className="font-bold text-sm">Approving a User</h4>
              <p className="text-xs text-body leading-relaxed">
                When you approve a user registration, KutumbKosh automatically runs a secure welcome email trigger via Resend. The welcome email contains a newly derived master password.
              </p>
            </div>

            <div className="p-4 bg-canvas-soft rounded-lg space-y-2">
              <h4 className="font-bold text-sm">Master Password Isolation</h4>
              <p className="text-xs text-body leading-relaxed">
                The master password is generated once on the server and emailed directly. It is <strong>never</strong> saved to the database. The admin knows only registration metadata.
              </p>
            </div>
          </div>
        </div>

        {/* Audit Log list */}
        <div className="lg:col-span-5 bg-canvas rounded-xl border border-black/[0.05] p-6 shadow-sm space-y-4">
          <div className="border-b border-black/[0.05] pb-4">
            <h3 className="font-extrabold text-lg text-ink tracking-tight flex items-center gap-2">
              <Database size={18} className="text-primary-active fill-ink" />
              <span>Audit Trail Logs</span>
            </h3>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {audits.length === 0 ? (
              <p className="text-xs text-mute italic text-center py-8">
                No recent administrative actions logged.
              </p>
            ) : (
              audits.map((log) => (
                <div key={log.id} className="p-3 bg-canvas-soft rounded-lg flex flex-col gap-1 border border-black/[0.03]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-ink px-2 py-0.5 rounded bg-primary-pale">
                      {log.action}
                    </span>
                    <span className="text-[9px] text-mute font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-ink">{log.note || "Administrative action executed"}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
