'use server';
 
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { generateMasterPassword, sendWelcomeEmail } from '@/lib/email/welcome';
import { eq, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { createLogger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const log = createLogger('users:actions');

async function assertAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required');
  }

  // Cross-Site Request Forgery (CSRF) protection
  const headersList = headers();
  const origin = headersList.get('origin');
  const host = headersList.get('host');
  const referer = headersList.get('referer');

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        throw new Error('CSRF Warning: Origin mismatch');
      }
    } catch {
      throw new Error('CSRF Warning: Invalid origin header');
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        throw new Error('CSRF Warning: Referer mismatch');
      }
    } catch {
      throw new Error('CSRF Warning: Invalid referer header');
    }
  }
}
 
export async function approveUser(userId: string) {
  try {
    await assertAdmin();
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
    if (!user) {
      return { error: 'User not found' };
    }
 
    // Generate master password and hash it
    const masterPassword = generateMasterPassword();
    const masterPasswordHash = await bcrypt.hash(masterPassword, 10);
 
    // 1. Persist to DB first — so credentials are safe even if email fails
    await db.update(adminUsers)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        masterPasswordHash,
      })
      .where(eq(adminUsers.id, userId));
 
    // 2. Audit log
    await db.insert(auditLog).values({
      action: 'approve',
      targetId: userId,
      note: `Approved user ${user.email}. Master password hash stored.`,
    });

    revalidatePath('/users');
    revalidatePath('/dashboard');

    // 3. Send welcome email — non-fatal: credentials are already saved in DB
    try {
      await sendWelcomeEmail(
        { name: user.name, email: user.email, familyName: user.familyName ?? undefined },
        masterPassword
      );
    } catch (emailErr: unknown) {
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown email error';
      log.error('[approveUser] Email failed but user is approved', { error: message });
      // Return success with a warning so the admin can manually share the password
      return {
        success: true,
        masterPassword,
        emailId: user.email,
        emailWarning: `User approved, but email delivery failed: ${message}`,
      };
    }

    return { success: true, masterPassword, emailId: user.email };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('approveUser action failed', { error: message });
    return { error: message };
  }
}

export async function rejectUser(userId: string) {
  try {
    await assertAdmin();
    await db.update(adminUsers).set({ status: 'rejected' }).where(eq(adminUsers.id, userId));
    await db.insert(auditLog).values({
      action: 'reject',
      targetId: userId,
      note: `Rejected user`,
    });
    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('rejectUser action failed', { error: message });
    return { error: message };
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('registerUser action failed', { error: message });
    return { error: message };
  }
}

export async function resendCredentials(userId: string) {
  try {
    await assertAdmin();
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
    if (!user) {
      return { error: 'User not found' };
    }
    if (user.status !== 'approved' && user.status !== 'suspended') {
      return { error: 'Credentials can only be resent for approved or suspended users.' };
    }

    // Generate a fresh master password and hash it
    const masterPassword = generateMasterPassword();
    const masterPasswordHash = await bcrypt.hash(masterPassword, 10);
 
    // 1. Update DB first — rotate the hash and clear stored DB URL
    await db.update(adminUsers)
      .set({
        masterPasswordHash,
        encryptedDbUrl: null,
        otpCode: null,
        otpExpiresAt: null,
      })
      .where(eq(adminUsers.id, userId));
 
    // 2. Audit log
    await db.insert(auditLog).values({
      action: 'resend_email',
      targetId: userId,
      note: `Regenerated master password and resent welcome email to ${user.email}. Encrypted DB URL cleared as security measure.`,
    });

    revalidatePath('/users');
    revalidatePath('/dashboard');

    // 3. Send email — non-fatal: credentials are already rotated in DB
    try {
      await sendWelcomeEmail(
        { name: user.name, email: user.email, familyName: user.familyName ?? undefined },
        masterPassword
      );
    } catch (emailErr: unknown) {
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown email error';
      log.error('[resendCredentials] Email failed but credentials were rotated', { error: message });
      return {
        success: true,
        masterPassword,
        emailWarning: `Credentials rotated, but email delivery failed: ${message}`,
      };
    }

    return { success: true, masterPassword };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('resendCredentials action failed', { error: message });
    return { error: message };
  }
}

export async function toggleUserSuspension(userId: string) {
  try {
    await assertAdmin();
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
    if (!user) {
      return { error: 'User not found' };
    }

    const newStatus = user.status === 'suspended' ? 'approved' : 'suspended';

    await db.update(adminUsers)
      .set({ status: newStatus })
      .where(eq(adminUsers.id, userId));

    await db.insert(auditLog).values({
      action: newStatus === 'suspended' ? 'suspend' : 'unsuspend',
      targetId: userId,
      note: `${newStatus === 'suspended' ? 'Suspended' : 'Unsuspended'} user account for ${user.email}.`,
    });

    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true, status: newStatus };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('toggleUserSuspension action failed', { error: message });
    return { error: message };
  }
}

export async function getUserAuditLogs(userId: string) {
  try {
    await assertAdmin();
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, userId))
      .orderBy(desc(auditLog.createdAt));
    return { success: true, logs };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('getUserAuditLogs failed', { error: message });
    return { error: message };
  }
}

export async function bulkApproveUsers(userIds: string[]) {
  try {
    await assertAdmin();
    if (userIds.length === 0) return { success: true, results: [] };
    const approvedResults = [];

    for (const userId of userIds) {
      const res = await approveUser(userId);
      if (res.success) {
        approvedResults.push({
          userId,
          email: res.emailId,
          masterPassword: res.masterPassword,
          warning: res.emailWarning
        });
      }
    }

    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true, results: approvedResults };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('bulkApproveUsers failed', { error: message });
    return { error: message };
  }
}

export async function bulkSuspendUsers(userIds: string[]) {
  try {
    await assertAdmin();
    if (userIds.length === 0) return { success: true };

    const usersToSuspend = await db
      .select()
      .from(adminUsers)
      .where(inArray(adminUsers.id, userIds));

    await db.update(adminUsers)
      .set({ status: 'suspended' })
      .where(inArray(adminUsers.id, userIds));

    for (const u of usersToSuspend) {
      await db.insert(auditLog).values({
        action: 'suspend',
        targetId: u.id,
        note: `Bulk suspended user account for ${u.email}.`,
      });
    }

    revalidatePath('/users');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('bulkSuspendUsers failed', { error: message });
    return { error: message };
  }
}
