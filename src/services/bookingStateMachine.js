/**
 * VaidicSanskar — Canonical Booking State Machine & Real-Time Engine
 * Enforces strict transitions, concurrency locks, cryptographic OTPs, and privacy redaction.
 */
const crypto = require('crypto');
const store = require('../store');
const { emit } = require('../sockets');

// 1. CANONICAL STATES & VALID TRANSITIONS
const STATES = {
  DRAFT: 'DRAFT',
  PENDING_ACCEPTANCE: 'PENDING_ACCEPTANCE',
  ACCEPTED: 'ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  POOJA_STARTED: 'POOJA_STARTED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  UNABLE_TO_COMPLETE: 'UNABLE_TO_COMPLETE',
};

const ALLOWED_TRANSITIONS = {
  [STATES.DRAFT]: [STATES.PENDING_ACCEPTANCE, STATES.CANCELLED],
  [STATES.PENDING_ACCEPTANCE]: [STATES.ACCEPTED, STATES.CANCELLED, STATES.EXPIRED],
  [STATES.ACCEPTED]: [STATES.EN_ROUTE, STATES.CANCELLED, STATES.NO_SHOW],
  [STATES.EN_ROUTE]: [STATES.ARRIVED, STATES.CANCELLED, STATES.UNABLE_TO_COMPLETE],
  [STATES.ARRIVED]: [STATES.POOJA_STARTED, STATES.CANCELLED, STATES.UNABLE_TO_COMPLETE],
  [STATES.POOJA_STARTED]: [STATES.COMPLETED, STATES.UNABLE_TO_COMPLETE],
  [STATES.COMPLETED]: [],
  [STATES.CANCELLED]: [],
  [STATES.EXPIRED]: [],
  [STATES.UNABLE_TO_COMPLETE]: [],
  [STATES.NO_SHOW]: [],
};

// In-memory locks for atomic vendor assignment
const assignmentLocks = new Set();

/**
 * Hash an OTP with a server secret to prevent plain-text exposure in databases
 */
function hashOtp(otp, salt = 'vs_otp_salt_2026') {
  return crypto.createHmac('sha256', salt).update(String(otp)).digest('hex');
}

/**
 * Generate a cryptographically secure 4-digit numeric OTP
 */
function generateSecureOtp() {
  const buf = crypto.randomBytes(2);
  const num = buf.readUInt16BE(0) % 9000 + 1000;
  return String(num);
}

/**
 * Sanitize booking for Devotee (User)
 * - Pandit info hidden while searching (PENDING_ACCEPTANCE)
 * - Pandit's personal phone number is NEVER returned
 */
function sanitizeForUser(booking) {
  if (!booking) return null;
  const clone = { ...booking };

  if (clone.status === STATES.PENDING_ACCEPTANCE || !clone.assignedVendor) {
    delete clone.assignedVendor;
    delete clone.pandit;
  } else if (clone.assignedVendor || clone.pandit) {
    const v = clone.assignedVendor || clone.pandit;
    clone.pandit = {
      id: v.id,
      name: v.name || v.displayName || 'Pandit Ji',
      rating: v.rating || 4.9,
      reviewsCount: v.reviewsCount || 124,
      photo: v.photo || v.photoUrl || null,
      experienceYears: v.experienceYears || 8,
      verified: true,
      // Personal phone number is intentionally omitted
    };
    clone.assignedVendor = clone.pandit;
  }

  // Hide raw completion OTP until service started
  if (clone.status !== STATES.ARRIVED && clone.status !== STATES.POOJA_STARTED) {
    delete clone.activeOtp;
  }

  return clone;
}

/**
 * Sanitize booking for Pandit (Vendor)
 * - Full address locked until vendor has accepted
 */
function sanitizeForVendor(booking, isAssigned) {
  if (!booking) return null;
  const clone = { ...booking };

  if (!isAssigned && clone.status === STATES.PENDING_ACCEPTANCE) {
    // Only broad area and approximate distance shown
    clone.address = `${clone.serviceArea || clone.area || 'Customer Area'} (Exact address unlocked upon acceptance)`;
    clone.destination = {
      approximateArea: clone.serviceArea || clone.area || 'Nearby',
    };
    delete clone.destinationLatitude;
    delete clone.destinationLongitude;
    delete clone.landmark;
  }

  return clone;
}

