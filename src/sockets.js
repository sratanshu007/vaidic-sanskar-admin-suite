/**
 * Socket.IO real-time layer shared by User & Partner apps.
 *
 * Rooms:
 *   user:<id>         personal customer channel
 *   vendor:<id>       personal vendor channel
 *   role:pandit       broadcast pool for eligible pandits
 *   booking:<id>      authenticated real-time room for authorized tracking & lifecycle
 *   admin             admins watching live operations
 */
let ioRef = null;
const activeAstroPartners = new Map();
const { generateRtcToken } = require('./services/agoraService');

function getLiveAstrologers() {
  return Array.from(activeAstroPartners.values());
}

function initSockets(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    const query = socket.handshake.query || {};
    const auth = socket.handshake.auth || {};
    const role = query.role || auth.role || (auth.user && auth.user.role) || 'pandit';
    const id = query.id || auth.userId || (auth.user && auth.user.id) || socket.id;

    console.log(`🔌 [Socket.IO] Client connected: ${socket.id} (role: ${role}, id: ${id})`);

    if (role === 'admin') socket.join('admin');
    if (role && id) {
      socket.join(`${role}:${id}`);
      socket.join(`user:${id}`);
      if (role === 'pandit' || role === 'vendor') {
        socket.join('role:pandit');
        socket.join(`vendor:${id}`);
        socket.join(`pandit:${id}`);
      }
    } else {
      socket.join('role:pandit');
    }

    // Always notify client of successful socket connection
    socket.emit('socket:connected', {
      success: true,
      socketId: socket.id,
      userId: id,
      role,
    });
    // Immediately send current live astrologers to the newly connected client
    socket.emit('astro:list', Array.from(activeAstroPartners.values()));

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
      if (socket.partnerAstroId && activeAstroPartners.has(socket.partnerAstroId)) {
        const p = activeAstroPartners.get(socket.partnerAstroId);
        activeAstroPartners.delete(socket.partnerAstroId);
        console.log(`🔌 [Live Socket] Partner Went Offline: ${p?.name} (${socket.partnerAstroId})`);
        io.emit('astro:offline', { id: socket.partnerAstroId, isOnline: false });
        io.emit('astro:list', Array.from(activeAstroPartners.values()));
      }
    });

    socket.on('ping', () => {
      socket.emit('pong', { success: true, timestamp: Date.now() });
    });

    socket.on('presence:heartbeat', () => {
      socket.emit('presence:heartbeat', { success: true, userId: id, timestamp: Date.now() });
    });

    // Join authorized booking tracking room (support both subscribe:booking and booking:join)
    socket.on('booking:join', ({ bookingId }) => {
      if (bookingId) {
        socket.join(`booking:${bookingId}`);
      }
    });

    socket.on('subscribe:booking', ({ bookingId }) => {
      if (bookingId) {
        socket.join(`booking:${bookingId}`);
      }
    });

    socket.on('pandit:join', ({ vendorId }) => {
      socket.join('role:pandit');
      if (vendorId) {
        socket.join(`vendor:${vendorId}`);
        socket.join(`pandit:${vendorId}`);
      }
    });

    socket.on('booking:leave', ({ bookingId }) => {
      if (bookingId) {
        socket.leave(`booking:${bookingId}`);
      }
    });

    // Vendor online toggle
    socket.on('vendor:online', ({ vendorId, online }) => {
      io.to('admin').emit('vendor:status', { vendorId, online });
    });

    // Live location stream during active booking (EN_ROUTE / ARRIVED)
    socket.on('vendor:location', ({ bookingId, vendorId, latitude, longitude, distanceKm, etaMinutes }) => {
      if (!bookingId) return;
      const tracking = {
        bookingId,
        vendorLatitude: Number(latitude),
        vendorLongitude: Number(longitude),
        distanceKm: distanceKm != null ? Number(distanceKm) : undefined,
        etaMinutes: etaMinutes != null ? Number(etaMinutes) : undefined,
        lastUpdated: new Date().toISOString(),
      };
      // Broadcast to authorized room and global channels
      io.to(`booking:${bookingId}`).emit('booking:location', tracking);
      io.to(`booking:${bookingId}`).emit('tracking:update', tracking);
      io.emit('booking:location', tracking);
      io.emit('tracking:update', tracking);
    });

    // 1-on-1 masked chat relay
    socket.on('chat:message', ({ to, from, text, bookingId }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('chat:message', { from, text, at: Date.now() });
      } else if (to) {
        io.to(to).emit('chat:message', { from, text, at: Date.now() });
      }
    });

    // ---------------- ASTROLOGER AGORA CALL & CHAT SIGNALING ----------------
    socket.on('astro:call:initiate', (payload) => {
      const { channelName, recipientId, caller, mode } = payload || {};
      console.log(`📞 [Astro Consultation] Initiating ${mode} from ${caller?.name} on channel ${channelName}`);
      
      let enrichedPayload = { ...payload };
      try {
        if (channelName) {
          const agoraData = generateRtcToken({ channelName, role: 'publisher' });
          enrichedPayload = {
            ...payload,
            agoraAppId: agoraData.appId,
            agoraToken: agoraData.token,
            agoraMode: agoraData.mode,
          };
        }
      } catch (err) {
        console.warn('⚠️ Agora token generation error in astro:call:initiate:', err.message);
      }

      if (recipientId) {
        io.to(`vendor:${recipientId}`).emit('astro:call:incoming', enrichedPayload);
        io.to(`pandit:${recipientId}`).emit('astro:call:incoming', enrichedPayload);
        io.to(`user:${recipientId}`).emit('astro:call:incoming', enrichedPayload);
      } else {
        io.emit('astro:call:incoming', enrichedPayload);
      }
    });

    socket.on('astro:call:accept', (payload) => {
      const { channelName, callerId } = payload || {};
      console.log(`✅ [Astro Consultation] Accepted for channel ${channelName}`);

      let enrichedPayload = { ...payload };
      try {
        if (channelName) {
          const agoraData = generateRtcToken({ channelName, role: 'publisher' });
          enrichedPayload = {
            ...payload,
            agoraAppId: agoraData.appId,
            agoraToken: agoraData.token,
            agoraMode: agoraData.mode,
          };
        }
      } catch (err) {
        console.warn('⚠️ Agora token generation error in astro:call:accept:', err.message);
      }

      if (callerId) {
        io.to(`user:${callerId}`).emit('astro:call:connected', enrichedPayload);
      } else {
        io.emit('astro:call:connected', enrichedPayload);
      }
    });

    socket.on('astro:call:decline', (payload) => {
      const { callerId } = payload || {};
      if (callerId) {
        io.to(`user:${callerId}`).emit('astro:call:declined', payload);
      } else {
        io.emit('astro:call:declined', payload);
      }
    });

    socket.on('astro:call:end', (payload) => {
      const { callerId, recipientId } = payload || {};
      if (callerId) io.to(`user:${callerId}`).emit('astro:call:ended', payload);
      if (recipientId) io.to(`vendor:${recipientId}`).emit('astro:call:ended', payload);
      io.emit('astro:call:ended', payload);
    });

    socket.on('astro:chat:send', (payload) => {
      const { sessionId, recipientId } = payload || {};
      if (recipientId) {
        io.to(`user:${recipientId}`).emit('astro:chat:message', payload);
        io.to(`vendor:${recipientId}`).emit('astro:chat:message', payload);
      } else if (sessionId) {
        io.to(`session:${sessionId}`).emit('astro:chat:message', payload);
      } else {
        io.emit('astro:chat:message', payload);
      }
    });

    socket.on('astro:online', (data) => {
      const partnerId = String(data?.id || data?.vendorId || id || socket.id);
      const astro = {
        id: partnerId,
        vendorId: partnerId,
        name: data?.name || 'पंडित जी (Live Partner)',
        nameHi: data?.nameHi || data?.name || 'पंडित जी (Live Partner)',
        title: data?.title || 'सत्यापित वैदिक ज्योतिषी • पार्टनर ऐप लाइव',
        photo: data?.photo || 'pandit_varanasi',
        rating: Number(data?.rating || 5.0),
        reviewsCount: Number(data?.reviewsCount || 160),
        experienceYears: Number(data?.experienceYears || 15),
        skills: Array.isArray(data?.skills) && data.skills.length ? data.skills : ['Vedic', 'KP Astrology', 'Kundli', 'Numerology'],
        languages: Array.isArray(data?.languages) ? data.languages : ['हिंदी', 'संस्कृत', 'English'],
        chatRate: Number(data?.rates?.chat || data?.chatRate || 5),
        audioRate: Number(data?.rates?.audio || data?.audioRate || 5),
        videoRate: Number(data?.rates?.video || data?.videoRate || 5),
        rates: {
          chat: Number(data?.rates?.chat || 5),
          audio: Number(data?.rates?.audio || 5),
          video: Number(data?.rates?.video || 5),
        },
        isOnline: data?.isOnline !== false,
        ordersCompleted: 620,
        totalMinutes: 7400,
        bio: data?.bio || 'वैदिक संस्कार पार्टनर ऐप से सीधे लाइव कनेक्टेड ज्योतिषी।',
        socketId: socket.id,
        connectedAt: Date.now(),
      };
      activeAstroPartners.set(partnerId, astro);
      socket.partnerAstroId = partnerId;

      console.log(`🌟 [Live Socket] Partner Online Registered: ${astro.name} (${partnerId})`);
      io.emit('astro:online', astro);
      io.emit('astro:presence', astro);
      io.emit('astro:list', Array.from(activeAstroPartners.values()));
    });

    socket.on('astro:presence', (data) => {
      const partnerId = String(data?.id || data?.vendorId || socket.partnerAstroId || id);
      const existing = activeAstroPartners.get(partnerId) || {};
      const updated = {
        ...existing,
        ...data,
        id: partnerId,
        isOnline: data?.isOnline !== false,
      };
      activeAstroPartners.set(partnerId, updated);
      console.log(`🌟 [Live Socket] Astrologer Presence Updated: ${updated.name || partnerId} (${updated.isOnline ? 'ONLINE' : 'OFFLINE'})`);
      io.emit('astro:presence', updated);
      io.emit('astro:online', updated);
      io.emit('astro:list', Array.from(activeAstroPartners.values()));
    });

    socket.on('astro:get:online', () => {
      socket.emit('astro:list', Array.from(activeAstroPartners.values()));
    });

    // Pandit accepts broadcast
    socket.on('job:accept', async (data) => {
      try {
        const jobId = data?.jobId || data?.job_id || data?.bookingId || data?.id;
        const vendorId = data?.vendorId || data?.assignedVendorId || data?.pandit?.id;
        const vendorDetails = data?.vendorDetails || data?.pandit || data?.vendor || {};
        if (jobId) {
          const bookingStateMachine = require('./services/bookingStateMachine');
          const res = await bookingStateMachine.acceptBooking(jobId, vendorId, vendorDetails);
          if (res.success) {
            io.to('role:pandit').emit('job:taken', { jobId });
            io.to('role:pandit').emit('booking:taken', { bookingId: jobId });
            io.to('admin').emit('job:update', { jobId, status: 'Accepted', vendorId });
          }
        }
      } catch (err) {
        console.error('Socket job:accept error:', err);
      }
    });

    // Real-time booking acceptance relay from Partner app to User app
    socket.on('booking:accepted', (data) => {
      const bId = data?.bookingId || data?.id || data?.job_id || data?.requestId;
      if (bId) {
        io.to(`booking:${bId}`).emit('booking:accepted', data);
        io.to(`booking:${bId}`).emit('instant:update', data);
        io.emit('booking:accepted', data);
        io.emit('instant:update', data);
        io.to('role:pandit').emit('booking:taken', { bookingId: bId });
        io.to('role:pandit').emit('job:taken', { jobId: bId });
      }
    });

    // Devotee searching: broadcast incoming puja request to all eligible online pandits
    const handlePujaRequest = (jobData) => {
      if (!jobData) return;
      const bId = jobData.id || jobData.bookingId || jobData.requestId;
      if (bId) {
        socket.join(`booking:${bId}`);
      }
      io.to('role:pandit').emit('booking:request', jobData);
      io.to('role:pandit').emit('job:broadcast', jobData);
      io.to('role:pandit').emit('job:new', jobData);
      io.to('role:pandit').emit('instant:request', jobData);
      io.to('role:pandit').emit('instant:new', jobData);
      io.emit('booking:request', jobData);
      io.to('admin').emit('booking:new', jobData);
    };

    socket.on('booking:request', handlePujaRequest);
    socket.on('job:broadcast', handlePujaRequest);
    socket.on('job:new', handlePujaRequest);
    socket.on('instant:request', handlePujaRequest);
    socket.on('instant:new', handlePujaRequest);

    // Pandit declines / rejects request
    socket.on('job:decline', ({ job_id, bookingId, reason }) => {
      const bId = bookingId || job_id;
      io.to('admin').emit('job:declined', { bookingId: bId, reason });
    });
    socket.on('booking:reject', ({ bookingId, reason }) => {
      io.to('admin').emit('job:declined', { bookingId, reason });
    });

    // En Route state relay
    socket.on('booking:en_route', ({ bookingId }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('booking:en_route', { bookingId, status: 'EN_ROUTE' });
        io.emit('booking:en_route', { bookingId, status: 'EN_ROUTE' });
        io.emit('instant:update', { id: bookingId, status: 'EN_ROUTE' });
      }
    });

    // Arrived state relay
    socket.on('booking:arrived', ({ bookingId }) => {
      if (bookingId) {
        const bookingStateMachine = require('./services/bookingStateMachine');
        try {
          bookingStateMachine.confirmArrival(bookingId, 'vendor');
        } catch (_) { }
        io.to(`booking:${bookingId}`).emit('booking:arrived', { bookingId, status: 'ARRIVED' });
        io.emit('booking:arrived', { bookingId, status: 'ARRIVED' });
        io.emit('instant:update', { id: bookingId, status: 'ARRIVED' });
      }
    });

    // Start OTP verified -> Pooja In Progress state relay
    socket.on('booking:pooja_started', ({ bookingId }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('booking:pooja_started', { bookingId, status: 'POOJA_STARTED' });
        io.emit('booking:pooja_started', { bookingId, status: 'POOJA_STARTED' });
        io.emit('instant:update', { id: bookingId, status: 'IN_PROGRESS' });
      }
    });

    // Complete OTP verified -> Pooja Completed state relay
    socket.on('booking:completed', ({ bookingId }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('booking:completed', { bookingId, status: 'COMPLETED' });
        io.emit('booking:completed', { bookingId, status: 'COMPLETED' });
        io.emit('instant:update', { id: bookingId, status: 'COMPLETED' });
      }
    });

    // Booking cancelled
    socket.on('booking:cancelled', ({ bookingId, reason }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('booking:cancelled', { bookingId, reason });
        io.to('role:pandit').emit('booking:cancelled', { bookingId, reason });
        io.emit('booking:cancelled', { bookingId, reason });
      }
    });
  });
}

