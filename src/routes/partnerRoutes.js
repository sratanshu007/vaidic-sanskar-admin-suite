const router = require('express').Router();
const multer = require('multer');
const store = require('../store');
const { requireAuth } = require('../auth');
const { emit, getLiveAstrologers } = require('../sockets');
const { uploadToCloudinary } = require('../services/cloudinaryService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/* ---------- Cloudinary Image / Document Upload (Single or Multi-Angle) ---------- */
router.post('/upload', upload.any(), async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const folder = req.body?.folder || 'vaidic_sanskar_partners';
    const uploadPromises = files.map(async (file) => {
      const ext = '.' + ((file.originalname || 'image.jpg').split('.').pop() || 'jpg');
      const result = await uploadToCloudinary(file.buffer, {
        folder,
        ext,
      });
      return result.secure_url || result.url;
    });

    const urls = await Promise.all(uploadPromises);

    res.json({
      success: true,
      message: `${urls.length} photo(s) uploaded successfully`,
      url: urls[0],
      secure_url: urls[0],
      urls: urls,
      source: 'cloudinary',
    });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

/* ---------- Vendor onboarding / KYC ---------- */
const handleVendorRegister = (req, res) => {
  const { phone, email, id, role = 'pandit' } = req.body || {};
  let vendor = null;

  const normalizedEmail = email ? email.toLowerCase().trim() : null;

  // Search existing vendor by ID, email, or phone
  if (id) {
    vendor = store.get('vendors', id);
  }
  if (!vendor && normalizedEmail) {
    vendor = store.list('vendors').find(
      (v) => v.email && v.email.toLowerCase().trim() === normalizedEmail
    );
  }
  if (!vendor && phone) {
    vendor = store.list('vendors').find((v) => v.phone && v.phone.trim() === phone.trim());
  }

  if (vendor) {
    vendor = store.update('vendors', vendor.id, {
      ...req.body,
      role: req.body.role || vendor.role || role,
      profileCompleted: true,
      kyc: 'Pending',
      status: 'Review',
      updatedAt: new Date().toISOString(),
    });
  } else {
    vendor = store.insert('vendors', {
      ...req.body,
      role,
      profileCompleted: true,
      kyc: 'Pending',
      status: 'Review',
      rating: 5.0,
      jobs: 0,
      createdAt: new Date().toISOString(),
    });
  }

  emit.toAdmin('vendor:new', vendor);
  res.status(201).json({
    success: true,
    message: 'प्रोफ़ाइल समीक्षा हेतु जमा कर दी गई है (Profile submitted for verification)',
    vendor,
  });
};
router.post('/vendor/register', handleVendorRegister);
router.post('/register', handleVendorRegister);

/* ---------- Complete Profile (Step 2 after account creation) ---------- */
const handleVendorCompleteProfile = (req, res) => {
  const { phone, email, id, role } = req.body || {};
  let vendor = null;

  const normalizedEmail = email ? email.toLowerCase().trim() : null;

  if (id) vendor = store.get('vendors', id);
  if (!vendor && normalizedEmail) {
    vendor = store.list('vendors').find(
      (v) => v.email && v.email.toLowerCase().trim() === normalizedEmail
    );
  }
  if (!vendor && phone) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    vendor = store.list('vendors').find((v) => {
      if (v.phone && v.phone.trim() === String(phone).trim()) return true;
      if (cleanPhone.length >= 10 && v.phone) {
        const vDigits = String(v.phone).replace(/\D/g, '');
        return vDigits.endsWith(cleanPhone.slice(-10)) || cleanPhone.endsWith(vDigits.slice(-10));
      }
      return false;
    });
  }
  if (!vendor && req.headers?.authorization) {
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../config');
      const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && (decoded.sub || decoded.id)) {
        vendor = store.get('vendors', decoded.sub || decoded.id);
      }
    } catch (e) {}
  }

  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: 'पार्टनर खाता नहीं मिला। कृपया पुनः लॉगिन अथवा पंजीकरण करें।',
    });
  }

  const updated = store.update('vendors', vendor.id, {
    ...req.body,
    role: role || vendor.role,
    profileCompleted: true,
    kyc: 'Pending',
    status: 'Review',
    updatedAt: new Date().toISOString(),
  });

  emit.toAdmin('vendor:new', updated);
  emit.toAdmin('vendor:update', updated);

  res.json({
    success: true,
    message: 'प्रोफ़ाइल विवरण पूर्ण हो गया है (Profile completed successfully)',
    vendor: updated,
  });
};
router.post('/vendor/complete-profile', handleVendorCompleteProfile);
router.post('/complete-profile', handleVendorCompleteProfile);

