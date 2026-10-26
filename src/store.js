/**
 * Unified resilient data store with MongoDB persistence + local JSON disk persistence + in-memory cache.
 * When MONGODB_URI is provided in .env, records persist directly to MongoDB.
 * In all cases, records also persist to src/data/database.json so local data is never lost.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const seed = require('./seed');
const {
  isMongoConnected,
  Record,
  Booking,
  Vendor,
  User,
  Ritual,
  Earning,
  AuditLog,
} = require('./db');

function syncSpecializedModel(name, row, action = 'save') {
  if (!isMongoConnected() || !row) return;
  try {
    const id = row.id || row._id;
    if (name === 'bookings' && Booking) {
      if (action === 'delete') Booking.deleteOne({ id }).catch(() => {});
      else Booking.findOneAndUpdate({ id }, row, { upsert: true }).catch(() => {});
    } else if (name === 'vendors' && Vendor) {
      if (action === 'delete') Vendor.deleteOne({ id }).catch(() => {});
      else Vendor.findOneAndUpdate({ id }, row, { upsert: true }).catch(() => {});
    } else if (name === 'users' && User) {
      if (action === 'delete') User.deleteOne({ id }).catch(() => {});
      else User.findOneAndUpdate({ id }, row, { upsert: true }).catch(() => {});
    } else if (name === 'rituals' && Ritual) {
      if (action === 'delete') Ritual.deleteOne({ id }).catch(() => {});
      else Ritual.findOneAndUpdate({ id }, row, { upsert: true }).catch(() => {});
    } else if ((name === 'vendor_earnings' || name === 'earnings') && Earning) {
      if (action === 'delete') Earning.deleteOne({ id }).catch(() => {});
      else Earning.findOneAndUpdate({ id }, row, { upsert: true }).catch(() => {});
    }
  } catch (e) {
    // Non-blocking
  }
}

const DB_FILE = path.join(__dirname, 'data', 'database.json');

// Initialize data from disk or seed
let data = {};
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    data = JSON.parse(raw);
    // Ensure all seed collections exist and empty collections are seeded
    for (const key of Object.keys(seed)) {
      if (!data[key] || data[key].length === 0) {
        data[key] = JSON.parse(JSON.stringify(seed[key]));
      }
    }
    saveDiskSync();
  } else {
    data = JSON.parse(JSON.stringify(seed));
    saveDiskSync();
  }
} catch (e) {
  console.warn('  ⚠️ Error reading database.json, falling back to seed:', e.message);
  data = JSON.parse(JSON.stringify(seed));
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDiskSync();
  }, 100);
}

function saveDiskSync() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('  ⚠️ Failed writing database.json to disk:', err.message);
  }
}

function col(name) {
  if (!data[name] || data[name].length === 0) {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed[name] && parsed[name].length > 0) {
          data[name] = parsed[name];
        }
      }
    } catch (_) {}
  }
  if (!data[name]) data[name] = [];
  return data[name];
}

module.exports = {
  collections: () => Object.keys(data),

  list(name, { q, field, value } = {}) {
    let rows = col(name).slice();
    if (field && value != null) rows = rows.filter((r) => String(r[field]) === String(value));
    if (q) {
      const s = String(q).toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
    }
    return rows;
  },

  get(name, id) {
    return col(name).find((r) => String(r.id) === String(id)) || null;
  },

  insert(name, doc) {
    const row = { id: doc.id || genId(name), createdAt: new Date().toISOString(), ...doc };
    col(name).unshift(row);
    scheduleSave();

    // Sync to MongoDB if connected
    if (isMongoConnected()) {
      Record.findOneAndUpdate(
        { collectionName: name, recordId: row.id },
        { collectionName: name, recordId: row.id, data: row },
        { upsert: true, new: true }
      ).catch((err) => console.error(`MongoDB sync insert error (${name}):`, err.message));
      syncSpecializedModel(name, row, 'save');
    }

    return row;
  },

  update(name, id, patch) {
    const row = col(name).find((r) => String(r.id) === String(id));
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    scheduleSave();

    // Sync to MongoDB if connected
    if (isMongoConnected()) {
      Record.findOneAndUpdate(
        { collectionName: name, recordId: String(id) },
        { collectionName: name, recordId: String(id), data: row },
        { upsert: true }
      ).catch((err) => console.error(`MongoDB sync update error (${name}):`, err.message));
      syncSpecializedModel(name, row, 'save');
    }

    return row;
  },

  remove(name, id) {
    const arr = col(name);
    const i = arr.findIndex((r) => String(r.id) === String(id));
    if (i === -1) return false;
    const deletedRow = arr[i];
    arr.splice(i, 1);
    scheduleSave();

    // Sync deletion to MongoDB if connected
    if (isMongoConnected()) {
      Record.deleteOne({ collectionName: name, recordId: String(id) }).catch((err) =>
        console.error(`MongoDB sync delete error (${name}):`, err.message)
      );
      syncSpecializedModel(name, deletedRow, 'delete');
    }

    return true;
  },

  // Hydrate in-memory cache from MongoDB on startup
  async hydrateFromDB() {
    if (!isMongoConnected()) return;
    try {
      const records = await Record.find({}).lean();
      if (records.length === 0) {
        // If MongoDB Atlas is empty, sync existing local database.json records up to Atlas
        for (const [colName, rows] of Object.entries(data)) {
          if (Array.isArray(rows) && rows.length > 0) {
            for (const row of rows) {
              if (row && row.id) {
                await Record.findOneAndUpdate(
                  { collectionName: colName, recordId: String(row.id) },
                  { collectionName: colName, recordId: String(row.id), data: row },
                  { upsert: true }
                ).catch(() => {});
                syncSpecializedModel(colName, row, 'save');
              }
            }
          }
        }
        console.log('  📤 Synced existing local records up to MongoDB Atlas.');
        return;
      }
      for (const rec of records) {
        if (rec.collectionName && rec.data) {
          const arr = col(rec.collectionName);
          const idx = arr.findIndex((x) => String(x.id) === String(rec.recordId));
          if (idx === -1) {
            arr.unshift(rec.data);
          } else {
            arr[idx] = rec.data;
          }
        }
      }
      console.log(`  📦 Hydrated ${records.length} records from MongoDB into live cache.`);
      scheduleSave();
    } catch (e) {
      console.warn('  ⚠️ Hydration from MongoDB failed:', e.message);
    }
  },

  async clearAllData() {
    const emptyKeys = [
      'users',
      'vendors',
      'bookings',
      'jobs',
      'orders',
      'products',
      'sessions',
      'subs',
      'donations',
      'events',
      'payouts',
      'reviews',
      'library',
      'banners',
      'vendor_earnings',
    ];
    for (const k of emptyKeys) {
      data[k] = [];
    }
    saveDiskSync();

    if (isMongoConnected()) {
      try {
        await Record.deleteMany({});
        if (Vendor) await Vendor.deleteMany({});
        if (User) await User.deleteMany({});
        if (Booking) await Booking.deleteMany({});
        if (Earning) await Earning.deleteMany({});
        if (AuditLog) await AuditLog.deleteMany({});
        console.log('  🧹 All user records, vendors, and test data cleared from MongoDB.');
      } catch (err) {
        console.warn('  ⚠️ MongoDB wipe warning:', err.message);
      }
    }
    return true;
  },
};

function genId(name) {
  const prefix = {
    users: 'U',
    vendors: 'V',
    bookings: 'BK',
    jobs: 'JOB',
    orders: 'OD',
    products: 'P',
    sessions: 'S',
    subs: 'SUB',
    temples: 'T',
    donations: 'DN',
    events: 'EV',
    payouts: 'PO',
    reviews: 'R',
    library: 'L',
    banners: 'B',
  }[name] || '';
  return prefix ? prefix + Math.floor(1000 + Math.random() * 9000) : randomUUID();
}
