const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    email: { type: String },
    address: { type: String },
    city: { type: String, default: 'New Delhi' },
    gotra: { type: String, default: 'Kashyap' },
    role: { type: String, default: 'devotee' },
  },
  { timestamps: true }
);

// Ritual Package Schema
const ritualSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    hindi: { type: String },
    category: { type: String, default: 'Popular' },
    price: { type: Number, required: true },
    samagri: { type: Number, default: 600 },
    duration: { type: String, default: '2 - 2.5 hrs' },
    description: { type: String },
    suitableFor: { type: String },
    bestDay: { type: String },
  },
  { timestamps: true }
);

// Vendor Earning Ledger Schema
const earningSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    vendorId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Settled', 'Pending', 'Withdrawn'], default: 'Settled' },
  },
  { timestamps: true }
);

// Audit Log Schema
const auditLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    bookingId: { type: String, required: true, index: true },
    previousStatus: { type: String },
    newStatus: { type: String, required: true },
    actor: { type: String, required: true },
    reason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Ritual = mongoose.models.Ritual || mongoose.model('Ritual', ritualSchema);
const Earning = mongoose.models.Earning || mongoose.model('Earning', earningSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = {
  User,
  Ritual,
  Earning,
  AuditLog,
};
