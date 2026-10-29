const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { PORT, CORS_ORIGIN } = require('./config');
const { initSockets } = require('./sockets');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const userRoutes = require('./routes/userRoutes');
const agoraRoutes = require('./routes/agoraRoutes');

const multer = require('multer');
const { uploadToCloudinary } = require('./services/cloudinaryService');

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- Global Multi-Angle Image & Document Upload Handler ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB total limit
});

app.post(['/api/upload', '/api/admin/upload', '/api/store/upload'], upload.any(), async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const folder = req.body?.folder || 'vaidic_sanskar_products';
    const uploadPromises = files.map(async (file) => {
      const ext = '.' + ((file.originalname || 'product.jpg').split('.').pop() || 'jpg');
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
    console.error('Server upload handler error:', err);
    res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

/* ---------------- API ROUTES ----------------
 * Base paths match what each client calls:
 *   User app     → /api/            (catalog, booking, order, wallet, payment)
 *   Partner app  → /api/partner/    (vendor, job, astro, merchant, earnings)
 *   Admin panel  → /api/admin/      (CRUD for every resource + dashboard)
 *   Auth (shared)→ /api/auth, /api/partner/auth, /api/admin/auth
 */
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', authRoutes);
app.use('/api/partner/auth', authRoutes);
app.use('/api/otp', authRoutes); // send-otp / verify-otp
app.use('/api/partner', authRoutes); // direct partner auth endpoints like /register-account, /login, /send-email-otp

app.use('/api/admin', adminRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api', userRoutes);

/* ---------------- REACT ADMIN CONSOLE ----------------
 * Unified single dashboard: Serves the modern React Admin app directly
 * from vaidic-sanskar-admin/dist (or fallback to /public).
 */
// Redirect any old direct requests for admin.html to /admin
app.get(['/admin.html', '/admin-old.html'], (req, res) => res.redirect('/admin'));

const adminDistDir = path.join(__dirname, '..', '..', 'vaidic-sanskar-admin', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const primaryStaticDir = fs.existsSync(adminDistDir) ? adminDistDir : publicDir;

app.use(express.static(primaryStaticDir));
app.use(express.static(publicDir));

const getIndexHtml = () => {
  return fs.existsSync(path.join(primaryStaticDir, 'index.html'))
    ? path.join(primaryStaticDir, 'index.html')
    : path.join(publicDir, 'index.html');
};

// React Admin SPA routes
app.get(['/', '/admin', '/admin/*', '/app', '/app/*'], (req, res) => {
  res.sendFile(getIndexHtml());
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));

// Client-side routing fallback for React Admin (e.g. /products, /orders, /vendors, /users, /login)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(getIndexHtml());
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') } });
initSockets(io);

const { connectDB } = require('./db');
const store = require('./store');
const { verifySmtp } = require('./services/emailService');

server.listen(PORT, async () => {
  console.log(`\n  🕉  Vaidic Sanskar backend running`);
  console.log(`  →  API     http://localhost:${PORT}/api`);
  console.log(`  →  Admin   http://localhost:${PORT}/admin`);
  console.log(`  →  Socket  ws://localhost:${PORT}\n`);

  // Verify SMTP Email connectivity in background
  verifySmtp().catch(() => {});

  // Connect MongoDB if MONGODB_URI is provided
  const connected = await connectDB();
  if (connected) {
    await store.hydrateFromDB();
  }
});
