import nodemailer from 'nodemailer';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';

const log = createLogger('email:otp');

/**
 * Sends a 6-digit OTP email for credential recovery.
 */
export async function sendOtpEmail(user: { name: string; email: string }, otp: string): Promise<void> {
  const env = getEnv();
  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;
  const smtpHost = env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(env.SMTP_PORT || '465', 10);
  const smtpSecure = env.SMTP_SECURE !== 'false';

  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937; background-color: #f9fafb;">
  <div style="background: #0e0f0c; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #9fe870; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">KutumbKosh</h1>
    <p style="color: #e8ebe6; margin: 6px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Credential Recovery</p>
  </div>

  <p>Hello <strong>${user.name}</strong>,</p>
  <p>You requested to recover your KutumbKosh credentials. Use the one-time code below in the app to proceed:</p>

  <div style="background: #ffffff; border: 2px solid #9fe870; border-radius: 12px; padding: 32px; margin: 24px 0; text-align: center;">
    <p style="margin: 0 0 8px; color: #868685; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Your Verification Code</p>
    <p style="font-family: monospace; font-size: 48px; font-weight: 900; color: #0e0f0c; margin: 0; letter-spacing: 12px;">${otp}</p>
    <p style="color: #868685; font-size: 12px; margin: 16px 0 0;">This code expires in <strong>10 minutes</strong>.</p>
  </div>

  <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #92400e;">
    <p style="margin: 0; font-weight: bold;">⚠️ Security Notice</p>
    <p style="margin: 8px 0 0;">If you did not request this code, please ignore this email. Your account has not been compromised.</p>
  </div>

  <p style="color: #868685; font-size: 11px; border-top: 1px solid #e8ebe6; padding-top: 16px; margin-top: 24px;">
    KutumbKosh — End-to-end encrypted family financial vault.
  </p>
</body>
</html>
  `;

  if (!smtpUser || !smtpPass) {
    log.warn('SMTP not configured — OTP email will not be sent', {
      email: user.email,
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"KutumbKosh Treasury" <${smtpUser}>`,
    to: user.email,
    subject: 'KutumbKosh — Your Credential Recovery Code',
    html: htmlContent,
  });
}
