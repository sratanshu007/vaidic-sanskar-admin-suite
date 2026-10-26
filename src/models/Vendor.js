const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    email: { type: String },
    capabilities: [{ type: String, enum: ['PANDIT', 'ASTROLOGER', 'MANDALI'] }],
    gurukul: { type: String },
    experienceYears: { type: Number, default: 5 },
    rating: { type: Number, default: 4.8 },
    reviewsCount: { type: Number, default: 0 },
    verified: { type: Boolean, default: true },
    onlineStatus: { type: Boolean, default: true },
    currentLocation: {
      latitude: { type: Number, default: 28.5355 },
      longitude: { type: Number, default: 77.3910 },
      lastUpdated: { type: Date, default: Date.now },
    },
    services: [{ type: String }],
    languages: [{ type: String }],
    walletBalance: { type: Number, default: 0 },
    documents: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
