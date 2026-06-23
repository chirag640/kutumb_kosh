'use server';

import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function approveUser(userId: string) {
  try {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
    if (!user) {
      return { error: 'User not found' };
    }

    // Send email FIRST (master password generated here, used once, never stored)
    const emailRes = await sendWelcomeEmail({ 
      name: user.name, 
      email: user.email, 
      familyName: user.familyName ?? undefined 
    });

    // Update status
    await db.update(adminUsers)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(adminUsers.id, userId));

    // Audit log
    await db.insert(auditLog).values({ 
      action: 'approve', 
      targetId: userId,
      note: `Approved user with email ${user.email}`
    });

    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true, masterPassword: emailRes.masterPassword, emailId: emailRes.emailId };
  } catch (error: any) {
    console.error('approveUser action failed:', error);
    return { error: error.message || 'Failed to approve user and send welcome credentials.' };
  }
}

export async function rejectUser(userId: string) {
  try {
    await db.update(adminUsers).set({ status: 'rejected' }).where(eq(adminUsers.id, userId));
    await db.insert(auditLog).values({ 
      action: 'reject', 
      targetId: userId,
      note: `Rejected user`
    });
    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('rejectUser action failed:', error);
    return { error: error.message || 'Failed to reject user.' };
  }
}

export async function registerUser(data: {
  name: string; email: string; familyName?: string; memberCount?: number;
}) {
  try {
    await db.insert(adminUsers).values({
      name: data.name,
      email: data.email,
      familyName: data.familyName,
      memberCount: data.memberCount ?? 5,
      status: 'pending',
    });
    return { success: true };
  } catch (error: any) {
    console.error('registerUser action failed:', error);
    return { error: error.message || 'Failed to record registration request.' };
  }
}
