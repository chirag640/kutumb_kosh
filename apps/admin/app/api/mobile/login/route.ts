import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signToken } from '@/lib/jwt';
import { rateLimit } from '@/lib/rateLimit';
import bcrypt from 'bcryptjs';
import { apiSuccess, apiError, apiRateLimited, apiServerError, apiValidationError } from '@/lib/api-response';
import { loginRequestSchema } from '@kutumbkosh/shared/validators';
 
/**
 * POST /api/mobile/login
 * Body: { email: string; masterPassword: string }
 *
 * Verifies the master password against the server-stored bcrypt hash,
 * issues a JWT session token for future admin API authentications, and
 * returns the encrypted_db_url blob.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Apply IP-based rate limiting (5 requests per 15 minutes)
    const limitRes = await rateLimit(`login-ip-${ip}`, 5, 15 * 60 * 1000);
    if (!limitRes.success) {
      return apiRateLimited('Too many login attempts. Please try again in 15 minutes.');
    }
 
    const body = await req.json();
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { email, masterPassword } = parsed.data;
 
    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        status: adminUsers.status,
        encryptedDbUrl: adminUsers.encryptedDbUrl,
        masterPasswordHash: adminUsers.masterPasswordHash,
        name: adminUsers.name,
      })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));
 
    if (!user) {
      // Generic error to prevent email harvesting
      return apiError('AUTH_FAILED', 'Invalid email or master password.', 401);
    }
 
    if (user.status === 'suspended') {
      return apiError('ACCOUNT_SUSPENDED', 'Your account has been suspended by the administrator.', 403);
    }
 
    if (user.status !== 'approved') {
      return apiError('ACCOUNT_NOT_APPROVED', 'Your account is not approved. Please contact the administrator.', 403);
    }
 
    // Verify master password hash
    if (!user.masterPasswordHash) {
      return apiError('CREDENTIALS_NOT_INITIALIZED', 'Credentials not initialized. Please request admin to resend credentials.', 400);
    }
 
    const isPasswordValid = await bcrypt.compare(masterPassword.trim(), user.masterPasswordHash);
    if (!isPasswordValid) {
      return apiError('AUTH_FAILED', 'Invalid email or master password.', 401);
    }

    // Update lastSeen
    await db
      .update(adminUsers)
      .set({ lastSeen: new Date() })
      .where(eq(adminUsers.id, user.id));

    // Sign JWT session token for subsequent sync/upload calls
    const token = signToken({ userId: user.id, email: user.email });

    return apiSuccess({
      name: user.name,
      encryptedDbUrl: user.encryptedDbUrl ?? null,
      token,
    });
  } catch (err: unknown) {
    return apiServerError(err);
  }
}