/* ---------- Vendor Profile Update ---------- */
router.put('/vendor/profile', (req, res) => {
  const { phone, email, id } = req.body || {};
  const normalizedEmail = email ? email.toLowerCase().trim() : null;

  let existing = null;
  if (id) existing = store.get('vendors', id);
  if (!existing && normalizedEmail) {
    existing = store.list('vendors').find((v) => v.email && v.email.toLowerCase().trim() === normalizedEmail);
  }
  if (!existing && phone) {
    existing = store.list('vendors').find((v) => v.phone && v.phone.trim() === phone.trim());
  }

  if (!existing) {
    return res.status(404).json({ success: false, message: 'Vendor not found' });
  }

  const updated = store.update('vendors', existing.id, {
    ...req.body,
    updatedAt: new Date().toISOString(),
  });

  emit.toAdmin('vendor:update', updated);
  res.json({
    success: true,
    message: 'Profile updated successfully',
    vendor: updated,
  });
});

/* ---------- Customer Discovery (Approved Partners Only) ---------- */
function getApprovedVendors(roleFilter) {
  const dbVendors = store.list('vendors').filter((v) => {
    const isApproved = v.status === 'Active' || v.kyc === 'Verified';
    if (!isApproved) return false;
    if (!roleFilter) return true;
    const filter = String(roleFilter).toLowerCase();
    if (filter === 'astrologer' || filter === 'astro') {
      return v.role === 'astro' || v.role === 'astrologer' || (Array.isArray(v.services) && v.services.includes('astro'));
    }
    return v.role === filter || (Array.isArray(v.services) && v.services.includes(filter));
  });

  const filter = String(roleFilter || '').toLowerCase();
  if (!filter || filter === 'astrologer' || filter === 'astro') {
    const liveAstros = typeof getLiveAstrologers === 'function' ? getLiveAstrologers() : [];
    const merged = [...dbVendors];
    for (const live of liveAstros) {
      const idx = merged.findIndex((m) => String(m.id || m._id) === String(live.id));
      if (idx > -1) {
        merged[idx] = { ...merged[idx], ...live, isOnline: live.isOnline !== false };
      } else {
        merged.unshift({
          ...live,
          status: 'Active',
          kyc: 'Verified',
          role: 'astro',
        });
      }
    }
    return merged;
  }

  return dbVendors;
}

router.get('/discovery/role/:role', (req, res) => {
  const role = req.params.role.toLowerCase();
  const list = getApprovedVendors(role);
  res.json({ success: true, count: list.length, vendors: list, data: list });
});

router.get('/discovery/vendors', (req, res) => {
  const list = getApprovedVendors(req.query.role);
  res.json({ success: true, count: list.length, vendors: list, data: list });
});

router.get('/discovery/vendors/:id', (req, res) => {
  const v = store.get('vendors', req.params.id);
  if (!v) return res.status(404).json({ message: 'Vendor not found' });
  res.json({ success: true, vendor: v, data: v });
});

router.get('/discovery/stats', (req, res) => {
  res.json({
    success: true,
    panditsCount: store.list('vendors').filter((v) => v.role === 'pandit').length,
    pujasCount: store.list('pujas').length,
    activeBookingsCount: store.list('bookings').filter((b) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length,
  });
});

router.get('/discovery/astrologers/top', (req, res) => {
  const list = getApprovedVendors('astro');
  res.json({ success: true, count: list.length, astrologers: list, data: list });
});

router.get('/discovery/astrologers/online', (req, res) => {
  const list = getApprovedVendors('astro');
  res.json({ success: true, count: list.length, astrologers: list, data: list });
});

router.get('/pandit/puja-services', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, services: list, data: list, pujas: list });
});

