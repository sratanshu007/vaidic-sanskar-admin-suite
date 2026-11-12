const nodemailer = require('nodemailer');

let transporter = null;
let smtpReachable = null; // null = unknown, true = verified, false = blocked/timeout

function parseSender(raw) {
  const clean = String(raw || '').trim();
  const m = clean.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    return { name: m[1].replace(/^["']|["']$/g, '').trim() || 'Vaidic Sanskar', email: m[2].trim() };
  }
  return { name: 'Vaidic Sanskar', email: clean || 'noreply@vaidicsanskar.com' };
}

async function sendViaBrevo({ to, name, otp, subject, text, html }) {
  const apiKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim();
  if (!apiKey) return null;

  const sender = parseSender(
    process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to, name: name && name !== 'Partner' ? name : 'Partner' }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || `Brevo HTTP ${res.status}`);
    }
    console.log(`  ✅ [Brevo Success] Verification OTP sent to ${to}. MessageId: ${data.messageId || 'ok'}`);
    return { success: true, provider: 'brevo', messageId: data.messageId, otp };
  } catch (err) {
    console.error(`  ❌ [Brevo Error] Failed sending to ${to}:`, err.message);
    return { success: false, provider: 'brevo', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();

  if (!user || !pass) {
    console.warn('  ⚠️ SMTP credentials missing (SMTP_USER / SMTP_PASS). Email sending will be logged to console.');
    return null;
  }

  const isGmail = host.includes('gmail.com') || user.toLowerCase().endsWith('@gmail.com');

  transporter = nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: isGmail ? 465 : (port === 465 ? 465 : 587),
    secure: isGmail || port === 465, // SSL on 465 bypasses cloud SMTP port 587 restrictions
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
}

/**
 * Send 6-digit verification OTP email (Default: Professional English)
 */
async function sendPartnerOtpEmail({ to, name = 'User', otp, lang = 'en' }) {
  const mailer = getTransporter();
  const user = (process.env.SMTP_USER || '').trim();
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Vaidic Sanskar" <${user || 'noreply@vaidicsanskar.com'}>`;

  const isHindi = lang === 'hi';

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vaidic Sanskar Account Verification</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #FAF7F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #FAF7F0; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 21, 6, 0.08); border: 1px solid #F0E6D8;">
            
            <!-- Header Banner -->
            <tr>
              <td style="background: linear-gradient(135deg, #7A1D08 0%, #D4541B 100%); padding: 32px 24px; text-align: center; color: #FFFFFF;">
                <div style="font-size: 38px; line-height: 40px; margin-bottom: 8px;">🕉️</div>
                <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Vaidic Sanskar</h1>
                <p style="margin: 6px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #FFE0B2;">ACCOUNT VERIFICATION</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 32px 28px;">
                <p style="margin: 0 0 16px; font-size: 16px; color: #2C1810; font-weight: 600;">
                  Namaste ${name && name !== 'Partner' ? name : 'Devotee'},
                </p>
                <p style="margin: 0 0 24px; font-size: 15px; color: #5C4033; line-height: 1.6;">
                  Welcome to <strong>Vaidic Sanskar</strong>. Use the 6-digit verification code below to verify your account:
                </p>

                <!-- OTP Box -->
                <div style="background: #FFF8E7; border: 2px dashed #D4541B; border-radius: 12px; padding: 22px; text-align: center; margin: 24px 0;">
                  <span style="display: block; font-size: 12px; color: #7A1D08; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">
                    YOUR VERIFICATION CODE (OTP)
                  </span>
                  <span style="display: block; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #D4541B; font-family: monospace;">
                    ${otp}
                  </span>
                  <span style="display: block; font-size: 12px; color: #8C7060; margin-top: 8px; font-weight: 500;">
                    Valid for 10 minutes (expires soon)
                  </span>
                </div>

                <p style="margin: 20px 0 0; font-size: 13px; color: #8C7060; line-height: 1.5;">
                  ⚠️ <strong>Security Notice:</strong> Please never share this OTP with anyone. Vaidic Sanskar staff will never call or message to ask for your password or verification code.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #FAF5EE; padding: 20px 28px; text-align: center; border-top: 1px solid #EFE4D6;">
                <p style="margin: 0; font-size: 12px; color: #8C7060;">
                  © 2026 Vaidic Sanskar. Connecting Devotees with Sacred Vedic Heritage.
                </p>
                <p style="margin: 4px 0 0; font-size: 11px; color: #A68B7A;">
                  If you did not request this verification code, please ignore this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const subject = `Your Vaidic Sanskar Partner Verification Code: ${otp}`;
  const text = `Dear ${name},\n\nYour Vaidic Sanskar Partner verification code is: ${otp}\n\nThis code is valid for 10 minutes.\n\nThank you,\nVaidic Sanskar Partner Team`;

  // 1. Primary: Brevo Transactional Email API (HTTPS port 443 — bypasses Render SMTP blocks)
  const brevoRes = await sendViaBrevo({
    to,
    name,
    otp,
    subject,
    text,
    html: htmlContent,
  });
  if (brevoRes?.success) {
    return brevoRes;
  }

  // 2. Secondary: Direct SMTP (when SMTP_USER/PASS work locally)
  if (!mailer || smtpReachable === false) {
    console.log(`  📨 [OTP Fallback] Email OTP for ${to}: ${otp}`);
    return { success: true, simulated: true, otp };
  }

  try {
    const info = await Promise.race([
      mailer.sendMail({
        from,
        to,
        subject,
        text,
        html: htmlContent,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 3500)),
    ]);
    smtpReachable = true;
    console.log(`  ✅ [SMTP Success] Verification OTP sent to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId, otp };
  } catch (error) {
    smtpReachable = false;
    console.warn(`  ℹ️ [SMTP Fallback] SMTP unreachable for ${to} (${error.message}). Returning instant fallback OTP.`);
    return { success: true, simulated: true, simulatedOtp: otp, otp };
  }
}

async function verifySmtp() {
  if ((process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()) {
    console.log('  📧 Brevo HTTPS Email API configured for OTP delivery!');
    return true;
  }

  const mailer = getTransporter();
  if (!mailer) {
    smtpReachable = false;
    return false;
  }

  // Race verify against a 4-second timeout so server never hangs during deployment
  const verifyPromise = mailer.verify();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connection timeout (Render dynamic IP / port filter)')), 4000)
  );

  try {
    await Promise.race([verifyPromise, timeoutPromise]);
    smtpReachable = true;
    console.log('  📧 SMTP Server Connected and Verified Successfully!');
    return true;
  } catch (err) {
    smtpReachable = false;
    console.warn(`  ℹ️ SMTP verify notice: ${err.message}. OTP delivery will fallback to active console log & API response.`);
    return false;
  }
}

module.exports = {
  sendPartnerOtpEmail,
  verifySmtp,
};
