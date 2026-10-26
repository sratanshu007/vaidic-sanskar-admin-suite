const router = require('express').Router();
const store = require('../store');
const { requireAuth } = require('../auth');
const { emit } = require('../sockets');

/* ---------- Catalog & Discovery (Only Approved Partners Visible to Users) ---------- */
function getApprovedVendors(roleFilter) {
  return store.list('vendors').filter((v) => {
    const isApproved = v.status === 'Active' || v.kyc === 'Verified';
    if (!isApproved) return false;
    if (!roleFilter) return true;
    const filter = String(roleFilter).toLowerCase();
    if (filter === 'astrologer' || filter === 'astro') {
      return v.role === 'astro' || v.role === 'astrologer' || (Array.isArray(v.services) && v.services.includes('astro'));
    }
    return v.role === filter || (Array.isArray(v.services) && v.services.includes(filter));
  });
}

router.get('/discovery/role/:role', (req, res) => {
  const list = getApprovedVendors(req.params.role.toLowerCase());
  res.json({ success: true, count: list.length, vendors: list, data: list });
});
router.get('/discovery/vendors', (req, res) => {
  const list = getApprovedVendors(req.query.role);
  res.json({ success: true, count: list.length, vendors: list, data: list });
});
router.get('/discovery/vendors/:id', (req, res) => {
  const v = store.get('vendors', req.params.id);
  if (!v || (v.status !== 'Active' && v.kyc !== 'Verified')) {
    return res.status(404).json({ message: 'Vendor not found or awaiting approval' });
  }
  res.json({ success: true, vendor: v, data: v });
});

router.get('/pandit/list', (req, res) => res.json({ data: getApprovedVendors('pandit'), vendors: getApprovedVendors('pandit') }));
router.get('/vartalap/astrologers', (req, res) => res.json({ data: getApprovedVendors('astro'), vendors: getApprovedVendors('astro') }));
router.get('/mandali/list', (req, res) => res.json({ data: getApprovedVendors('mandali'), vendors: getApprovedVendors('mandali') }));
router.get('/puja/list', (req, res) => res.json({ data: store.list('pujas'), pujas: store.list('pujas') }));
router.get('/pujas', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, count: list.length, pujas: list, data: list });
});
router.get('/rituals', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, count: list.length, rituals: list, data: list });
});
router.get('/pujas/:id', (req, res) => {
  const p = store.get('pujas', req.params.id) || store.list('pujas').find(x => x.id === req.params.id || x._id === req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'Pooja not found' });
  res.json({ success: true, data: p, puja: p });
});
router.get('/services', (req, res) => {
  const list = store.list('services');
  res.json({ success: true, services: list, data: list });
});
router.get('/pandit/puja-services', (req, res) => {
  const list = store.list('pujas');
  res.json({ success: true, services: list, data: list, pujas: list });
});
router.get('/discovery/stats', (req, res) => {
  res.json({
    success: true,
    panditsCount: store.list('vendors').filter(v => v.role === 'pandit').length,
    pujasCount: store.list('pujas').length,
    activeBookingsCount: store.list('bookings').filter(b => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length,
  });
});
router.get(['/estore/products', '/store/products', '/store/home', '/store/categories'], (req, res) => {
  const prods = store.list('products', req.query);
  res.json({ success: true, count: prods.length, products: prods, data: prods, categories: [] });
});
router.get(['/store/products/:id', '/estore/products/:id'], (req, res) => {
  const p = store.get('products', req.params.id) || store.list('products').find(x => x.id === req.params.id || x._id === req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, product: p, data: p });
});

/* ---------- E-Store Checkout & Orders ---------- */
router.post(['/store/checkout', '/estore/checkout', '/store/orders'], (req, res) => {
  const body = req.body || {};
  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const items = Array.isArray(body.items) ? body.items : [];
  const buyerName = body.shippingAddress?.name || req.auth?.name || 'श्रद्धेय यजमान';
  const firstItem = items[0]?.name || body.itemName || 'वैदिक पूजा सामग्री किट';
  const totalAmt = Number(body.total || body.amount || (items[0]?.price ? items[0].price * (items[0]?.quantity || 1) : 850));

  const newOrder = store.insert('orders', {
    id: orderId,
    buyer: buyerName,
    item: firstItem,
    merchant: 'Vaidic Sanskar Official',
    amt: totalAmt,
    status: 'New',
    city: body.shippingAddress?.city || 'वाराणसी',
    shippingAddress: body.shippingAddress,
    items,
    paymentMethod: body.paymentMethod || 'UPI',
    createdAt: new Date().toISOString(),
  });

  try {
    const { emit } = require('../sockets');
    emit.toAdmin('order:new', newOrder);
    emit.broadcast('order:new', newOrder);
  } catch (_) {}

  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    orders: [newOrder],
    order: newOrder,
    data: newOrder,
  });
});

router.get(['/store/orders', '/estore/orders'], (req, res) => {
  const orders = store.list('orders');
  res.json({ success: true, count: orders.length, orders, data: orders });
});

router.get(['/store/orders/:id', '/estore/orders/:id'], (req, res) => {
  const o = store.get('orders', req.params.id) || store.list('orders').find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order: o, data: o });
});

router.get('/temple/list', (req, res) => res.json({ data: store.list('temples') }));
router.get('/library/list', (req, res) => res.json({ data: store.list('library', { field: 'status', value: 'Published' }) }));

const bookingStateMachine = require('../services/bookingStateMachine');

