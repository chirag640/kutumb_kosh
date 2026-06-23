import React from "react";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { UsersTable } from "./UsersTable";

export const revalidate = 0; // Ensure fresh listings on load

export default async function UsersPage() {
  // Query users list ordered by join date (newest first)
  let users: any[] = [];
  try {
    users = await db
      .select()
      .from(adminUsers)
      .orderBy(desc(adminUsers.joinedAt));
  } catch (error) {
    console.error("Failed to query users from Database:", error);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-ink">User Approvals</h1>
        <p className="text-sm text-body">
          Review, approve, or reject user registration requests for KutumbKosh.
        </p>
      </div>

      <UsersTable initialUsers={users} />
    </div>
  );
}
