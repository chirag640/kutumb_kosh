/**
 * Environment variable validation for KutumbKosh admin server.
 *
 * Validates all required env vars at startup using Zod.
 * Import this file early in the app lifecycle to catch misconfiguration.
 */

import { z } from "zod";

const envSchema = z.object({
  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection string")
    .refine(
      (url) => url.startsWith("postgres://") || url.startsWith("postgresql://"),
      "DATABASE_URL must start with postgres:// or postgresql://"
    ),

  // ── Auth ──────────────────────────────────────────────────────────────────
  NEXTAUTH_SECRET: z
    .string()
    .min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  ADMIN_EMAIL: z
    .string()
    .email("ADMIN_EMAIL must be a valid email address"),
  ADMIN_PASSWORD: z
    .string()
    .min(8, "ADMIN_PASSWORD must be at least 8 characters"),

  // ── SMTP (optional but validated when present) ────────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().optional(),

  // ── Node ──────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validates and returns the environment variables.
 * Throws a clear error if any required variable is missing or invalid.
 * Caches the result so validation only runs once.
 */
export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .flatMap(([key, value]) => {
        const errs = (value as { _errors?: string[] })?._errors ?? [];
        return errs.map((e) => `  ${key}: ${e}`);
      });

    console.error("\n╔══════════════════════════════════════════════════╗");
    console.error("║  ❌  ENVIRONMENT VALIDATION FAILED               ║");
    console.error("╠══════════════════════════════════════════════════╣");
    errors.forEach((e) => console.error(`║  ${e.padEnd(48)}║`));
    console.error("╚══════════════════════════════════════════════════╝\n");

    throw new Error(
      `Environment validation failed:\n${errors.join("\n")}`
    );
  }

  _env = result.data;
  return _env;
}

/**
 * Check if SMTP is properly configured.
 * Returns true only when both SMTP_USER and SMTP_PASS are set.
 */
export function isSmtpConfigured(): boolean {
  const env = getEnv();
  return !!(env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Returns true when running in production.
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
