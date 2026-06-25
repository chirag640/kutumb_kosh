import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '@/lib/jwt';

/**
 * POST /api/mobile/upload-db-url
 * Body: { email: string; encryptedDbUrl: string }
 *
 * Called by the mobile app after successful onboarding.
 * The encryptedDbUrl is an opaque JSON blob encrypted with the user's
 * master-password-derived key.
 * Requires a valid Authorization: Bearer <token> JWT header.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized. Session token required.' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized. Invalid or expired session.' }, { status: 401 });
    }

    const { email, encryptedDbUrl } = await req.json();

    if (!email || !encryptedDbUrl) {
      return NextResponse.json({ error: 'Email and encryptedDbUrl are required.' }, { status: 400 });
    }

    if (decoded.email.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Forbidden. Account identity mismatch.' }, { status: 403 });
    }

    if (typeof encryptedDbUrl !== 'string' || encryptedDbUrl.length > 4096) {
      return NextResponse.json({ error: 'Invalid encryptedDbUrl format.' }, { status: 400 });
    }

    const [user] = await db
      .select({ id: adminUsers.id, status: adminUsers.status })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));

    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    if (user.status === 'suspended') {
      return NextResponse.json({ error: 'Your account has been suspended.' }, { status: 403 });
    }

    if (user.status !== 'approved') {
      return NextResponse.json({ error: 'Account not approved.' }, { status: 403 });
    }

    await db
      .update(adminUsers)
      .set({ encryptedDbUrl, lastSeen: new Date() })
      .where(eq(adminUsers.id, user.id));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/mobile/upload-db-url]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
