# VaidicSanskar — Uber/Rapido-Style Pooja Booking & Pandit Tracking System

## Executive Overview
VaidicSanskar provides an Indian spiritual services platform connecting devotees with certified Vedic scholars for rituals, havans, and poojas. 

The booking experience follows the **Uber / Rapido product paradigm**:
1. **User books service first** (Ritual, Muhurat, GPS Location, and Samagri preference).
2. **System searches for a pandit second** (Radial dispatch waves: 5 km → 10 km → 20 km).
3. **Pandit details appear ONLY after acceptance** (No catalogue of unassigned pandits before booking).
4. **Strict privacy protection**: Pandit's personal phone number is **NEVER** displayed on tracking or review screens; communication is routed via in-app chat or a masked virtual call bridge.
5. **Two Cryptographic OTP Checkpoints**:
   - **OTP 1 (Start OTP)**: Activated *only* after verified vendor arrival (`ARRIVED` state).
   - **OTP 2 (Complete OTP)**: Activated *only* when pandit requests completion during `POOJA_STARTED`.

---

## 1. Canonical Booking State Machine

```
[DRAFT]
   │
   ▼
[PENDING_ACCEPTANCE] ──(No pandit accepted / 3 waves)──► [EXPIRED / NO_PANDIT_FOUND]
   │                                                             │
   │ (Atomic Vendor Acceptance Lock)                             ▼ (100% Instant Refund)
   ▼
[ACCEPTED] ───────────(User cancels < 3m)────────────────► [CANCELLED] (100% Refund)
   │
   │ (Vendor starts travel)
   ▼
[EN_ROUTE] ───────────(User cancels on the way)──────────► [CANCELLED] (₹100 Travel fee to Pandit)
   │
   │ (Vendor arrives within 200m geofence)
   ▼
[ARRIVED] ────────────(User cancels at door)─────────────► [CANCELLED] (50% Dakshina to Pandit)
   │
   │ (Start OTP 1 verified by server)
   ▼
[POOJA_STARTED] ──────(Dispute raised)───────────────────► [DISPUTED] (Support Intervention)
   │
   │ (Pandit requests completion & Complete OTP 2 verified)
   ▼
[COMPLETED] ──────────► [Vendor Earnings Credited] ──► [Dual Ratings & Reviews]
```

### State Transition Rules & Authorization
| Transition | Authorized Actor | Pre-condition | Concurrency & Security Rule |
| :--- | :--- | :--- | :--- |
| `DRAFT` → `PENDING_ACCEPTANCE` | Devotee (User) | Valid pooja, date, address, samagri | Generates Ref `#BK-...`, triggers dispatch wave |
| `PENDING_ACCEPTANCE` → `ACCEPTED` | Vendor (Pandit) | Request not expired | **Atomic memory lock (`assignmentLocks`)**; 2nd candidate gets `409 Conflict` |
| `ACCEPTED` → `EN_ROUTE` | Vendor (Pandit) | Vendor is assigned | Activates live GPS tracking stream |
| `EN_ROUTE` → `ARRIVED` | Vendor (Pandit) | Geofence within 200m | **Generates Start OTP (OTP 1)**; delivered *only* to user app |
| `ARRIVED` → `POOJA_STARTED` | Vendor (Pandit) | Enters valid Start OTP | **HMAC-SHA256 salted hash check**; single-use consumption; max 5 attempts |
| `POOJA_STARTED` → `COMPLETED` | Vendor (Pandit) | Enters valid Complete OTP | **Generates Complete OTP (OTP 2)**; validates purpose isolation; credits vendor ledger |

---

## 2. Screen Implementation Mapping

### User App (`VaidicSanskar-v2/frontend`)
- **Screen 1: Home** (`src/screens/HomeScreen.js`): Service location, search for rituals, quick booking CTA, and **Active Booking Resume Banner** linking into live tracking.
- **Screen 2: Select Pooja** (`src/screens/pandit/PujaBrowseScreen.js`): Satyanarayan, Griha Pravesh, Ganesh, Rudrabhishek, Havan, Vivah Sanskar, Lakshmi Kuber, Navgrah Shanti. No unassigned pandit directory.
- **Screen 3: Confirm Requirements** (`src/screens/pandit/PujaBookingScreen.js`): Date, time slot, full address with GPS pin, participants, special instructions, and explicit **Option A (Pandit brings samagri + fee)** vs **Option B (User arranges + 9-item checklist modal)**.
- **Screen 4: Booking Summary** (`src/screens/pandit/BookingReviewScreen.js`): Itemized dakshina, platform fee, 5% GST, samagri charge, and **"Confirm and Find Pandit"** button with double-tap lock.
- **Screen 5: Finding Pandit** (`src/screens/pandit/SearchingScreen.js`): Uber-style pulsing radar ripples, booking reference, matching waves (5km → 10km → 20km), live socket listener, and 100% instant refund cancellation.
- **Screen 6 & 7: Assigned & En Route** (`src/screens/pandit/BookingStatusScreen.js` + `src/components/LiveTrackingMapView.js`): Pandit identity (photo, rating, gurukul; **zero personal phone numbers**), live Leaflet map with vehicle pin, route polyline, distance in km, ETA in minutes.
- **Screen 11: Pandit Has Arrived** (`BookingStatusScreen.js`): Displays "Your Pandit Has Arrived" and 4-digit **Start OTP (OTP 1)**.
- **Screen 12: Pooja in Progress** (`BookingStatusScreen.js`): Live elapsed timer, mantras status, sacred fire emblem.
- **Screen 13: Pooja Completion** (`BookingStatusScreen.js`): Displays **Complete OTP (OTP 2)** for user to hand over to pandit, followed by review modal.

