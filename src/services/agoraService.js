const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { AGORA_APP_ID, AGORA_APP_CERTIFICATE } = require('../config');

/**
 * Generate Agora RTC token for live Audio / Video calls
 * @param {Object} params
 * @param {string} params.channelName - Agora channel / room name
 * @param {number|string} [params.uid] - User ID (integer or string)
 * @param {string} [params.role] - 'publisher' | 'subscriber' (default: 'publisher')
 * @param {number} [params.expireSeconds] - Token expiration in seconds (default: 3600 = 1 hour)
 */
function generateRtcToken({ channelName, uid = 0, role = 'publisher', expireSeconds = 3600 } = {}) {
  const appId = (process.env.AGORA_APP_ID || process.env.EXPO_PUBLIC_AGORA_APP_ID || AGORA_APP_ID || '').trim();
  const appCertificate = (process.env.AGORA_APP_CERTIFICATE || AGORA_APP_CERTIFICATE || '').trim();

  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required to generate an Agora RTC token');
  }

  const rtcRole = role.toLowerCase() === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const tokenExpire = Math.max(300, Number(expireSeconds) || 3600);
  const privilegeExpire = tokenExpire;

  // If no App Certificate is configured on Agora Console, tokens are not required (Testing Mode)
  if (!appCertificate) {
    return {
      success: true,
      mode: 'testing',
      appId,
      token: null,
      channelName,
      uid,
      role,
      message: 'Agora running in testing mode without App Certificate. Token is null.',
    };
  }

  if (!appId) {
    throw new Error('AGORA_APP_ID is not configured in environment variables');
  }

  let token = '';

  // Determine whether uid is numeric or string account
  const numericUid = Number(uid);
  if (!isNaN(numericUid) && Number.isInteger(numericUid) && numericUid >= 0) {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      numericUid,
      rtcRole,
      tokenExpire,
      privilegeExpire
    );
  } else {
    token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      channelName,
      String(uid),
      rtcRole,
      tokenExpire,
      privilegeExpire
    );
  }

  return {
    success: true,
    mode: 'production',
    appId,
    token,
    channelName,
    uid,
    role,
    expiresIn: tokenExpire,
  };
}

/**
 * Returns public Agora configuration status for apps
 */
function getAgoraStatus() {
  const appId = (process.env.AGORA_APP_ID || process.env.EXPO_PUBLIC_AGORA_APP_ID || AGORA_APP_ID || '').trim();
  const appCertificate = (process.env.AGORA_APP_CERTIFICATE || AGORA_APP_CERTIFICATE || '').trim();

  return {
    configured: !!appId,
    hasCertificate: !!appCertificate,
    mode: appCertificate ? 'production' : 'testing',
    appId: appId || null,
  };
}

module.exports = {
  generateRtcToken,
  getAgoraStatus,
};

