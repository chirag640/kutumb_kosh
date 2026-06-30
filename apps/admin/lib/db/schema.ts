import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

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
  // Salted Bcrypt Hash of master password (for sync session authorization only, cannot be reversed/decrypted)
  masterPasswordHash: text('master_password_hash'),
  // Encrypted DB URL — AES-256 with user's master-password-derived key (server cannot decrypt)
  encryptedDbUrl: text('encrypted_db_url'),
  // OTP for credential recovery — bcrypt-hashed, expires after 10 minutes
  otpCode:      text('otp_code'),
  otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
}, (table) => ({
  // Index for status-based queries (pending approval list, dashboard counts)
  statusIdx: index('idx_admin_users_status').on(table.status),
  // Index for join date ordering (user list)
  joinedAtIdx: index('idx_admin_users_joined_at').on(table.joinedAt),
}));

export const rateLimits = pgTable('rate_limits', {
  id:        uuid('id').defaultRandom().primaryKey(),
  key:       text('key').notNull(),
  count:     integer('count').notNull().default(1),
  limitVal:  integer('limit_val').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ({
  keyIdx: index('idx_rate_limits_key').on(table.key),
  expiresIdx: index('idx_rate_limits_expires').on(table.expiresAt),
}));

export const auditLog = pgTable('audit_log', {
  id:        uuid('id').defaultRandom().primaryKey(),
  action:    text('action').notNull(),   // 'approve' | 'reject' | 'suspend' | 'resend_email' | 'recovery_otp'
  targetId:  uuid('target_id'),
  note:      text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Index for chronological ordering (audit trail page)
  createdAtIdx: index('idx_audit_log_created_at').on(table.createdAt),
}));
