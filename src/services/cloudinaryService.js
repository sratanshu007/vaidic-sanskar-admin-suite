const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary if env variables are present
const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Upload buffer or file to Cloudinary with local static fallback for development.
 * @param {Buffer} buffer - File buffer from multer
 * @param {Object} options - folder, filename, etc.
 * @returns {Promise<{ url: string, public_id: string, source: 'cloudinary' | 'local' }>}
 */
async function uploadToCloudinary(buffer, options = {}) {
  const folder = options.folder || 'vaidic_sanskar_partners';

  if (isConfigured) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          public_id: options.publicId || undefined,
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            // Fallback to local on error so flow doesn't break
            return resolve(fallbackLocalSave(buffer, options));
          }
          resolve({
            url: result.secure_url || result.url,
            secure_url: result.secure_url || result.url,
            public_id: result.public_id,
            source: 'cloudinary',
          });
        }
      );
      uploadStream.end(buffer);
    });
  }

  // Fallback to local static uploads folder when Cloudinary credentials are not set
  return fallbackLocalSave(buffer, options);
}

function fallbackLocalSave(buffer, options = {}) {
  const uploadsDir = path.join(__dirname, '../../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext = options.ext || '.jpg';
  const fileName = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, buffer);

  const localUrl = `/uploads/${fileName}`;
  return {
    url: localUrl,
    secure_url: localUrl,
    public_id: fileName,
    source: 'local',
  };
}

module.exports = {
  cloudinary,
  isConfigured,
  uploadToCloudinary,
};