// Helpers routes can call to push events
const emit = {
  toUser: (id, ev, data) => ioRef?.to(`user:${id}`).emit(ev, data),
  toVendor: (id, ev, data) => ioRef?.to(`vendor:${id}`).emit(ev, data),
  toPandits: (ev, data) => {
    ioRef?.to('role:pandit').emit(ev, data);
    ioRef?.emit(ev, data);
    if (ev === 'booking:request') {
      ioRef?.emit('job:new', data);
    }
  },
  toBooking: (bookingId, ev, data) => {
    ioRef?.to(`booking:${bookingId}`).emit(ev, data);
    ioRef?.emit(ev, data);
  },
  toAdmin: (ev, data) => ioRef?.to('admin').emit(ev, data),
  all: (roomOrEv, evOrData, maybeData) => {
    if (maybeData !== undefined) {
      ioRef?.to(roomOrEv).emit(evOrData, maybeData);
      ioRef?.emit(evOrData, maybeData);
    } else if (evOrData && typeof evOrData === 'object' && evOrData.event) {
      const room = roomOrEv;
      const eventName = evOrData.event;
      const payload = {
        ...(typeof (evOrData.booking || evOrData.tracking) === 'object' ? (evOrData.booking || evOrData.tracking) : {}),
        ...evOrData,
      };
      ioRef?.to(room).emit(eventName, payload);
      ioRef?.emit(eventName, payload);
    } else {
      ioRef?.emit(roomOrEv, evOrData);
    }
  },
};

module.exports = { initSockets, emit, getLiveAstrologers };
