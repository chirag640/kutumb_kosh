import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers, auditLog } from '@/lib/db/schema';
import { serverDecrypt, stringToBlob } from '@/lib/crypto';
import { sendRecoveryEmail } from '@/lib/email/welcome';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/mobile/otp/verify
 * Body: { email: string; otp: string }
 *
 * Verifies the 6-digit OTP (with expiry check), then:
 * 1. Decrypts the master password using the server CREDENTIAL_SECRET
 * 2. Decodes the encryptedDbUrl (sends as-is to email — user reads it manually,
 *    or we send the blob string so they can paste it; the server cannot decrypt it)
 * 3. Sends a recovery email with the master password + DB URL hint
 * 4. Clears the OTP from the DB
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
        encryptedMasterPassword: adminUsers.encryptedMasterPassword,
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

    // Decrypt master password
    let masterPassword: string | null = null;
    if (user.encryptedMasterPassword) {
      try {
        masterPassword = serverDecrypt(stringToBlob(user.encryptedMasterPassword));
      } catch (e) {
        console.error('Failed to decrypt master password:', e);
      }
    }

    if (!masterPassword) {
      return NextResponse.json(
        { error: 'Credential recovery failed — encrypted data corrupted or missing. Contact administrator.' },
        { status: 500 }
      );
    }

    // The DB URL is client-encrypted — server cannot decrypt it.
    // We send the raw encrypted blob in the email so the user can see it, but it's not useful without their key.
    // Instead, we inform them the master password is what they need, and they can re-enter the DB URL.
    // Note: encryptedDbUrl is opaque to the server, so we don't include it in recovery email.
    await sendRecoveryEmail(
      { name: user.name, email: normalizedEmail },
      masterPassword,
      null // Server cannot decrypt the DB URL — user must re-enter it
    );

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