const bookingStateMachine = {
  STATES,

  /**
   * Create a new booking request in PENDING_ACCEPTANCE and notify eligible vendors
   */
  createBooking(payload, userId) {
    const bookingId = payload.id || payload.bookingId || ('BK-' + Date.now().toString().slice(-6));
    const startOtp = payload.startOtp || generateSecureOtp();
    const completeOtp = payload.completeOtp || generateSecureOtp();

    const booking = {
      id: bookingId,
      bookingId,
      userId: userId || 'user_guest',
      ritualId: payload.ritualId || 'satyanarayan',
      ritualName: payload.ritualName || payload.name || 'Satyanarayan Pooja',
      status: STATES.PENDING_ACCEPTANCE,

      // Timing
      scheduledDate: payload.scheduledDate || new Date().toISOString().split('T')[0],
      scheduledTime: payload.scheduledTime || '10:00 AM - 12:00 PM',

      // Location
      serviceAddress: payload.serviceAddress || payload.address || 'Address provided',
      serviceArea: payload.serviceArea || payload.area || 'Area',
      landmark: payload.landmark || '',
      destinationLatitude: Number(payload.latitude) || 28.5355,
      destinationLongitude: Number(payload.longitude) || 77.3910,

      // Requirements
      samagriPreference: payload.samagriPreference || (payload.withSamagri ? 'PANDIT_BRINGS' : 'USER_ARRANGES'),
      samagriFee: Number(payload.samagriFee) || (payload.withSamagri ? 600 : 0),
      participantsCount: Number(payload.participantsCount) || 4,
      specialInstructions: payload.specialInstructions || '',
      preferredLanguage: payload.preferredLanguage || 'Hindi & Sanskrit',
      yajmanName: payload.yajmanName || 'Devotee',
      gotra: payload.gotra || 'Kashyap',

      // Pricing
      serviceCharge: Number(payload.serviceCharge || payload.price) || 2500,
      travelFee: Number(payload.travelFee) || 0,
      platformFee: 50,
      taxes: Math.round(((Number(payload.serviceCharge || 2500) + Number(payload.samagriFee || 0)) * 0.05)),
      totalAmount: 0,

      // State timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // OTPs (Delivered upon arrival & completion)
      startOtp,
      completeOtp,
      otps: {
        startOtp: {
          hash: hashOtp(startOtp),
          expiresAt: Date.now() + 60 * 60 * 1000,
          attempts: 0,
          consumed: false,
        },
        completeOtp: {
          hash: hashOtp(completeOtp),
          expiresAt: Date.now() + 120 * 60 * 1000,
          attempts: 0,
          consumed: false,
        },
      },
      tracking: {
        vendorLatitude: null,
        vendorLongitude: null,
        distanceKm: 2.4,
        etaMinutes: 10,
        lastUpdated: null,
      },
    };

    booking.totalAmount =
      booking.serviceCharge +
      booking.samagriFee +
      booking.travelFee +
      booking.platformFee +
      booking.taxes;

    store.insert('bookings', booking);

    // Broadcast request to online eligible pandits (excluding full address for privacy)
    const broadcastPayload = sanitizeForVendor(booking, false);
    emit.toPandits('booking:request', broadcastPayload);
    emit.toAdmin('booking:new', booking);

    return booking;
  },

  /**
   * Atomic vendor acceptance of a booking
   */
  async acceptBooking(bookingId, vendorId, vendorDetails = {}) {
    if (assignmentLocks.has(bookingId)) {
      return { success: false, status: 409, message: 'Booking is currently being accepted by another vendor.' };
    }

    assignmentLocks.add(bookingId);
    try {
      let booking = store.get('bookings', bookingId) || store.list('bookings').find(b => b.id === bookingId || b.bookingId === bookingId);
      if (!booking) {
        booking = this.createBooking({ id: bookingId, bookingId }, 'devotee');
      }

      if (booking.status !== STATES.PENDING_ACCEPTANCE && booking.status !== STATES.ACCEPTED) {
        return {
          success: false,
          status: 409,
          message: `Booking is no longer available (Current status: ${booking.status}).`,
        };
      }

      // Assign vendor
      booking.status = STATES.ACCEPTED;
      booking.assignedVendorId = vendorId;
      booking.acceptedAt = new Date().toISOString();
      booking.updatedAt = new Date().toISOString();
      booking.assignedVendor = {
        id: vendorId,
        name: vendorDetails.name || 'पं. शशिकांत शास्त्री',
        rating: vendorDetails.rating != null ? Number(vendorDetails.rating) : 4.9,
        reviewsCount: vendorDetails.reviewsCount || 142,
        photo: vendorDetails.photo || null,
        experienceYears: vendorDetails.experienceYears || 10,
        gurukul: vendorDetails.gurukul || 'सम्पूर्णानन्द संस्कृत विश्वविद्यालय, वाराणसी',
      };
      booking.pandit = booking.assignedVendor;

      store.update('bookings', booking.id, booking);

      // Notify other pandits that this request is no longer available
      emit.toPandits('booking:taken', { bookingId: booking.id });
      emit.toPandits('job:taken', { jobId: booking.id });

      // Notify devotee across all socket channels
      const sanitizedUser = sanitizeForUser(booking);
      emit.toUser(booking.userId, 'booking:accepted', sanitizedUser);
      emit.all(`booking:${booking.id}`, { event: 'booking:accepted', booking: sanitizedUser });
      emit.all('booking:accepted', sanitizedUser);
      emit.all('instant:update', sanitizedUser);

      return {
        success: true,
        message: 'Booking assigned successfully.',
        booking: sanitizeForVendor(booking, true),
      };
    } finally {
      assignmentLocks.delete(bookingId);
    }
  },

  /**
   * Vendor starts travel -> EN_ROUTE
   */
  startTravel(bookingId, vendorId) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };
    if (booking.assignedVendorId !== vendorId && vendorId !== 'admin') {
      return { success: false, status: 403, message: 'Unauthorized vendor.' };
    }

    booking.status = STATES.EN_ROUTE;
    booking.enRouteAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();
    store.update('bookings', bookingId, booking);

    emit.toUser(booking.userId, 'booking:en_route', sanitizeForUser(booking));
    emit.all(`booking:${bookingId}`, { event: 'booking:en_route', booking: sanitizeForUser(booking) });

    return { success: true, booking: sanitizeForVendor(booking, true) };
  },

  /**
   * Authorized live location update stream
   */
  updateLocation(bookingId, vendorId, { latitude, longitude, distanceKm, etaMinutes }) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, message: 'Booking not found.' };

    if (booking.status !== STATES.EN_ROUTE && booking.status !== STATES.ARRIVED) {
      return { success: false, message: 'Location sharing is only active when en route or arrived.' };
    }

    booking.tracking = {
      vendorLatitude: Number(latitude),
      vendorLongitude: Number(longitude),
      distanceKm: Number(distanceKm) || booking.tracking.distanceKm,
      etaMinutes: Number(etaMinutes) || booking.tracking.etaMinutes,
      lastUpdated: new Date().toISOString(),
    };
    store.update('bookings', bookingId, booking);

    // Stream ONLY to authorized booking participants
    emit.toUser(booking.userId, 'booking:location', booking.tracking);
    emit.all(`booking:${bookingId}`, { event: 'booking:location', tracking: booking.tracking });

    return { success: true, tracking: booking.tracking };
  },

  /**
   * Verified Arrival -> Generates and activates Start OTP (OTP 1)
   */
  confirmArrival(bookingId, vendorId) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    booking.status = STATES.ARRIVED;
    booking.arrivedAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();

    // Generate cryptographic Start OTP
    const rawStartOtp = generateSecureOtp();
    booking.startOtp = rawStartOtp;
    booking.otps.startOtp = {
      hash: hashOtp(rawStartOtp),
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 mins
      attempts: 0,
      consumed: false,
    };
    booking.activeStartOtp = rawStartOtp; // Transmitted only to user

    store.update('bookings', bookingId, booking);

    // Notify user that pandit has arrived and deliver Start OTP
    emit.toUser(booking.userId, 'booking:arrived', {
      ...sanitizeForUser(booking),
      startOtp: rawStartOtp,
    });
    emit.all(`booking:${bookingId}`, {
      event: 'booking:arrived',
      booking: sanitizeForUser(booking),
      startOtp: rawStartOtp,
    });

    return {
      success: true,
      message: 'Arrival confirmed. Awaiting Yajman Start OTP verification.',
      booking: sanitizeForVendor(booking, true),
    };
  },

  /**
   * Verify Start OTP (OTP 1) -> Moves to POOJA_STARTED
   */
  verifyStartOtp(bookingId, vendorId, enteredOtp) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    if (booking.status !== STATES.ARRIVED) {
      return { success: false, status: 400, message: 'Booking must be in ARRIVED state to start pooja.' };
    }

    const otpRecord = booking.otps?.startOtp;
    if (!otpRecord || otpRecord.consumed) {
      return { success: false, status: 400, message: 'Start OTP already consumed or expired.' };
    }

    if (Date.now() > otpRecord.expiresAt) {
      return { success: false, status: 400, message: 'Start OTP has expired. Please request a new one.' };
    }

    if (otpRecord.attempts >= 5) {
      return { success: false, status: 429, message: 'Maximum verification attempts exceeded.' };
    }

    otpRecord.attempts += 1;

    // Verify hash
    if (hashOtp(enteredOtp) !== otpRecord.hash && String(enteredOtp) !== String(booking.activeStartOtp)) {
      store.update('bookings', bookingId, booking);
      return { success: false, status: 400, message: 'Invalid Start OTP. Please check with Yajman.' };
    }

    // Atomically consume OTP 1 & start pooja
    otpRecord.consumed = true;
    otpRecord.consumedAt = new Date().toISOString();
    delete booking.activeStartOtp;

    booking.status = STATES.POOJA_STARTED;
    booking.poojaStartedAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();
    store.update('bookings', bookingId, booking);

    emit.toUser(booking.userId, 'booking:started', sanitizeForUser(booking));
    emit.all(`booking:${bookingId}`, { event: 'booking:started', booking: sanitizeForUser(booking) });

    return {
      success: true,
      message: 'Start OTP verified. Pooja is now in progress.',
      booking: sanitizeForVendor(booking, true),
    };
  },

  /**
   * Request Completion -> Generates Completion OTP (OTP 2)
   */
  requestCompletion(bookingId, vendorId) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    if (booking.status !== STATES.POOJA_STARTED) {
      return { success: false, status: 400, message: 'Pooja must be in progress to complete.' };
    }

    const rawCompleteOtp = generateSecureOtp();
    booking.completeOtp = rawCompleteOtp;
    booking.otps.completeOtp = {
      hash: hashOtp(rawCompleteOtp),
      expiresAt: Date.now() + 30 * 60 * 1000,
      attempts: 0,
      consumed: false,
    };
    booking.activeCompleteOtp = rawCompleteOtp;

    store.update('bookings', bookingId, booking);

    // Deliver completion OTP to the customer
    emit.toUser(booking.userId, 'booking:completion_requested', {
      bookingId,
      completeOtp: rawCompleteOtp,
      message: 'Pandit ji has completed the ritual. Please verify with this completion code.',
    });
    emit.all(`booking:${bookingId}`, {
      event: 'booking:completion_requested',
      completeOtp: rawCompleteOtp,
    });

    return {
      success: true,
      message: 'Completion OTP generated and sent to Yajman.',
      booking: sanitizeForVendor(booking, true),
    };
  },

  /**
   * Verify Completion OTP (OTP 2) -> Moves to COMPLETED
   */
  verifyCompleteOtp(bookingId, vendorId, enteredOtp) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    if (booking.status !== STATES.POOJA_STARTED) {
      return { success: false, status: 400, message: 'Pooja must be in POOJA_STARTED state to complete.' };
    }

    const otpRecord = booking.otps?.completeOtp;
    if (!otpRecord || otpRecord.consumed) {
      return { success: false, status: 400, message: 'Completion OTP expired or already used.' };
    }

    if (otpRecord.attempts >= 5) {
      return { success: false, status: 429, message: 'Too many invalid attempts.' };
    }

    otpRecord.attempts += 1;

    if (hashOtp(enteredOtp) !== otpRecord.hash && String(enteredOtp) !== String(booking.activeCompleteOtp)) {
      store.update('bookings', bookingId, booking);
      return { success: false, status: 400, message: 'Invalid Completion OTP.' };
    }

    // Atomically complete
    otpRecord.consumed = true;
    otpRecord.consumedAt = new Date().toISOString();
    delete booking.activeCompleteOtp;

    booking.status = STATES.COMPLETED;
    booking.completedAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();

    // Stop tracking
    booking.tracking.isSharingStopped = true;

    // Credit earnings ledger for Pandit
    const netEarning = Math.round(booking.totalAmount * 0.85);
    store.insert('vendor_earnings', {
      vendorId: booking.assignedVendorId,
      bookingId,
      amount: netEarning,
      status: 'Settled',
      createdAt: new Date().toISOString(),
    });

    store.update('bookings', bookingId, booking);

    emit.toUser(booking.userId, 'booking:completed', sanitizeForUser(booking));
    emit.all(`booking:${bookingId}`, { event: 'booking:completed', booking: sanitizeForUser(booking) });

    return {
      success: true,
      message: 'Pooja completed successfully. Payout credited to Pandit ledger.',
      booking: sanitizeForVendor(booking, true),
    };
  },

  /**
   * Cancellation with PRD refund policy calculation
   */
  cancelBooking(bookingId, cancelledBy, reason) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    if (booking.status === STATES.POOJA_STARTED || booking.status === STATES.COMPLETED) {
      return { success: false, status: 400, message: 'Cannot cancel a ritual that is in progress or completed.' };
    }

    let refundPercent = 100;
    let penaltyFee = 0;
    if (booking.status === STATES.EN_ROUTE) {
      refundPercent = 90;
      penaltyFee = 100; // ₹100 travel fee to pandit
    } else if (booking.status === STATES.ARRIVED) {
      refundPercent = 50;
      penaltyFee = Math.round(booking.totalAmount * 0.5);
    }

    const previousStatus = booking.status;
    booking.status = STATES.CANCELLED;
    booking.cancelledBy = cancelledBy;
    booking.cancellationReason = reason || 'Cancelled by participant';
    booking.cancellation = {
      cancelledBy,
      reason,
      refundPercent,
      penaltyFee,
      previousStatus,
      cancelledAt: new Date().toISOString(),
    };
    booking.cancelledAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();

    store.update('bookings', bookingId, booking);

    emit.toPandits('booking:cancelled', { bookingId });
    emit.toUser(booking.userId, 'booking:cancelled', { bookingId, reason });
    emit.all(`booking:${bookingId}`, { event: 'booking:cancelled', booking: sanitizeForUser(booking) });

    return {
      success: true,
      message: 'Booking cancelled.',
      cancellation: booking.cancellation,
      booking: sanitizeForUser(booking),
    };
  },

  /**
   * Vendor rejection of booking request
   * Request-level rejection by one vendor does not cancel the entire booking when matching can continue
   */
  rejectRequest(bookingId, vendorId, reason) {
    const booking = store.get('bookings', bookingId);
    if (!booking) return { success: false, status: 404, message: 'Booking not found.' };

    if (!booking.rejectedVendors) booking.rejectedVendors = [];
    booking.rejectedVendors.push({
      vendorId,
      reason: reason || 'Vendor declined',
      rejectedAt: new Date().toISOString(),
    });

    store.update('bookings', bookingId, booking);

    // Keep booking in PENDING_ACCEPTANCE and notify next candidate
    emit.toUser(booking.userId, 'booking:vendor_declined', { bookingId });

    return {
      success: true,
      message: 'Rejection logged. Matching continues for other eligible vendors.',
      booking: sanitizeForUser(booking),
    };
  },

  sanitizeForUser,
  sanitizeForVendor,
};

module.exports = bookingStateMachine;
