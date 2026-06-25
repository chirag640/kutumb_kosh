import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Users, LayoutDashboard, LogOut, ShieldAlert, ArrowLeftRight } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const adminEmail = session.user?.email || "Admin";

  return (
    <div className="min-h-screen bg-canvas-soft text-ink font-sans flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-ink text-canvas-soft flex flex-col justify-between p-6 shrink-0 md:sticky md:top-0 md:h-screen">
        <div className="space-y-8">
          {/* Brand/Logo */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-on-primary font-black text-lg">K</span>
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-canvas block leading-none">KutumbKosh</span>
              <span className="text-[9px] text-mute uppercase tracking-wider font-bold">Admin Console</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-canvas-soft hover:bg-white/10 hover:text-canvas transition-all"
            >
              <LayoutDashboard size={18} className="text-primary" />
              <span>Overview</span>
            </Link>
            <Link
              href="/users"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-canvas-soft hover:bg-white/10 hover:text-canvas transition-all"
            >
              <Users size={18} className="text-primary" />
              <span>User Approvals</span>
            </Link>
            <Link
              href="/audit-logs"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-canvas-soft hover:bg-white/10 hover:text-canvas transition-all"
            >
              <ArrowLeftRight size={18} className="text-primary" />
              <span>Audit Logs</span>
            </Link>
          </nav>
        </div>

        {/* Footer/Account Actions */}
        <div className="space-y-4 pt-6 border-t border-white/10">
          <div className="px-4 py-2 bg-white/5 rounded-lg">
            <span className="block text-[10px] text-mute uppercase font-bold tracking-wider">Signed In As</span>
            <span className="block text-xs font-semibold text-canvas truncate" title={adminEmail}>
              {adminEmail}
            </span>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-negative hover:bg-negative-bg hover:text-white transition-all text-left"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-canvas border-b border-black/[0.05] py-4 px-8 flex items-center justify-between shadow-sm">
          <h2 className="font-black text-xl tracking-tight text-ink uppercase">
            Control Center
          </h2>
          <div className="flex items-center gap-2 bg-canvas-soft text-[11px] font-bold text-ink px-3 py-1.5 rounded-full border border-black/5">
            <ShieldAlert size={14} className="text-primary-active fill-ink" />
            <span>Zero Balance Logs Held On-Premise</span>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