/* ---------- Bookings (Uber/Rapido Pooja Engine) ---------- */
router.post(['/booking/create', '/bookings/create', '/bookings', '/instant/request'], (req, res) => {
  const userId = req.auth?.name || req.auth?.sub || req.body.userId || 'guest_user';
  const booking = bookingStateMachine.createBooking(req.body, userId);
  res.status(201).json({
    success: true,
    bookingId: booking.id,
    booking: bookingStateMachine.sanitizeForUser(booking),
  });
});

router.get('/bookings/active', (req, res) => {
  const all = store.list('bookings');
  const active = all.find(
    (b) =>
      b.status !== 'COMPLETED' &&
      b.status !== 'CANCELLED' &&
      b.status !== 'EXPIRED'
  );
  if (!active) return res.json({ success: true, booking: null });
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForUser(active),
  });
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

router.get('/bookings/:id', (req, res) => {
  const b = store.get('bookings', req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForUser(b),
    data: bookingStateMachine.sanitizeForUser(b),
  });
});

router.get('/booking/:id', (req, res) => {
  const b = store.get('bookings', req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  res.json({
    success: true,
    booking: bookingStateMachine.sanitizeForUser(b),
    data: bookingStateMachine.sanitizeForUser(b),
  });
});

router.post('/bookings/:id/cancel', (req, res) => {
  const result = bookingStateMachine.cancelBooking(req.params.id, 'yajman', req.body.reason);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put('/instant/:id/cancel', (req, res) => {
  const result = bookingStateMachine.cancelBooking(req.params.id, 'yajman', req.body.reason);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.get('/booking/my', (req, res) => {
  const list = store.list('bookings').map(bookingStateMachine.sanitizeForUser);
  res.json({ success: true, data: list, bookings: list });
});

router.get('/bookings/my', (req, res) => {
  const list = store.list('bookings').map(bookingStateMachine.sanitizeForUser);
  res.json({ success: true, data: list, bookings: list });
});

/* ---------- Orders ---------- */
router.post('/order/create', requireAuth, (req, res) => {
  const o = store.insert('orders', { ...req.body, buyer: req.auth.name, status: 'New' });
  emit.toAdmin('order:new', o);
  res.status(201).json(o);
});
router.get('/order/track/:id', (req, res) => {
  const o = store.get('orders', req.params.id);
  o ? res.json(o) : res.status(404).json({ message: 'Not found' });
});

/* ---------- Wallet ---------- */
router.get('/wallet', requireAuth, (req, res) => {
  const tx = store.list('wallet_tx', { field: 'user', value: req.auth.name });
  const bal = tx.reduce((s, t) => s + (t.type === 'credit' ? t.amount : -t.amount), 0);
  res.json({ balance: bal, transactions: tx });
});
router.post('/wallet/add', requireAuth, (req, res) => {
  const t = store.insert('wallet_tx', { user: req.auth.name, type: 'credit', title: 'Added via ' + (req.body.method || 'UPI'), amount: req.body.amount, at: new Date().toLocaleDateString('en-IN') });
  res.status(201).json(t);
});

/* ---------- Kundali / donation (stubs) ---------- */
router.post('/kundali/match', (req, res) => res.json({ score: 28, outOf: 36, verdict: 'Excellent Match' }));
router.post('/donation/create', requireAuth, (req, res) => res.status(201).json(store.insert('donations', { ...req.body, user: req.auth.name, status: 'Received' })));

/* ---------- Payments (Razorpay stub) ---------- */
router.post('/payment/create-order', requireAuth, (req, res) => {
  // Developer: call Razorpay Orders API here with your key_secret (server-side).
  res.json({ order_id: 'order_' + Date.now(), amount: req.body.amount, currency: 'INR', key_id: 'rzp_test_XXXXXXXX' });
});
router.post('/payment/verify', requireAuth, (req, res) => {
  // Developer: verify razorpay_signature with HMAC-SHA256(order_id|payment_id, key_secret).
  res.json({ verified: true });
});

/* ---------- Notifications & Push Tokens (FCM) ---------- */
router.get('/notifications', (req, res) => {
  const notifs = store.list('notifications');
  res.json({ success: true, count: notifs.length, data: notifs, notifications: notifs });
});

router.get('/notifications/unread-count', (req, res) => {
  const count = store.list('notifications').filter((n) => !n.read).length;
  res.json({ success: true, count });
});

router.put(['/notifications/read-all', '/notifications/read'], (req, res) => {
  const notifs = store.list('notifications');
  notifs.forEach((n) => {
    store.update('notifications', n.id, { read: true });
  });
  res.json({ success: true, message: 'All notifications marked as read' });
});

router.post('/device-tokens/register', (req, res) => {
  const { token, platform, userId, role } = req.body || {};
  if (!token) return res.status(400).json({ message: 'Device token required' });
  const row = store.insert('device_tokens', {
    token,
    platform: platform || 'android',
    userId: userId || 'anonymous',
    role: role || 'user',
    updatedAt: new Date().toISOString(),
  });
  console.log(`📱 [FCM] Device push token registered for ${userId || 'user'}: ${token.slice(0, 16)}...`);
  res.json({ success: true, registered: true, data: row });
});

router.post('/notifications/send', (req, res) => {
  const { title, message, type, recipientId, otp, role } = req.body || {};
  const notif = store.insert('notifications', {
    title: title || 'वैदिक संस्कार सूचना',
    message: message || '',
    type: type || 'info',
    otp: otp || null,
    recipientId: recipientId || 'all',
    role: role || 'all',
    createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' }),
    read: false,
  });

  // Broadcast to realtime sockets
  emit.broadcast('notification:received', notif);
  if (role) emit.broadcast(`${role}:notification`, notif);

  res.status(201).json({ success: true, notification: notif });
});

module.exports = router;
