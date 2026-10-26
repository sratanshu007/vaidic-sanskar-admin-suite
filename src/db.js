const mongoose = require('mongoose');
const models = require('./models');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('  ℹ️  MONGODB_URI not set. Running with high-performance local persistence.');
    console.log('     To connect MongoDB Atlas, set MONGODB_URI in .env');
    return false;
  }

  try {
    const maskedUri = uri.replace(/:([^:@]+)@/, ':****@');
    console.log(`  ⏳ Connecting to MongoDB Atlas: ${maskedUri}...`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to prevent IPv6 timeout issues
    });

    isConnected = true;
    console.log('  🍃 MongoDB Connected Successfully! Live data is now active & persistent in MongoDB.');
    return true;
  } catch (err) {
    console.warn('\n  ⚠️  MongoDB Connection Notice:');
    console.warn(`     ${err.message}`);
    console.warn('  👉 HOW TO FIX MONGODB ATLAS ACCESS:');
    console.warn('     1. Open MongoDB Atlas: https://cloud.mongodb.com/');
    console.warn('     2. Go to: Security → Network Access');
    console.warn('     3. Click "ADD IP ADDRESS"');
    console.warn('     4. Choose "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0) or add your current IP: 103.139.56.206');
    console.warn('     5. Click Confirm. Connection will automatically succeed.\n');
    console.warn('  🛡️  Continuing with local JSON + memory store so server stays 100% online without interruption.\n');
    return false;
  }
}

// Flexible Collection Schema to support legacy and generic resources
const collectionSchema = new mongoose.Schema(
  {
    collectionName: { type: String, required: true, index: true },
    recordId: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

collectionSchema.index({ collectionName: 1, recordId: 1 }, { unique: true });

const Record = mongoose.models.Record || mongoose.model('Record', collectionSchema);

module.exports = {
  connectDB,
  isMongoConnected: () => isConnected && mongoose.connection.readyState === 1,
  Record,
  ...models,
};
