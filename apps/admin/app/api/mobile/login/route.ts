import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { serverDecrypt, stringToBlob } from '@/lib/crypto';
import { signToken } from '@/lib/jwt';
import { rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/mobile/login
 * Body: { email: string; masterPassword?: string }
 *
 * Verifies the master password against the server-decrypted stored credential,
 * issues a JWT session token for future admin API authentications, and
 * returns the encrypted_db_url blob.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Apply IP-based rate limiting (5 requests per 15 minutes)
    const limitRes = rateLimit(`login-ip-${ip}`, 5, 15 * 60 * 1000);
    if (!limitRes.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const { email, masterPassword } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!masterPassword || typeof masterPassword !== 'string') {
      return NextResponse.json({ error: 'Master password is required.' }, { status: 400 });
    }

    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        status: adminUsers.status,
        encryptedDbUrl: adminUsers.encryptedDbUrl,
        encryptedMasterPassword: adminUsers.encryptedMasterPassword,
        name: adminUsers.name,
      })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));

    if (!user) {
      // Generic error to prevent email harvesting
      return NextResponse.json({ error: 'Invalid email or master password.' }, { status: 401 });
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { error: 'Your account has been suspended by the administrator.' },
        { status: 403 }
      );
    }

    if (user.status !== 'approved') {
      return NextResponse.json(
        { error: 'Your account is not approved. Please contact the administrator.' },
        { status: 403 }
      );
    }

    // Verify master password
    if (!user.encryptedMasterPassword) {
      return NextResponse.json(
        { error: 'Credentials not initialized. Please request admin to resend credentials.' },
        { status: 400 }
      );
    }

    let decryptedMaster = '';
    try {
      decryptedMaster = serverDecrypt(stringToBlob(user.encryptedMasterPassword));
    } catch (e) {
      console.error('Failed to decrypt master password:', e);
      return NextResponse.json({ error: 'Internal server encryption error.' }, { status: 500 });
    }

    if (decryptedMaster !== masterPassword.trim()) {
      return NextResponse.json({ error: 'Invalid email or master password.' }, { status: 401 });
    }

    // Update lastSeen
    await db
      .update(adminUsers)
      .set({ lastSeen: new Date() })
      .where(eq(adminUsers.id, user.id));

    // Sign JWT session token for subsequent sync/upload calls
    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json({
      success: true,
      name: user.name,
      // null if user hasn't uploaded their DB URL yet (first-time setup)
      encryptedDbUrl: user.encryptedDbUrl ?? null,
      token,
    });
  } catch (err: any) {
    console.error('[/api/mobile/login]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
