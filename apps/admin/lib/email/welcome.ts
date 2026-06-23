import nodemailer from 'nodemailer';

function generateMasterPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  return 'KK-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function sendWelcomeEmail(user: {
  name: string;
  email: string;
  familyName?: string;
}): Promise<{ masterPassword: string; emailId: string }> {
  const masterPassword = generateMasterPassword();

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpSecure = process.env.SMTP_SECURE !== 'false';

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
    <p style="color: #d03238; font-size: 12px; margin: 16px 0 0; font-weight: bold; line-height: 1.4;">⚠️ IMPORTANT SECURITY NOTICE: Save this password in a safe place. It is used to encrypt your database locally and cannot be recovered or reset by the administrator.</p>
  </div>

  <h3 style="color: #0e0f0c; border-bottom: 2px solid #e8ebe6; padding-bottom: 8px;">Next Steps for Setup:</h3>
  <ol style="line-height: 2; padding-left: 20px; font-size: 14px;">
    <li>Open the KutumbKosh app on your mobile device.</li>
    <li>Enter your email (<strong>${user.email}</strong>) and the master password shown above.</li>
    <li>Create a free database at <a href="https://neon.tech" style="color: #2ead4b; font-weight: bold;">neon.tech</a> or <a href="https://supabase.com" style="color: #2ead4b; font-weight: bold;">supabase.com</a>.</li>
    <li>Copy the PostgreSQL Connection URL (string starting with <code>postgresql://</code>) and paste it into the sync setup window.</li>
    <li>The app will automatically partition and create your private schemas.</li>
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
    KutumbKosh stores no ledger values or balance sheets. All records are encrypted on-device with AES-256 before upload. Neither the administrator nor your database provider can read your data without your master password.
  </p>
</body>
</html>
  `;

  if (!smtpUser || !smtpPass) {
    console.warn('================================================================');
    console.warn('⚠️ SMTP credentials not configured (SMTP_USER / SMTP_PASS).');
    console.warn('Printing master password to console for developer testing:');
    console.warn(`User Email:      ${user.email}`);
    console.warn(`Master Password: ${masterPassword}`);
    console.warn('================================================================');
  } else {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"KutumbKosh Treasury" <${smtpUser}>`,
      to: user.email,
      subject: 'Welcome to KutumbKosh — Your Master Access Password',
      html: htmlContent,
    });
  }

  return { masterPassword, emailId: user.email };
}
