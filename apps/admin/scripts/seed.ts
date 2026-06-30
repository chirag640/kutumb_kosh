/**
 * Admin seed script for KutumbKosh.
 *
 * Creates test users with various statuses for development.
 * Usage: npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL and NEXTAUTH_SECRET env vars.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { adminUsers, auditLog } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

if (!NEXTAUTH_SECRET) {
  console.error('NEXTAUTH_SECRET is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

async function generateMasterPassword(): Promise<{ plain: string; hash: string }> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  const plain = 'KK-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const hash = await bcrypt.hash(plain, 10);
  return { plain, hash };
}

const SEED_USERS = [
  {
    name: 'Rajesh Kumar',
    email: 'rajesh@example.com',
    familyName: 'Kumar Family',
    status: 'pending' as const,
    memberCount: 5,
  },
  {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    familyName: 'Sharma Family',
    status: 'approved' as const,
    memberCount: 4,
  },
  {
    name: 'Amit Patel',
    email: 'amit@example.com',
    familyName: 'Patel Family',
    status: 'rejected' as const,
    memberCount: 6,
  },
  {
    name: 'Sunita Verma',
    email: 'sunita@example.com',
    familyName: 'Verma Family',
    status: 'suspended' as const,
    memberCount: 3,
  },
  {
    name: 'Vikram Singh',
    email: 'vikram@example.com',
    familyName: 'Singh Family',
    status: 'approved' as const,
    memberCount: 7,
  },
];

async function seed() {
  console.log('🌱 Seeding database...\n');

  for (const userData of SEED_USERS) {
    // Check if user already exists
    const [existing] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, userData.email));

    if (existing) {
      console.log(`  ⏭️  User ${userData.email} already exists, skipping`);
      continue;
    }

    let masterPasswordHash: string | null = null;
    let plainPassword: string | null = null;

    if (userData.status === 'approved') {
      const { plain, hash } = await generateMasterPassword();
      masterPasswordHash = hash;
      plainPassword = plain;
    }

    const [user] = await db
      .insert(adminUsers)
      .values({
        name: userData.name,
        email: userData.email,
        familyName: userData.familyName,
        memberCount: userData.memberCount,
        status: userData.status,
        approvedAt: userData.status === 'approved' ? new Date() : null,
        joinedAt: new Date(),
        masterPasswordHash,
      })
      .returning({ id: adminUsers.id });

    // Create audit log
    await db.insert(auditLog).values({
      action: userData.status === 'approved' ? 'approve' : userData.status,
      targetId: user.id,
      note: `Seed: Created user ${userData.email} with status ${userData.status}`,
    });

    console.log(`  ✅ Created ${userData.name} (${userData.email}) — status: ${userData.status}`);
    if (plainPassword) {
      console.log(`     🔑 Master password: ${plainPassword}`);
    }
  }

  console.log('\n🎉 Seed complete!\n');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
