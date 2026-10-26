const nodemailer = require('nodemailer');

let transporter = null;

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

  transporter = nodemailer.createTransport(
    isGmail
      ? {
        service: 'gmail',
        auth: { user, pass },
      }
      : {
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: false,
        },
      }
  );

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

  if (!mailer) {
    console.log(`\n  📨 [SMTP Fallback Log] Email OTP for ${to}: ${otp}\n`);
    return { success: true, simulated: true, otp };
  }

  try {
    const info = await mailer.sendMail({
      from,
      to,
      subject: `Your Vaidic Sanskar Partner Verification Code: ${otp}`,
      text: `Dear ${name},\n\nYour Vaidic Sanskar Partner verification code is: ${otp}\n\nThis code is valid for 10 minutes.\n\nThank you,\nVaidic Sanskar Partner Team`,
      html: htmlContent,
    });
    console.log(`  ✅ [SMTP Success] Verification OTP sent to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId, otp };
  } catch (error) {
    console.error(`  ❌ [SMTP Error] Failed sending to ${to}:`, error.message);
    return { success: false, error: error.message, simulatedOtp: otp };
  }
}

async function verifySmtp() {
  const mailer = getTransporter();
  if (!mailer) return false;
  try {
    await mailer.verify();
    console.log('  📧 SMTP Server Connected and Verified Successfully!');
    return true;
  } catch (err) {
    console.warn('  ⚠️ SMTP verify warning:', err.message);
    return false;
  }
}

module.exports = {
  sendPartnerOtpEmail,
  verifySmtp,
};
