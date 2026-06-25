'use server';
 
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { generateMasterPassword, sendWelcomeEmail } from '@/lib/email/welcome';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
 
export async function approveUser(userId: string) {
  try {
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
    } catch (emailErr: any) {
      console.error('[approveUser] Email failed but user is approved:', emailErr.message);
      // Return success with a warning so the admin can manually share the password
      return {
        success: true,
        masterPassword,
        emailId: user.email,
        emailWarning: `User approved, but email delivery failed: ${emailErr.message}`,
      };
    }

    return { success: true, masterPassword, emailId: user.email };
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
      note: `Rejected user`,
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

export async function resendCredentials(userId: string) {
  try {
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
    } catch (emailErr: any) {
      console.error('[resendCredentials] Email failed but credentials were rotated:', emailErr.message);
      return {
        success: true,
        masterPassword,
        emailWarning: `Credentials rotated, but email delivery failed: ${emailErr.message}`,
      };
    }

    return { success: true, masterPassword };
  } catch (error: any) {
    console.error('resendCredentials action failed:', error);
    return { error: error.message || 'Failed to resend credentials.' };
  }
}

export async function toggleUserSuspension(userId: string) {
  try {
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
  } catch (error: any) {
    console.error('toggleUserSuspension action failed:', error);
    return { error: error.message || 'Failed to change suspension state.' };
  }
}
