import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['pending', 'approved', 'suspended', 'rejected']);

export const adminUsers = pgTable('admin_users', {
  id:           uuid('id').defaultRandom().primaryKey(),
  email:        text('email').unique().notNull(),
  name:         text('name').notNull(),
  familyName:   text('family_name'),
  memberCount:  integer('member_count').default(5),
  status:       userStatusEnum('status').default('pending'),
  approvedAt:   timestamp('approved_at', { withTimezone: true }),
  joinedAt:     timestamp('joined_at', { withTimezone: true }).defaultNow(),
  lastSeen:     timestamp('last_seen', { withTimezone: true }),
  appVersion:   text('app_version'),
  // Encrypted master password — AES-256 with server CREDENTIAL_SECRET (for recovery only)
  encryptedMasterPassword: text('encrypted_master_password'),
  // Encrypted DB URL — AES-256 with user's master-password-derived key (server cannot decrypt)
  encryptedDbUrl: text('encrypted_db_url'),
  // OTP for credential recovery — bcrypt-hashed, expires after 10 minutes
  otpCode:      text('otp_code'),
  otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
});

export const auditLog = pgTable('audit_log', {
  id:        uuid('id').defaultRandom().primaryKey(),
  action:    text('action').notNull(),   // 'approve' | 'reject' | 'suspend' | 'resend_email' | 'recovery_otp'
  targetId:  uuid('target_id'),
  note:      text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
