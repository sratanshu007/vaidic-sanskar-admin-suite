const express = require('express');
const router = express.Router();
const { generateRtcToken, getAgoraStatus } = require('../services/agoraService');

/**
 * GET /api/agora/status
 * Public status endpoint so apps know whether Agora is ready
 */
router.get(['/status', '/config'], (req, res) => {
  try {
    const status = getAgoraStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/agora/token or POST /api/agora/token
 * Generate real-time Agora RTC token for channel audio/video calling
 */
const handleTokenRequest = (req, res) => {
  try {
    const channelName = req.query.channelName || req.body?.channelName || req.query.channel || req.body?.channel;
    const uid = req.query.uid || req.body?.uid || 0;
    const role = req.query.role || req.body?.role || 'publisher';
    const expireSeconds = req.query.expireSeconds || req.body?.expireSeconds || 3600;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        message: 'channelName is required (as query param ?channelName=... or json body)',
      });
    }

    const tokenData = generateRtcToken({
      channelName,
      uid,
      role,
      expireSeconds,
    });

    res.json(tokenData);
  } catch (err) {
    console.error('Agora token generation error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Agora token: ' + err.message,
    });
  }
};

router.get('/token', handleTokenRequest);
router.post('/token', handleTokenRequest);

module.exports = router;
