import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { sendOtpEmail } from '@/lib/email/otp';
import { eq } from 'drizzle-orm';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';

import { rateLimit } from '@/lib/rateLimit';
import { apiSuccess, apiRateLimited, apiServerError, apiValidationError, apiError } from '@/lib/api-response';
import { isSmtpConfigured, isProduction } from '@/lib/env';
import { otpRequestSchema } from '@kutumbkosh/shared/validators';

const OTP_EXPIRY_MINUTES = 10;

/**
 * POST /api/mobile/otp/request
 * Body: { email: string }
 *
 * Generates a 6-digit OTP, bcrypt-hashes it, stores it with a 10-minute expiry,
 * and emails it to the user.
 * Always returns success to prevent email enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Rate limit: max 5 requests per 15 minutes per IP
    const limitRes = await rateLimit(`otp-req-ip-${ip}`, 5, 15 * 60 * 1000);
    if (!limitRes.success) {
      return apiRateLimited('Too many OTP requests. Please try again in 15 minutes.');
    }

    // Block OTP flow in production if SMTP is not configured
    if (isProduction() && !isSmtpConfigured()) {
      return apiError('SMTP_NOT_CONFIGURED', 'OTP service is unavailable. Please contact support.', 503);
    }

    const body = await req.json();
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { email } = parsed.data;

    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select({ id: adminUsers.id, name: adminUsers.name, status: adminUsers.status })
      .from(adminUsers)
      .where(eq(adminUsers.email, normalizedEmail));

    if (!user || user.status !== 'approved') {
      // Return success anyway to prevent email enumeration
      return apiSuccess({ otpSent: false }, 'If the email exists, an OTP has been sent.');
    }

    // Generate 6-digit OTP
    const otp = String(randomInt(100000, 999999));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db
      .update(adminUsers)
      .set({ otpCode: otpHash, otpExpiresAt: expiresAt })
      .where(eq(adminUsers.id, user.id));

    await sendOtpEmail({ name: user.name, email: normalizedEmail }, otp);

    await db.insert(auditLog).values({
      action: 'recovery_otp',
      targetId: user.id,
      note: `OTP requested for credential recovery by ${normalizedEmail}`,
    });

    return apiSuccess({ otpSent: true }, 'OTP sent to your email if registered.');
  } catch (err: unknown) {
    return apiServerError(err);
  }
}
