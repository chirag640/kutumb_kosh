import nodemailer from 'nodemailer';
import { isSmtpConfigured as checkSmtp, getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';

const log = createLogger('email:welcome');

export function generateMasterPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  return 'KK-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createTransporter() {
  const env = getEnv();
  return nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '465', 10),
    secure: env.SMTP_SECURE !== 'false',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

/** Re-export the canonical isSmtpConfigured from env validation. */
export function isSmtpConfigured(): boolean {
  return checkSmtp();
}

export async function sendWelcomeEmail(
  user: { name: string; email: string; familyName?: string },
  masterPassword: string
): Promise<{ masterPassword: string; emailId: string }> {
  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937; background-color: #f9fafb;">
  <div style="background: #0e0f0c; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #9fe870; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">KutumbKosh</h1>
    <p style="color: #e8ebe6; margin: 6px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Family Treasury</p>
  </div>

  <p>Hello <strong>${user.name}</strong>,</p>
  <p>Your KutumbKosh registration request has been approved${user.familyName ? ` for the <strong>${user.familyName}</strong> family` : ''}. Below are your secure access credentials:</p>

  <div style="background: #ffffff; border: 1px solid #e8ebe6; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <p style="margin: 0 0 8px; color: #868685; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Your Master Password</p>
    <p style="font-family: monospace; font-size: 24px; font-weight: 900; color: #0e0f0c; margin: 0; letter-spacing: 2px; background: #e8ebe6; padding: 12px; border-radius: 6px; text-align: center;">${masterPassword}</p>
    <p style="color: #d03238; font-size: 12px; margin: 16px 0 0; font-weight: bold; line-height: 1.4;">⚠️ Save this password safely. If you ever forget it, use "Forgot credentials?" in the app to recover it via email OTP verification.</p>
  </div>

  <h3 style="color: #0e0f0c; border-bottom: 2px solid #e8ebe6; padding-bottom: 8px;">Next Steps for Setup:</h3>
  <ol style="line-height: 2; padding-left: 20px; font-size: 14px;">
    <li>Open the KutumbKosh app on your mobile device.</li>
    <li>Enter your email (<strong>${user.email}</strong>) and the master password shown above.</li>
    <li>Create a free database at <a href="https://neon.tech" style="color: #2ead4b; font-weight: bold;">neon.tech</a> or <a href="https://supabase.com" style="color: #2ead4b; font-weight: bold;">supabase.com</a>.</li>
    <li>Copy the PostgreSQL Connection URL and paste it into the sync setup window.</li>
    <li>The app will automatically create your private schemas and sync your data.</li>
  </ol>

  <div style="background: #e2f6d5; border: 1px solid #c5edab; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #163300;">
    <p style="margin: 0; font-weight: bold;">🔐 Quick Guide to get your Free Neon DB URL:</p>
    <ol style="margin: 8px 0 0; padding-left: 18px; line-height: 1.6;">
      <li>Register at <a href="https://neon.tech" style="color: #054d28; font-weight: bold; text-decoration: underline;">neon.tech</a>.</li>
      <li>Create a project named <strong>KutumbKosh</strong>.</li>
      <li>Go to your dashboard, click "Connection details", and copy the connection string.</li>
      <li>Paste it in the sync settings inside your app.</li>
    </ol>
  </div>

  <p style="color: #868685; font-size: 11px; border-top: 1px solid #e8ebe6; padding-top: 16px; margin-top: 24px; line-height: 1.5;">
    KutumbKosh stores no ledger values or balance sheets. All records are encrypted on-device with AES-256 before upload.
  </p>
</body>
</html>
  `;

  if (!isSmtpConfigured()) {
    log.warn('SMTP not configured — welcome email will not be sent', {
      email: user.email,
      password: process.env.NODE_ENV !== 'production' ? masterPassword : undefined,
    });
  } else {
    try {
      const info = await createTransporter().sendMail({
        from: `"KutumbKosh Treasury" <${getEnv().SMTP_USER}>`,
        to: user.email,
        subject: 'Welcome to KutumbKosh — Your Master Access Password',
        html: htmlContent,
      });
      log.info('Welcome email sent', { email: user.email, messageId: info.messageId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      log.error('Failed to send welcome email', { email: user.email, error: message });
      throw new Error(`Email delivery failed: ${message}`);
    }
  }

  return { masterPassword, emailId: user.email };
}

/**
 * Sends a recovery identity confirmation email (zero-knowledge style).
 */
export async function sendRecoveryConfirmationEmail(
  user: { name: string; email: string }
): Promise<void> {
  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937; background-color: #f9fafb;">
  <div style="background: #0e0f0c; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #9fe870; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">KutumbKosh</h1>
    <p style="color: #e8ebe6; margin: 6px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Security Notification</p>
  </div>

  <p>Hello <strong>${user.name}</strong>,</p>
  <p>Your identity has been successfully verified via recovery OTP.</p>

  <div style="background: #ffffff; border: 1px solid #e8ebe6; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <h3 style="color: #0e0f0c; margin-top: 0;">🔐 Zero-Knowledge Security Notice</h3>
    <p style="line-height: 1.6; font-size: 14px;">
      Because KutumbKosh implements a <strong>zero-knowledge architecture</strong>, your master password and private database credentials are encrypted and stored only on your local device. <strong>The KutumbKosh server does not store your master password</strong> and cannot recover it for you.
    </p>
    <p style="line-height: 1.6; font-size: 14px;">
      To access your vault, please use the master password that was sent in your original <strong>Welcome Email</strong>, or refer to your physical backup sheet.
    </p>
  </div>

  <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #92400e;">
    <p style="margin: 0; font-weight: bold;">💡 Still have access to a logged-in device?</p>
    <p style="margin: 8px 0 0; line-height: 1.5;">
      If you are logged into the KutumbKosh app on any device, you can reveal your current master password by navigating to <strong>Settings &gt; Security &gt; Reveal Master Password</strong> and completing the biometric or PIN challenge.
    </p>
  </div>

  <p style="color: #868685; font-size: 11px; border-top: 1px solid #e8ebe6; padding-top: 16px; margin-top: 24px;">
    KutumbKosh — End-to-end encrypted family financial vault.
  </p>
</body>
</html>
  `;

  if (!isSmtpConfigured()) {
    log.warn('SMTP not configured — recovery confirmation email will not be sent', {
      email: user.email,
    });
    return;
  }

  try {
    const env = getEnv();
    const info = await createTransporter().sendMail({
      from: `"KutumbKosh Treasury" <${env.SMTP_USER}>`,
      to: user.email,
      subject: 'KutumbKosh — Identity Verified',
      html: htmlContent,
    });
    log.info('Recovery confirmation email sent', { email: user.email, messageId: info.messageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown security email error';
    log.error('Failed to send recovery confirmation email', { email: user.email, error: message });
    throw new Error(`Security email delivery failed: ${message}`);
  }
}
