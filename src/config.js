require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@vaidicsanskar.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  MONGODB_URI: process.env.MONGODB_URI || '',
  AGORA_APP_ID: process.env.AGORA_APP_ID || process.env.EXPO_PUBLIC_AGORA_APP_ID || '',
  AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE || '',
};
