import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { sendRecoveryConfirmationEmail } from '@/lib/email/welcome';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { rateLimit } from '@/lib/rateLimit';

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

    const { email, otp } = await req.json();

    if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
      return NextResponse.json({ error: 'Email and OTP are required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 5 requests per 15 minutes per IP & Email
    const ipLimit = rateLimit(`otp-ver-ip-${ip}`, 5, 15 * 60 * 1000);
    const emailLimit = rateLimit(`otp-ver-email-${normalizedEmail}`, 5, 15 * 60 * 1000);

    if (!ipLimit.success || !emailLimit.success) {
      return NextResponse.json(
        { error: 'Too many OTP verification attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
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
      return NextResponse.json({ error: 'No approved account found for this email.' }, { status: 404 });
    }

    if (!user.otpCode || !user.otpExpiresAt) {
      return NextResponse.json({ error: 'No OTP was requested. Please request a new code.' }, { status: 400 });
    }

    // Check expiry
    if (new Date() > new Date(user.otpExpiresAt)) {
      await db
        .update(adminUsers)
        .set({ otpCode: null, otpExpiresAt: null })
        .where(eq(adminUsers.id, user.id));
      return NextResponse.json({ error: 'OTP has expired. Please request a new code.' }, { status: 400 });
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp.trim(), user.otpCode);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid OTP. Please check and try again.' }, { status: 400 });
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

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/mobile/otp/verify]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
