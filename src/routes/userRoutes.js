const router = require('express').Router();
const store = require('../store');
const { requireAuth, extractAuthClaims } = require('../auth');
const { emit } = require('../sockets');

function getUserFilterKeys(req) {
  const claims = extractAuthClaims(req);
  const raw = [
    claims?.sub,
    claims?.id,
    claims?.email,
    req.query?.userId,
    req.query?.email,
    req.body?.userId,
  ];
  const ignored = new Set(['guest_user', 'anonymous', 'admin@vaidicsanskar.com', 'super admin', 'devotee']);
  const keys = Array.from(
    new Set(
      raw
        .filter((v) => v !== undefined && v !== null)
        .map((v) => String(v).trim().toLowerCase())
        .filter((v) => v && !ignored.has(v))
    )
  );
  return { claims, keys };
}

function recordMatchesUser(rec, keys, claims) {
  if (!rec || !keys.length) return false;
  const candidates = [
    rec.userId,
    rec.userEmail,
    rec.email,
    rec.buyerId,
    rec.user?.id,
    rec.user?._id,
    rec.user?.email,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  if (candidates.some((c) => keys.includes(c))) return true;
  if (!rec.userId && !rec.buyerId && claims?.name && rec.buyer) {
    return String(rec.buyer).trim().toLowerCase() === String(claims.name).trim().toLowerCase();
  }
  return false;
}

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
  const claims = extractAuthClaims(req);
  const body = req.body || {};
  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const items = Array.isArray(body.items) ? body.items : [];
  const buyerName = body.shippingAddress?.name || claims?.name || 'श्रद्धेय यजमान';
  const firstItem = items[0]?.name || body.itemName || 'वैदिक पूजा सामग्री किट';
  const totalAmt = Number(body.total || body.amount || (items[0]?.price ? items[0].price * (items[0]?.quantity || 1) : 0));

  const newOrder = store.insert('orders', {
    id: orderId,
    userId: claims?.sub || body.userId || null,
    userEmail: claims?.email || body.userEmail || null,
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
  const { claims, keys } = getUserFilterKeys(req);
  const all = store.list('orders');
  const orders = keys.length ? all.filter((o) => recordMatchesUser(o, keys, claims)) : [];
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

/* ---------- Pricing Engine Quote ---------- */
router.post(['/pricing/quote', '/bookings/quote', '/puja/quote'], (req, res) => {
  const quote = bookingStateMachine.quotePricing(req.body);
  res.json({
    success: true,
    quote,
    pricing: quote,
  });
});

/* ---------- Bookings (Uber/Rapido Pooja Engine) ---------- */
router.post(['/booking/create', '/bookings/create', '/bookings', '/instant/request'], (req, res) => {
  const claims = extractAuthClaims(req);
  const userId = claims?.sub || req.body.userId || claims?.email || claims?.name || 'guest_user';
  const payload = {
    ...req.body,
    userId,
    userEmail: claims?.email || req.body?.userEmail || null,
  };
  const booking = bookingStateMachine.createBooking(payload, userId);
  res.status(201).json({
    success: true,
    bookingId: booking.id,
    booking: bookingStateMachine.sanitizeForUser(booking),
  });
});

router.get(['/bookings/active', '/instant/active'], (req, res) => {
  const { claims, keys } = getUserFilterKeys(req);
  if (!keys.length) return res.json({ success: true, booking: null, data: null });
  const all = store.list('bookings');
  const active = all.find(
    (b) =>
      recordMatchesUser(b, keys, claims) &&
      b.status !== 'COMPLETED' &&
      b.status !== 'CANCELLED' &&
      b.status !== 'EXPIRED'
  );
  if (!active) return res.json({ success: true, booking: null, data: null });
  const sanitized = bookingStateMachine.sanitizeForUser(active);
  res.json({ success: true, booking: sanitized, data: sanitized });
});

router.get(['/booking/my', '/bookings/my'], (req, res) => {
  const { claims, keys } = getUserFilterKeys(req);
  if (!keys.length) return res.json({ success: true, data: [], bookings: [] });
  const list = store
    .list('bookings')
    .filter((b) => recordMatchesUser(b, keys, claims))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(bookingStateMachine.sanitizeForUser);
  res.json({ success: true, data: list, bookings: list });
});

router.get('/bookings/:id', (req, res) => {
  const b = bookingStateMachine.findBooking(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  const sanitized = bookingStateMachine.sanitizeForUser(b);
  res.json({ success: true, booking: sanitized, data: sanitized });
});

router.get('/booking/:id', (req, res) => {
  const b = bookingStateMachine.findBooking(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  const sanitized = bookingStateMachine.sanitizeForUser(b);
  res.json({ success: true, booking: sanitized, data: sanitized });
});

router.post('/bookings/:id/cancel', (req, res) => {
  const result = bookingStateMachine.cancelBooking(req.params.id, 'yajman', req.body.reason);
  res.status(result.success ? 200 : result.status || 400).json(result);
});

router.put('/instant/:id/cancel', (req, res) => {
  const result = bookingStateMachine.cancelBooking(req.params.id, 'yajman', req.body.reason);
  res.status(result.success ? 200 : result.status || 400).json(result);
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

/* ---------- Wallet (Zero-initialized & Live Persisted per User) ---------- */
function getUserWalletSummary(claims) {
  if (!claims?.sub) return { balance: 0, transactions: [], userRecord: null };
  const userRecord = store.get('users', claims.sub) || null;
  const tx = store
    .list('wallet_tx')
    .filter((t) => (t.userId ? t.userId === claims.sub : claims.name && t.user === claims.name))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const computedBal = tx.reduce(
    (s, t) => s + (t.type === 'credit' ? Number(t.amount || 0) : -Number(t.amount || 0)),
    0
  );
  const balance = userRecord?.wallet != null ? Number(userRecord.wallet) : Math.max(0, computedBal);
  return { balance: Math.max(0, balance), transactions: tx, userRecord };
}

router.get(['/wallet', '/wallet/balance', '/wallet/ledger'], (req, res) => {
  const claims = extractAuthClaims(req);
  const { balance, transactions } = getUserWalletSummary(claims);
  res.json({
    success: true,
    balance,
    walletBalance: balance,
    mainBalance: balance,
    bonusBalance: 0,
    transactions,
    ledger: transactions,
    data: { balance, mainBalance: balance, bonusBalance: 0, transactions },
  });
});

router.post(['/wallet/add', '/wallet/credit'], (req, res) => {
  const claims = extractAuthClaims(req);
  if (!claims?.sub) {
    return res.status(401).json({ success: false, message: 'Login required for wallet transaction' });
  }
  const amount = Number(req.body?.amount || 0);
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount' });
  }
  const { balance, userRecord } = getUserWalletSummary(claims);
  const nextBal = balance + amount;
  if (userRecord) {
    store.update('users', userRecord.id, { wallet: nextBal });
  }
  const t = store.insert('wallet_tx', {
    userId: claims.sub,
    user: claims.name || claims.email || claims.sub,
    type: 'credit',
    title: req.body?.reference || ('Added via ' + (req.body?.method || 'UPI')),
    amount,
    at: new Date().toLocaleDateString('en-IN'),
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({ success: true, balance: nextBal, transaction: t, ...t });
});

router.post('/wallet/deduct', (req, res) => {
  const claims = extractAuthClaims(req);
  if (!claims?.sub) {
    return res.status(401).json({ success: false, message: 'Login required for wallet transaction' });
  }
  const amount = Number(req.body?.amount || 0);
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount' });
  }
  const { balance, userRecord } = getUserWalletSummary(claims);
  const nextBal = Math.max(0, balance - amount);
  if (userRecord) {
    store.update('users', userRecord.id, { wallet: nextBal });
  }
  const t = store.insert('wallet_tx', {
    userId: claims.sub,
    user: claims.name || claims.email || claims.sub,
    type: 'debit',
    title: req.body?.reference || req.body?.reason || 'Consultation / Service Fee',
    amount,
    at: new Date().toLocaleDateString('en-IN'),
    createdAt: new Date().toISOString(),
  });
  res.json({ success: true, balance: nextBal, transaction: t });
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