router.get(['/wallet', '/wallet/balance'], (req, res) => {
  const vendorId = req.auth?.sub || req.query.vendorId;
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  const balance = vendor?.walletBalance != null ? Number(vendor.walletBalance) : 1500;
  res.json({ success: true, balance, data: { balance } });
});

router.get('/wallet/transactions', (req, res) => {
  res.json({ success: true, transactions: [], data: [] });
});

router.get(['/store/home', '/store/categories', '/store/products'], (req, res) => {
  const prods = store.list('products');
  res.json({ success: true, products: prods, data: prods, categories: [] });
});

const handleVendorStatus = (req, res) => {
  const query = req.query.email || req.query.phone || req.query.id || req.query.query;
  if (!query) {
    return res.status(400).json({ message: 'email, phone, or id query parameter required' });
  }

  const q = String(query).toLowerCase().trim();
  const cleanDigits = q.replace(/\D/g, '');
  const vendor = store.list('vendors').find((v) => {
    if (v.id === query) return true;
    if (v.email && v.email.toLowerCase().trim() === q) return true;
    if (v.phone && v.phone.trim() === String(query).trim()) return true;
    if (cleanDigits.length >= 10 && v.phone) {
      const vDigits = String(v.phone).replace(/\D/g, '');
      if (vDigits.endsWith(cleanDigits.slice(-10)) || cleanDigits.endsWith(vDigits.slice(-10))) return true;
    }
    return false;
  });

  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: 'Vendor application not found',
      kyc: 'NotRegistered',
      status: 'None',
    });
  }

  res.json({
    success: true,
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    role: vendor.role,
    city: vendor.city,
    profileCompleted: !!vendor.profileCompleted,
    kyc: vendor.kyc || 'Pending',
    status: vendor.status || 'Review',
    rejectionReason: vendor.rejectionReason || null,
    vendor,
  });
};
router.get('/vendor/status', handleVendorStatus);
router.get('/status', handleVendorStatus);

const handleVendorProfile = (req, res) => {
  const query = req.query.email || req.query.phone || req.query.id || req.query.query;
  const q = query ? String(query).toLowerCase().trim() : '';
  const vendor = store.list('vendors').find(
    (v) =>
      (v.email && v.email.toLowerCase().trim() === q) ||
      (v.phone && v.phone.trim() === String(query).trim()) ||
      v.id === query
  );
  if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
  res.json({ success: true, vendor });
};
router.get('/vendor/profile', handleVendorProfile);
router.get('/profile', handleVendorProfile);

router.post('/vendor/kyc/upload', (req, res) => {
  const { phone, id, docType, docUrl } = req.body || {};
  const vendor = store.list('vendors').find((v) => v.phone === phone || v.id === id);
  if (vendor) {
    const docs = vendor.docs || {};
    if (docType) docs[docType] = docUrl || 'uploaded';
    store.update('vendors', vendor.id, { docs, kycDocs: true });
  }
  res.json({ uploaded: true, success: true });
});

const bookingStateMachine = require('../services/bookingStateMachine');

/* ---------- Jobs & Bookings (Uber/Rapido Pandit Engine) ---------- */
function getVendorDetails(req) {
  let vendorId = req.auth?.sub || req.body.vendorId || req.query.vendorId;
  if (!vendorId && req.headers?.authorization) {
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../config');
      const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded) vendorId = decoded.sub || decoded.id;
    } catch (e) {}
  }
  if (!vendorId) {
    const activePandit = store.list('vendors').find((v) => v.role === 'pandit');
    if (activePandit) vendorId = activePandit.id;
  }
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  return {
    vendorId: vendor?.id || vendorId || 'pandit_1',
    vendorDetails: {
      id: vendor?.id || vendorId || 'pandit_1',
      name: vendor?.name || req.auth?.name || req.body.vendorName || 'Acharya Raman Shastri',
      rating: vendor?.rating != null ? Number(vendor.rating) : 5.0,
      reviewsCount: vendor?.jobs || 124,
      photo: vendor?.photo || req.body.photo || null,
      experienceYears: vendor?.experience || 8,
    },
  };
}

