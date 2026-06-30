import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { sendRecoveryConfirmationEmail } from '@/lib/email/welcome';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { rateLimit } from '@/lib/rateLimit';
import { apiSuccess, apiError, apiRateLimited, apiServerError, apiValidationError, apiNotFound } from '@/lib/api-response';
import { otpVerifySchema } from '@kutumbkosh/shared/validators';

/**
 * POST /api/mobile/otp/verify
 * Body: { email: string; otp: string }
 *
 * Verifies the 6-digit OTP (with expiry check), then:
 * 1. Sends a recovery confirmation email notifying the user that their identity is verified,
 *    and directing them to check their existing device or setup sheet (zero-knowledge policy).
 * 2. Clears the OTP from the DB
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    const body = await req.json();
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { email, otp } = parsed.data;

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 5 requests per 15 minutes per IP & Email
    const ipLimit = await rateLimit(`otp-ver-ip-${ip}`, 5, 15 * 60 * 1000);
    const emailLimit = await rateLimit(`otp-ver-email-${normalizedEmail}`, 5, 15 * 60 * 1000);

    if (!ipLimit.success || !emailLimit.success) {
      return apiRateLimited('Too many OTP verification attempts. Please try again in 15 minutes.');
    }

    const [user] = await db
      .select({
        id: adminUsers.id,
        name: adminUsers.name,
        status: adminUsers.status,
        otpCode: adminUsers.otpCode,
        otpExpiresAt: adminUsers.otpExpiresAt,
        encryptedDbUrl: adminUsers.encryptedDbUrl,
      })
      .from(adminUsers)
      .where(eq(adminUsers.email, normalizedEmail));

    if (!user || user.status !== 'approved') {
      return apiError('ACCOUNT_NOT_FOUND', 'No approved account found for this email.', 404);
    }

    if (!user.otpCode || !user.otpExpiresAt) {
      return apiError('NO_OTP_REQUESTED', 'No OTP was requested. Please request a new code.', 400);
    }

    // Check expiry
    if (new Date() > new Date(user.otpExpiresAt)) {
      await db
        .update(adminUsers)
        .set({ otpCode: null, otpExpiresAt: null })
        .where(eq(adminUsers.id, user.id));
      return apiError('OTP_EXPIRED', 'OTP has expired. Please request a new code.', 400);
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp.trim(), user.otpCode);
    if (!isValid) {
      return apiError('INVALID_OTP', 'Invalid OTP. Please check and try again.', 400);
    }

    // Zero-knowledge recovery: we send a notification that verification was successful.
    await sendRecoveryConfirmationEmail({ name: user.name, email: normalizedEmail });

    // Clear OTP after successful use
    await db
      .update(adminUsers)
      .set({ otpCode: null, otpExpiresAt: null })
      .where(eq(adminUsers.id, user.id));

    await db.insert(auditLog).values({
      action: 'recovery_otp',
      targetId: user.id,
      note: `Successful OTP verification and recovery email sent to ${normalizedEmail}`,
    });

    return apiSuccess({ verified: true }, 'Identity verified. Recovery email sent if configured.');
  } catch (err: unknown) {
    return apiServerError(err);
  }
}
