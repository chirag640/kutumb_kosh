import React from "react";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { desc, eq, count, or, ilike, and } from "drizzle-orm";
import { UsersTable } from "./UsersTable";
import { isSmtpConfigured } from "@/lib/email/welcome";
import { createLogger } from "@/lib/logger";

const log = createLogger("users");

export const revalidate = 0; // Ensure fresh listings on load

interface PageProps {
  searchParams: {
    page?: string;
    search?: string;
    status?: string;
  };
}

export default async function UsersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams || {};
  const currentPage = Number(resolvedSearchParams.page) || 1;
  const currentSearch = resolvedSearchParams.search || "";
  const currentStatus = resolvedSearchParams.status || "all";
  const itemsPerPage = 10;
  const offset = (currentPage - 1) * itemsPerPage;

  let users: Array<{
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
  }> = [];
  let totalCount = 0;

  try {
    const whereConditions = [];

    // Filter by status if not 'all'
    if (currentStatus !== "all") {
      whereConditions.push(eq(adminUsers.status, currentStatus as any));
    }

    // Filter by search query (case-insensitive search on name, email, familyName)
    if (currentSearch) {
      const searchPattern = `%${currentSearch}%`;
      whereConditions.push(
        or(
          ilike(adminUsers.name, searchPattern),
          ilike(adminUsers.email, searchPattern),
          ilike(adminUsers.familyName, searchPattern)
        )
      );
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // 1. Get paginated users
    users = await db
      .select()
      .from(adminUsers)
      .where(whereClause)
      .orderBy(desc(adminUsers.joinedAt))
      .limit(itemsPerPage)
      .offset(offset);

    // 2. Get total count for pagination
    const [countRes] = await db
      .select({ value: count() })
      .from(adminUsers)
      .where(whereClause);
      
    totalCount = countRes?.value || 0;
  } catch (error: unknown) {
    log.error("Failed to query users from Database", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const smtpOk = isSmtpConfigured();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-ink">User Approvals</h1>
        <p className="text-sm text-body">
          Review, approve, or reject user registration requests for KutumbKosh.
        </p>
      </div>

      <UsersTable initialUsers={users} totalCount={totalCount} isSmtpConfigured={smtpOk} />
    </div>
  );
}
