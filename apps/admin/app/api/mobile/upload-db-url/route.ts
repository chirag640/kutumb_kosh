import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '@/lib/jwt';
import { apiSuccess, apiError, apiUnauthorized, apiForbidden, apiNotFound, apiServerError, apiValidationError } from '@/lib/api-response';
import { uploadDbUrlSchema } from '@kutumbkosh/shared/validators';

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
      return apiUnauthorized('Session token required.');
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return apiUnauthorized('Invalid or expired session.');
    }

    const body = await req.json();
    const parsed = uploadDbUrlSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }
    const { email, encryptedDbUrl } = parsed.data;

    if (decoded.email.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return apiForbidden('Account identity mismatch.');
    }

    const [user] = await db
      .select({ id: adminUsers.id, status: adminUsers.status })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));

    if (!user) {
      return apiNotFound('Account not found.');
    }

    if (user.status === 'suspended') {
      return apiForbidden('Your account has been suspended.');
    }

    if (user.status !== 'approved') {
      return apiForbidden('Account not approved.');
    }

    await db
      .update(adminUsers)
      .set({ encryptedDbUrl, lastSeen: new Date() })
      .where(eq(adminUsers.id, user.id));

    return apiSuccess({ updated: true }, 'DB URL uploaded successfully.');
  } catch (err: unknown) {
    return apiServerError(err);
  }
}
