import nodemailer from 'nodemailer';

export function generateMasterPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  return 'KK-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
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
    console.warn('================================================================');
    console.warn('⚠️  SMTP not configured — SMTP_USER or SMTP_PASS is missing in .env');
    console.warn(`   User:     ${user.email}`);
    console.warn(`   Password: ${masterPassword}`);
    console.warn('================================================================');
  } else {
    try {
      const info = await createTransporter().sendMail({
        from: `"KutumbKosh Treasury" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Welcome to KutumbKosh — Your Master Access Password',
        html: htmlContent,
      });
      console.log(`[email] Welcome email sent to ${user.email} — MessageID: ${info.messageId}`);
    } catch (err: any) {
      console.error(`[email] FAILED to send welcome email to ${user.email}:`, err.message);
      throw new Error(`Email delivery failed: ${err.message}`);
    }
  }

  return { masterPassword, emailId: user.email };
}

/**
 * Sends recovered credentials after OTP verification.
 * The dbUrl may be null if the user never uploaded it from their device.
 */
export async function sendRecoveryEmail(
  user: { name: string; email: string },
  masterPassword: string,
  dbUrl: string | null
): Promise<void> {
  const dbSection = dbUrl
    ? `<p style="margin: 0 0 8px; color: #868685; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Database Connection URL</p>
       <p style="font-family: monospace; font-size: 12px; font-weight: 600; color: #0e0f0c; margin: 0; background: #e8ebe6; padding: 12px; border-radius: 6px; word-break: break-all;">${dbUrl}</p>`
    : `<p style="color: #868685; font-size: 12px; margin: 0;"><em>Your database URL could not be recovered — it may not have been uploaded yet from your device. You will need to re-enter it during setup.</em></p>`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937; background-color: #f9fafb;">
  <div style="background: #0e0f0c; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #9fe870; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">KutumbKosh</h1>
    <p style="color: #e8ebe6; margin: 6px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Credential Recovery</p>
  </div>

  <p>Hello <strong>${user.name}</strong>,</p>
  <p>Your identity has been verified via OTP. Here are your recovered KutumbKosh credentials:</p>

  <div style="background: #ffffff; border: 1px solid #e8ebe6; border-radius: 12px; padding: 24px; margin: 24px 0;">
    <p style="margin: 0 0 8px; color: #868685; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Master Password</p>
    <p style="font-family: monospace; font-size: 22px; font-weight: 900; color: #0e0f0c; margin: 0 0 24px; letter-spacing: 2px; background: #e8ebe6; padding: 12px; border-radius: 6px; text-align: center;">${masterPassword}</p>
    ${dbSection}
  </div>

  <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #92400e;">
    <p style="margin: 0; font-weight: bold;">⚠️ Security Notice</p>
    <p style="margin: 8px 0 0;">Store these credentials safely and delete this email once saved. Open the app and use "Login on New Device" to re-enter your credentials and set a new PIN.</p>
  </div>

  <p style="color: #868685; font-size: 11px; border-top: 1px solid #e8ebe6; padding-top: 16px; margin-top: 24px;">
    KutumbKosh — End-to-end encrypted family financial vault.
  </p>
</body>
</html>
  `;

  if (!isSmtpConfigured()) {
    console.warn('================================================================');
    console.warn('⚠️  SMTP not configured — SMTP_USER or SMTP_PASS is missing in .env');
    console.warn(`   User:     ${user.email}`);
    console.warn(`   Password: ${masterPassword}`);
    console.warn(`   DB URL:   ${dbUrl ?? 'N/A'}`);
    console.warn('================================================================');
    return;
  }

  try {
    const info = await createTransporter().sendMail({
      from: `"KutumbKosh Treasury" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'KutumbKosh — Your Recovered Credentials',
      html: htmlContent,
    });
    console.log(`[email] Recovery email sent to ${user.email} — MessageID: ${info.messageId}`);
  } catch (err: any) {
    console.error(`[email] FAILED to send recovery email to ${user.email}:`, err.message);
    throw new Error(`Recovery email delivery failed: ${err.message}`);
  }
}