/* ---------- Instant / Uber-style Booking Creation & Listing ---------- */
router.post(['/bookings', '/bookings/create', '/instant/request'], (req, res) => {
  const userId = req.auth?.name || req.auth?.sub || req.body.userId || 'guest_user';
  const booking = bookingStateMachine.createBooking(req.body, userId);
  res.status(201).json({
    success: true,
    bookingId: booking.id,
    id: booking.id,
    booking: bookingStateMachine.sanitizeForUser(booking),
    data: bookingStateMachine.sanitizeForUser(booking),
  });
});

router.get('/bookings/my', (req, res) => {
  const userId = req.auth?.sub || req.query.userId;
  const all = store.list('bookings');
  const mine = userId ? all.filter((b) => b.userId === userId) : all;
  const sanitized = mine.map((b) => bookingStateMachine.sanitizeForUser(b));
  res.json({ success: true, count: sanitized.length, bookings: sanitized, data: sanitized });
});

router.get('/instant/active', (req, res) => {
  const all = store.list('bookings');
  const active = all.find(
    (b) =>
      b.status !== 'COMPLETED' &&
      b.status !== 'CANCELLED' &&
      b.status !== 'EXPIRED'
  );
  if (!active) return res.json({ success: true, booking: null, data: null });
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForUser(active),
    data: bookingStateMachine.sanitizeForUser(active),
  });
});

router.get('/instant/nearby-pandits', (req, res) => {
  const pandits = getApprovedVendors('pandit');
  const mapped = pandits.map((p) => ({
    id: p.id,
    name: p.name,
    photo: p.photo,
    rating: p.rating || 4.9,
    experience: p.experience || p.experienceYears || 8,
    distanceKm: 1.8,
    etaMinutes: 8,
    location: p.location || { lat: 28.5355, lng: 77.3910 },
  }));
  res.json({ success: true, count: mapped.length, pandits: mapped, data: mapped });
});

router.post('/instant/estimate', (req, res) => {
  const basePrice = Number(req.body.price || 2500);
  const withSamagri = req.body.withSamagri !== false;
  const samagriFee = withSamagri ? 600 : 0;
  const platformFee = 50;
  const total = basePrice + samagriFee + platformFee;
  res.json({
    success: true,
    estimatedFare: total,
    baseFare: basePrice,
    samagriFee,
    platformFee,
    estimatedEtaMinutes: 10,
    estimatedDistanceKm: 2.5,
  });
});

