const router = require('express').Router();
const crudRouter = require('./crud');
const store = require('../store');
const { requireAuth, requireRole } = require('../auth');

// All admin routes require an admin token
router.use(requireAuth, requireRole('admin'));

// Dashboard summary (computed dynamically from actual store records)
router.get('/dashboard/summary', (req, res) => {
  const vendors = store.list('vendors');
  const bookings = store.list('bookings');
  const orders = store.list('orders');
  const payouts = store.list('payouts');
  const events = store.list('events');
  const reviews = store.list('reviews');

  // Compute actual gross revenue from bookings and orders
  let totalRevenue = 0;
  bookings.forEach((b) => {
    totalRevenue += Number(b.amt || b.amount || 0);
  });
  orders.forEach((o) => {
    totalRevenue += Number(o.amt || o.amount || 0);
  });

  const activeVendors = vendors.filter((v) => v.status === 'Active' || v.status === 'Verified').length;
  const kycPending = vendors.filter((v) => v.kyc === 'Pending' || v.status === 'Review').length;

  res.json({
    kpis: {
      revenue: `₹${totalRevenue.toLocaleString('en-IN')}`,
      bookings: bookings.length,
      vendors: activeVendors,
      kycPending,
    },
    queues: {
      kycPending,
      payoutsRequested: payouts.filter((p) => p.status === 'Requested').length,
      eventsPending: events.filter((e) => e.status === 'Pending').length,
      reviewsFlagged: reviews.filter((r) => r.status === 'Flagged').length,
    },
    months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    revenue: [0, 0, 0, 0, 0, totalRevenue],
    bookingsTrend: [0, 0, 0, 0, 0, bookings.length],
    roles: [
      { n: 'Pandit', v: vendors.filter((v) => v.role === 'pandit').length, c: '#8B1A1A' },
      { n: 'Merchant', v: vendors.filter((v) => v.role === 'merchant').length, c: '#AD1457' },
      { n: 'Mandali', v: vendors.filter((v) => v.role === 'mandali').length, c: '#0277BD' },
      { n: 'Astrologer', v: vendors.filter((v) => v.role === 'astro').length, c: '#6A1B9A' },
    ],
  });
});

// Database reset / wipe endpoint for real users only
router.post(['/system/clear-database', '/database/clear'], async (req, res) => {
  try {
    await store.clearAllData();
    const { emit } = require('../sockets');
    emit.toAdmin('database:cleared', { ts: Date.now() });
    res.json({ success: true, message: 'All users and test records successfully cleared from database.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear database: ' + err.message });
  }
});

// Every resource the admin console manages
['users', 'vendors', 'bookings', 'jobs', 'orders', 'products', 'sessions', 'subs',
  'temples', 'donations', 'events', 'payouts', 'reviews', 'library', 'banners']
  .forEach((c) => router.use('/' + c, crudRouter(c)));

// Convenient aliases for backward and forward compatibility
router.use('/subscriptions', crudRouter('subs'));
router.use('/vartalap/sessions', crudRouter('sessions'));

module.exports = router;