### Vendor App (`VaidicSanskarPartner`)
- **Screen 8: Vendor Dashboard** (`src/screens/dashboard/HomeScreen.js`): Online/Offline toggle, earnings summary, today's bookings.
- **Screen 9: Incoming Request** (`src/components/IncomingRequestModal.js`): 30s countdown bar, ritual name, broad area (exact address locked until acceptance), net earnings, Accept / Reject buttons.
- **Screen 10: Vendor Navigation & Arrival** (`src/screens/pandit/ActiveJobScreen.js`): Turn-by-turn navigation, route distance, and prominent **"I've Arrived at Location"** button.
- **Screen 11 & 12: Start OTP Entry** (`ActiveJobScreen.js`): 4-digit input verifying OTP 1, starting ritual timer.
- **Screen 13: Complete Pooja & OTP 2** (`ActiveJobScreen.js`): Taps "Complete Pooja" to request OTP 2, enters code, and finalizes earnings.

---

## 3. Backend REST & WebSocket API Reference

### User Endpoints
- `POST /api/bookings/create`: Initiates booking request in `PENDING_ACCEPTANCE`.
- `GET /api/bookings/active`: Returns user's currently active booking (sanitized: no phone numbers).
- `GET /api/bookings/:id`: Returns booking details by ID.
- `POST /api/bookings/:id/cancel`: Cancels booking with PRD refund rules.

### Partner Endpoints
- `POST /api/partner/bookings/:id/accept`: **Atomic vendor acceptance**. Returns `409` if already assigned.
- `POST /api/partner/bookings/:id/start-travel`: Moves status to `EN_ROUTE`.
- `POST /api/partner/bookings/:id/location`: Broadcasts live coordinates to booking room.
- `POST /api/partner/bookings/:id/arrive`: Moves status to `ARRIVED` and activates Start OTP.
- `POST /api/partner/bookings/:id/verify-start-otp`: Verifies OTP 1 -> moves to `POOJA_STARTED`.
- `POST /api/partner/bookings/:id/request-complete`: Requests Completion OTP from user.
- `POST /api/partner/bookings/:id/verify-complete-otp`: Verifies OTP 2 -> moves to `COMPLETED` and credits ledger.

### WebSocket Rooms (`Socket.IO`)
- `subscribe:booking { bookingId }`: Joins private authorized room `booking:<id>`.
- `booking:accepted`: Emitted to devotee when pandit accepts.
- `booking:location`: Streams `{ vendorLatitude, vendorLongitude, distanceKm, etaMinutes }`.
- `booking:arrived`: Emitted when pandit arrives with Start OTP.
- `booking:pooja_started`: Emitted when Start OTP verified.
- `booking:completion_requested`: Emitted to devotee with Complete OTP.
- `booking:completed`: Emitted when Complete OTP verified.

---

## 4. Local Setup & Testing Instructions

### 1. Backend (`vaidic-sanskar-admin-suite`)
```bash
cd /Users/sratanshushukla/Downloads/vaidic-sanskar-admin-suite
npm install
node test/bookingStateMachine.test.js # Run the 9 automated audit tests
npm run dev                          # Starts server on http://localhost:4000
```
Admin Dashboard is accessible at `http://localhost:4000/admin`.

### 2. User App (`VaidicSanskar-v2/frontend`)
```bash
cd /Users/sratanshushukla/Downloads/VaidicSanskar-v2/frontend
npm install
npx expo start -c
```

### 3. Partner App (`VaidicSanskarPartner`)
```bash
cd /Users/sratanshushukla/Downloads/VaidicSanskarPartner
npm install
npx expo start -c
```

---

## 5. Android APK Build Instructions (EAS Build)

To generate standalone production APKs for testing on real Android hardware:

1. Install EAS CLI:
```bash
npm install -g eas-cli
```
2. Log in to Expo:
```bash
eas login
```
3. Configure `eas.json` for APK preview generation:
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```
4. Build User App APK:
```bash
cd /Users/sratanshushukla/Downloads/VaidicSanskar-v2/frontend
eas build -p android --profile preview
```
5. Build Partner App APK:
```bash
cd /Users/sratanshushukla/Downloads/VaidicSanskarPartner
eas build -p android --profile preview
```
Download the resulting `.apk` file onto physical devices to verify end-to-end live tracking.