router.post(['/bookings/:id/accept', '/instant/:id/accept', '/bookings/accept', '/instant/accept'], async (req, res) => {
  const { vendorId, vendorDetails } = getVendorDetails(req);
  const targetId = req.params.id || req.body.jobId || req.body.job_id || req.body.bookingId;
  const result = await bookingStateMachine.acceptBooking(targetId, vendorId || 'V9501', vendorDetails);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put(['/bookings/:id/accept', '/instant/:id/accept', '/bookings/accept', '/instant/accept'], async (req, res) => {
  const { vendorId, vendorDetails } = getVendorDetails(req);
  const targetId = req.params.id || req.body.jobId || req.body.job_id || req.body.bookingId;
  const result = await bookingStateMachine.acceptBooking(targetId, vendorId || 'V9501', vendorDetails);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/job/accept', async (req, res) => {
  const bookingId = req.body.bookingId || req.body.booking_id || req.body.job_id || req.body.id;
  const { vendorId, vendorDetails } = getVendorDetails(req);
  const result = await bookingStateMachine.acceptBooking(bookingId, vendorId || 'V9501', vendorDetails);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put('/job/accept', async (req, res) => {
  const bookingId = req.body.bookingId || req.body.booking_id || req.body.job_id || req.body.id;
  const { vendorId, vendorDetails } = getVendorDetails(req);
  const result = await bookingStateMachine.acceptBooking(bookingId, vendorId || 'V9501', vendorDetails);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post(['/bookings/:id/reject', '/bookings/:id/decline', '/instant/:id/decline'], (req, res) => {
  res.json({ success: true, message: 'Request declined. Matching will continue with other pandits.' });
});

router.put(['/bookings/:id/reject', '/bookings/:id/decline', '/instant/:id/decline'], (req, res) => {
  res.json({ success: true, message: 'Request declined. Matching will continue with other pandits.' });
});

router.post(['/job/decline', '/job/reject'], (req, res) => {
  res.json({ success: true, ok: true, message: 'Job declined.' });
});

router.put(['/job/decline', '/job/reject'], (req, res) => {
  res.json({ success: true, ok: true, message: 'Job declined.' });
});

router.put(['/instant/:id/arrived', '/bookings/:id/arrived', '/bookings/:id/arrive'], (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const result = bookingStateMachine.confirmArrival(req.params.id, vendorId || 'V9501');
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put(['/instant/:id/start', '/bookings/:id/start', '/bookings/:id/verify-start-otp'], (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const otp = req.body.otp || req.body.startOtp;
  const result = bookingStateMachine.verifyStartOtp(req.params.id, vendorId || 'V9501', otp);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put(['/instant/:id/complete', '/bookings/:id/complete', '/bookings/:id/verify-complete-otp'], (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const otp = req.body.otp || req.body.completeOtp || req.body.endOtp;
  const booking = store.get('bookings', req.params.id);
  if (booking && (!booking.activeCompleteOtp || !booking.otps?.completeOtp)) {
    bookingStateMachine.requestCompletion(req.params.id, vendorId || 'V9501');
  }
  const result = bookingStateMachine.verifyCompleteOtp(req.params.id, vendorId || 'V9501', otp);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put(['/instant/:id/cancel', '/instant/:id/pandit-cancel', '/bookings/:id/cancel'], (req, res) => {
  const result = bookingStateMachine.cancelBooking(req.params.id, 'pandit', req.body.reason || 'Pandit cancelled');
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put(['/pandit/location', '/instant/pandit/location'], (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const bId = req.body.bookingId || req.body.id;
  if (bId) {
    const result = bookingStateMachine.updateLocation(bId, vendorId || 'V9501', req.body);
    return res.json(result);
  }
  res.json({ success: true, message: 'Pandit location updated' });
});

router.put(['/pandit/online', '/instant/pandit/online'], (req, res) => {
  const online = req.body.online !== false;
  res.json({ success: true, online, message: `Pandit is now ${online ? 'online' : 'offline'}` });
});

router.get(['/pandit/jobs', '/instant/pandit/jobs'], (req, res) => {
  const all = store.list('bookings');
  res.json({ success: true, count: all.length, jobs: all, data: all });
});

router.get(['/pandit/offer', '/instant/pandit/offer'], (req, res) => {
  const all = store.list('bookings');
  const offer = all.find(b => b.status === 'PENDING_ACCEPTANCE');
  res.json({ success: true, offer: offer ? bookingStateMachine.sanitizeForVendor(offer, false) : null });
});

router.post('/bookings/:id/start-travel', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const result = bookingStateMachine.startTravel(req.params.id, vendorId);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/bookings/:id/location', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const result = bookingStateMachine.updateLocation(req.params.id, vendorId, req.body);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/bookings/:id/arrive', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const result = bookingStateMachine.confirmArrival(req.params.id, vendorId);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/bookings/:id/verify-start-otp', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const otp = req.body.otp || req.body.startOtp;
  const result = bookingStateMachine.verifyStartOtp(req.params.id, vendorId, otp);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/bookings/:id/request-complete', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const result = bookingStateMachine.requestCompletion(req.params.id, vendorId);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/bookings/:id/verify-complete-otp', (req, res) => {
  const { vendorId } = getVendorDetails(req);
  const otp = req.body.otp || req.body.completeOtp;
  const booking = store.get('bookings', req.params.id);
  if (booking && (!booking.activeCompleteOtp || !booking.otps?.completeOtp)) {
    bookingStateMachine.requestCompletion(req.params.id, vendorId);
  }
  const result = bookingStateMachine.verifyCompleteOtp(req.params.id, vendorId, otp);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.post('/job/complete', (req, res) => {
  const bookingId = req.body.booking_id || req.body.bookingId;
  const { vendorId } = getVendorDetails(req);
  const otp = req.body.otp;
  const booking = store.get('bookings', bookingId);
  if (booking && (!booking.activeCompleteOtp || !booking.otps?.completeOtp)) {
    bookingStateMachine.requestCompletion(bookingId, vendorId);
  }
  const result = bookingStateMachine.verifyCompleteOtp(bookingId, vendorId, otp);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.get('/bookings', (req, res) => {
  const vendorId = req.auth?.sub || req.query.vendorId || req.query.id;
  const all = store.list('bookings');
  let list = all;
  if (vendorId) {
    list = all.filter(
      (b) =>
        b.assignedVendorId === vendorId ||
        b.panditId === vendorId ||
        (b.assignedVendor && b.assignedVendor.id === vendorId)
    );
  }
  const sanitized = list.map((b) => bookingStateMachine.sanitizeForVendor(b, true));
  res.json({ success: true, count: sanitized.length, bookings: sanitized, data: sanitized });
});

router.get('/bookings/active', (req, res) => {
  const vendorId = req.auth?.sub || req.query.vendorId;
  const all = store.list('bookings');
  const active = all.find(
    (b) =>
      (!vendorId || b.assignedVendorId === vendorId) &&
      b.status !== 'COMPLETED' &&
      b.status !== 'CANCELLED'
  );
  if (!active) return res.json({ success: true, booking: null, data: null });
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForVendor(active, true),
    data: bookingStateMachine.sanitizeForVendor(active, true),
  });
});

router.get('/bookings/:id', (req, res) => {
  const b = store.get('bookings', req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  const vendorId = req.auth?.sub || req.query.vendorId;
  const isAssigned = !vendorId || b.assignedVendorId === vendorId;
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForVendor(b, isAssigned),
    data: bookingStateMachine.sanitizeForVendor(b, isAssigned),
  });
});

/* ---------- Vendor Wallet, Ledger & Earnings ---------- */
router.get('/earnings', (req, res) => {
  const vendorId = req.auth?.sub || req.query.vendorId || req.query.id;
  const earningsList = store.list('vendor_earnings').filter((e) => !vendorId || e.vendorId === vendorId);
  const totalEarned = earningsList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  const walletBalance = vendor?.walletBalance != null ? Number(vendor.walletBalance) : totalEarned;

  res.json({
    success: true,
    walletBalance,
    totalEarned,
    expectedEarnings: 0,
    transactions: earningsList,
    data: {
      walletBalance,
      totalEarned,
      transactions: earningsList,
    },
  });
});

router.post('/earnings/payout', (req, res) => {
  const vendorId = req.auth?.sub || req.body.vendorId;
  const amount = Number(req.body.amount || req.body.payoutAmount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid payout amount' });
  }
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  const currentBal = Number(vendor?.walletBalance || 0);
  if (currentBal < amount) {
    return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
  }

  const updatedBal = currentBal - amount;
  if (vendor) {
    store.update('vendors', vendor.id, { walletBalance: updatedBal });
  }

  const payoutRecord = store.insert('payouts', {
    vendorId: vendor?.id || vendorId,
    vendorName: vendor?.name || 'Partner',
    amount,
    status: 'Processed',
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: 'Payout processed successfully',
    payout: payoutRecord,
    walletBalance: updatedBal,
  });
});

/* ---------- Pandit Slots ---------- */
router.get(['/pandit/slots', '/slots'], (req, res) => {
  const vendorId = req.auth?.sub || req.query.vendorId || req.query.id;
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  const slots = vendor?.slots || [];
  res.json({ success: true, count: slots.length, slots, data: slots });
});

router.post(['/pandit/slots/block', '/slots/block'], (req, res) => {
  const vendorId = req.auth?.sub || req.body.vendorId;
  const { slot_id, slotId, blocked } = req.body || {};
  const targetId = slot_id || slotId;
  const vendor = vendorId ? store.get('vendors', vendorId) : null;
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

  const currentSlots = Array.isArray(vendor.slots) ? [...vendor.slots] : [];
  const idx = currentSlots.findIndex((s) => s.id === targetId);
  if (idx !== -1) {
    currentSlots[idx].blocked = !!blocked;
  } else {
    currentSlots.push({ id: targetId, blocked: !!blocked });
  }

  const updated = store.update('vendors', vendor.id, { slots: currentSlots });
  res.json({ success: true, slots: updated.slots });
});

/* ---------- Astrologer status / rates ---------- */
router.post('/astro/status', requireAuth, (req, res) => {
  const v = store.update('vendors', req.auth.sub, { online: !!req.body.online });
  emit.toAdmin('vendor:status', { vendorId: req.auth.sub, online: req.body.online });
  res.json({ ok: true, vendor: v });
});
router.post('/astro/rates', requireAuth, (req, res) => {
  const v = store.update('vendors', req.auth.sub, { rates: req.body });
  res.json({ ok: true, vendor: v });
});

/* ---------- Merchant ---------- */
router.get('/merchant/products', requireAuth, (req, res) =>
  res.json({ data: store.list('products', { field: 'merchant', value: req.auth.name }) }));
router.post('/merchant/products', requireAuth, (req, res) =>
  res.status(201).json(store.insert('products', { ...req.body, merchant: req.auth.name })));
router.post('/merchant/order/advance', requireAuth, (req, res) => {
  const flow = ['New', 'Packed', 'Ready for Courier', 'Delivered'];
  const o = store.get('orders', req.body.order_id);
  if (!o) return res.status(404).json({ message: 'Not found' });
  const next = flow[flow.indexOf(o.status) + 1] || o.status;
  store.update('orders', o.id, { status: next });
  emit.toAdmin('order:update', { orderId: o.id, status: next });
  res.json({ ok: true, status: next });
});

/* ---------- Mandali ---------- */
router.get('/mandali/inquiries', requireAuth, (req, res) => res.json({ data: store.list('events') }));
router.post('/mandali/inquiry/respond', requireAuth, (req, res) => {
  const { inquiry_id, action } = req.body || {};
  store.update('events', inquiry_id, { status: action === 'accept' ? 'Confirmed' : 'Rejected' });
  res.json({ ok: true });
});

/* ---------- Dynamic Pujas, Rituals & Services for Partner App ---------- */
router.get('/pujas', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, count: list.length, pujas: list, data: list });
});

router.get('/pandit/puja-services', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, count: list.length, services: list, data: list, pujas: list });
});

/* ---------- Notifications & Device Tokens (FCM) ---------- */
router.get(['/notifications', '/notifications/list'], (req, res) => {
  const notifs = store.list('notifications');
  res.json({ success: true, count: notifs.length, data: notifs, notifications: notifs });
});

router.post('/device-tokens/register', (req, res) => {
  const { token, platform, vendorId, role } = req.body || {};
  if (!token) return res.status(400).json({ message: 'Device token required' });
  const row = store.insert('device_tokens', {
    token,
    platform: platform || 'android',
    vendorId: vendorId || (req.auth && req.auth.sub) || 'anonymous_partner',
    role: role || 'partner',
    updatedAt: new Date().toISOString(),
  });
  console.log(`📱 [FCM] Partner push token registered: ${token.slice(0, 16)}...`);
  res.json({ success: true, registered: true, data: row });
});

module.exports = router;
