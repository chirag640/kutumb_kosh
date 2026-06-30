import React from "react";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Calendar, Shield, Activity, Clock } from "lucide-react";
import { createLogger } from "@/lib/logger";

const log = createLogger("audit-logs");

export const revalidate = 0; // Ensure fresh logs on load

function getActionBadgeStyle(action: string) {
  switch (action) {
    case "approve":
      return "bg-primary-pale text-positive-deep border border-positive/10";
    case "reject":
    case "suspend":
      return "bg-negative-bg text-negative/90 border border-negative/20";
    case "unsuspend":
      return "bg-primary-pale text-ink border border-primary-neutral";
    case "resend_email":
      return "bg-canvas-soft text-body border border-black/5";
    case "recovery_otp":
      return "bg-warning/10 text-warning-content border border-warning/20";
    default:
      return "bg-canvas-soft text-mute border border-black/5";
  }
}

export default async function AuditLogsPage() {
  let logs: Array<{ id: string; action: string; targetId: string | null; note: string | null; createdAt: Date | null }> = [];
  try {
    logs = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt));
  } catch (error: unknown) {
    log.error("Failed to query audit logs from Database", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-ink">System Audit Trail</h1>
        <p className="text-sm text-body">
          Track security operations, credentials recovery, and administrator decisions for KutumbKosh.
        </p>
      </div>

      <div className="bg-canvas rounded-xl border border-black/[0.05] shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center text-mute space-y-2">
            <Activity size={40} className="mx-auto text-mute/50" />
            <p className="font-bold text-sm">No log entries found</p>
            <p className="text-xs">System operations will display here once actions occur.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-canvas-soft border-b border-black/[0.05] text-xs font-bold text-mute uppercase tracking-wider">
                  <th className="py-4 px-6">Timestamp</th>
                  <th className="py-4 px-6">Operation</th>
                  <th className="py-4 px-6">Target Record</th>
                  <th className="py-4 px-6">Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] text-sm text-ink">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-canvas-soft/30 transition-colors">
                    {/* Timestamp */}
                    <td className="py-4 px-6 font-medium text-body whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock size={13} className="text-mute" />
                        {log.createdAt ? (
                          <>
                            <span>{new Date(log.createdAt).toLocaleDateString("en-IN")}</span>
                            <span className="text-mute font-normal">
                              {new Date(log.createdAt).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit"
                              })}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </td>

                    {/* Action badge */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className={`inline-flex font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full ${getActionBadgeStyle(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Target Record UUID */}
                    <td className="py-4 px-6 font-mono text-xs text-mute whitespace-nowrap">
                      {log.targetId || "SYSTEM"}
                    </td>

                    {/* Details Note */}
                    <td className="py-4 px-6 text-body max-w-md font-medium">
                      {log.note || "No comments entered."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
