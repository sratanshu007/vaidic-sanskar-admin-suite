# Vaidic Sanskar — Backend + Admin Suite

One Node.js service that powers **all three** clients and ships a **complete
admin panel built in**:

- **REST API + Socket.IO** for the User app and the Partner app
- **Admin panel** served at **`/admin`** (login, every section, live API-backed)

Runs with **no database** out of the box (seeded in-memory store), so you can
start it and click through everything in one command. Swap to MongoDB when
ready — the routes don't change.

---

## 1. Run

```bash
npm install
cp .env.example .env     # optional; sensible defaults work
npm start
```

Then open:
- **Admin panel** → http://localhost:4000/admin  (login: `admin@vaidicsanskar.com` / `admin123`)
- **API base**    → http://localhost:4000/api
- **Socket.IO**   → ws://localhost:4000

---

## 2. Point the apps & admin at this server

| Client | Base URL to set |
|--------|-----------------|
| User app (`VaidicSanskar`) | `src/services/api.js` → `BASE_URL = http://<host>:4000/api/` |
| Partner app (`VaidicSanskarPartner`) | `src/services/api.js` → `BASE_URL = http://<host>:4000/api/partner/` |
| Admin (React build, optional) | `.env` → `VITE_API_BASE_URL = http://<host>:4000/api/admin/` |
| Socket (both apps) | `src/services/socket.js` → `WS_URL = ws://<host>:4000`, `mock=false` |

The built-in `/admin` panel already uses this server (relative `/api/admin/`), so
it needs no configuration.

---

## 3. Endpoint map

**Auth** (mounted at `/api/auth`, `/api/admin/auth`, `/api/partner/auth`, `/api/otp`)
- `POST login` `{email,password}` → `{token,user}` (admin)
- `POST send-otp` `{phone}` · `POST verify-otp` `{phone,otp,role}` → `{token,profile}`
- `GET me`

**Admin** `/api/admin/*` (requires admin token)
- `GET dashboard/summary`
- CRUD for: `users, vendors, bookings, jobs, orders, products, sessions, subs,
  temples, donations, events, payouts, reviews, library, banners`
  (`GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`)

**Partner** `/api/partner/*`
- `POST vendor/register`, `POST vendor/kyc/upload`
- `POST job/accept|decline|complete`
- `POST astro/status`, `POST astro/rates`
- `GET/POST merchant/products`, `POST merchant/order/advance`
- `GET mandali/inquiries`, `POST mandali/inquiry/respond`
- `GET earnings`, `POST earnings/payout`

**User** `/api/*`
- Catalog: `GET pandit/list`, `puja/list`, `estore/products`, `temple/list`,
  `library/list`, `vartalap/astrologers`
- `POST booking/create` · `GET booking/my` · `POST booking/verify-otp`
- `POST order/create` · `GET order/track/:id`
- `GET wallet` · `POST wallet/add`
- `POST kundali/match`, `POST donation/create`
- `POST payment/create-order`, `POST payment/verify` (Razorpay stubs)

---

## 4. Real-time (Socket.IO)

Connect with `io(URL, { query: { role, id } })`. Rooms: `user:<id>`,
`vendor:<id>`, `role:pandit`, `admin`. Server emits:
`job:broadcast`, `job:taken`, `booking:assigned`, `chat:message`,
`order:update`, `call:incoming`, `earnings:update`. Creating a booking
(`POST booking/create`) emits a `job:broadcast` to pandits automatically — so the
Partner app's broadcast overlay fires from a real user action end-to-end.

---

## 5. Switching to MongoDB

`src/store.js` is a small repository with five methods
(`list/get/insert/update/remove`). Replace its body with Mongoose calls:

```js
// example
const Model = { users: UserModel, vendors: VendorModel, /* … */ };
list = (name, q) => Model[name].find(buildFilter(q)).lean();
get  = (name, id) => Model[name].findOne({ id });
// …etc
```

Set `MONGODB_URI` in `.env`, connect in `server.js`, and define Mongoose schemas
per collection in `src/seed.js`'s shape. **Routes stay untouched.**

---

## 6. Production notes

- Set a strong `JWT_SECRET` and real `ADMIN_*` creds; store admins in the DB with
  hashed passwords (bcrypt) — the env admin is a bootstrap only.
- Enforce roles on the server (already via `requireRole`) — never rely on the UI.
- Put real integrations behind the stubs: SMS (OTP), Razorpay (payments/payouts),
  file storage (KYC/product images), FCM (push), and geofencing (match jobs to
  vendor location before `job:broadcast`).
- Serve behind HTTPS; lock `CORS_ORIGIN` to your real app/web origins.

---

## 7. Structure
```
src/
  server.js      app + routes + socket.io + serves /admin
  config.js      env
  store.js       in-memory repository (swap for Mongo)
  seed.js        seed data
  auth.js        JWT sign/verify + requireAuth/requireRole
  sockets.js     real-time rooms + emit helpers
  routes/        authRoutes, adminRoutes, partnerRoutes, userRoutes, crud
public/
  admin.html     complete admin panel (served at /admin)
```
