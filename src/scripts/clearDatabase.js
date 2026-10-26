require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'database.json');

async function main() {
  console.log('--- Wiping Database for Clean Start (Real Users Only) ---');

  // 1. Clear JSON Database
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw);
      data.users = [];
      data.vendors = [];
      data.bookings = [];
      data.jobs = [];
      data.orders = [];
      data.products = [];
      data.sessions = [];
      data.subs = [];
      data.donations = [];
      data.events = [];
      data.payouts = [];
      data.reviews = [];
      data.library = [];
      data.banners = [];
      data.vendor_earnings = [];
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log('✓ Cleared database.json on disk.');
    }
  } catch (err) {
    console.error('Error clearing database.json:', err.message);
  }

  // 2. Clear MongoDB if configured
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      console.log('Connecting to MongoDB Atlas...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        family: 4,
      });
      console.log('✓ Connected to MongoDB.');

      const collections = await mongoose.connection.db.collections();
      for (const col of collections) {
        const name = col.collectionName;
        // Don't wipe master pujas / rituals / temples catalogue unless desired
        if (name === 'records' || name === 'vendors' || name === 'users' || name === 'bookings' || name === 'earnings' || name === 'auditlogs') {
          await col.deleteMany({});
          console.log(`✓ Cleared collection: ${name}`);
        }
      }
      await mongoose.disconnect();
      console.log('✓ Disconnected from MongoDB.');
    } catch (err) {
      console.warn('MongoDB wipe note:', err.message);
    }
  }

  console.log('--- Database Wipe Complete! Real Users Ready ---');
}

main().catch(console.error);
