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

function isSocketActive(io, socketId) {
  if (!socketId || !io?.sockets?.sockets?.get) return true;
  const s = io.sockets.sockets.get(socketId);
  return Boolean(s && s.connected !== false);
}

function getLiveAstrologers(io = ioRef) {
  const list = [];
  for (const [partnerId, partner] of activeAstroPartners.entries()) {
    if (!partner || partner.isOnline === false || !isSocketActive(io, partner.socketId)) {
      activeAstroPartners.delete(partnerId);
      continue;
    }
    list.push(partner);
  }
  return list;
}

function isRoomOccupied(io, roomName) {
  const room = io?.sockets?.adapter?.rooms?.get?.(roomName);
  return Boolean(room && room.size > 0);
}

function isSocketRoomActiveInRole(io, targetRoom, roleRoom) {
  const rooms = io?.sockets?.adapter?.rooms;
  if (!rooms?.get) return false;
  const targets = rooms.get(targetRoom);
  const roleMembers = rooms.get(roleRoom);
  if (!targets || !roleMembers) return false;
  for (const sid of targets) {
    if (roleMembers.has(sid)) return true;
  }
  return false;
}

function emitOnceToRooms(io, roomNames, event, payload, excludeSocketId = null) {
  const roomsMap = io?.sockets?.adapter?.rooms;
  if (roomsMap?.get) {
    const delivered = new Set();
    roomNames.filter(Boolean).forEach((room) => {
      const members = roomsMap.get(room);
      if (members) {
        for (const sid of members) {
          if (sid !== excludeSocketId && !delivered.has(sid)) {
            delivered.add(sid);
            io.to(sid).emit(event, payload);
          }
        }
      }
    });
    return delivered.size;
  }
  roomNames.filter(Boolean).forEach((room) => {
    io.to(room).emit(event, payload);
  });
  return roomNames.length;
}

function markAstroOffline(io, socket, partnerId) {
  const pid = partnerId ? String(partnerId) : socket.partnerAstroId;
  try {
    socket.leave?.('role:astro');
  } catch (_) {}
  if (pid && activeAstroPartners.has(pid)) {
    const p = activeAstroPartners.get(pid);
    activeAstroPartners.delete(pid);
    console.log(`🔌 [Live Socket] Astro Partner Went Offline: ${p?.name || pid} (${pid})`);
  }
  if (socket.partnerAstroId === pid) {
    socket.partnerAstroId = null;
  }
  if (pid) {
    io.emit('astro:offline', { id: pid, vendorId: pid, isOnline: false });
  }
  io.emit('astro:list', getLiveAstrologers(io));
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
    socket.emit('astro:list', getLiveAstrologers(io));

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
      if (socket.partnerAstroId && activeAstroPartners.has(socket.partnerAstroId)) {
        markAstroOffline(io, socket, socket.partnerAstroId);
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

    socket.on('user:join', ({ userId }) => {
      if (userId) {
        socket.join(`user:${userId}`);
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
    const USER_AGORA_UID = 10001;  // Devotee / User default UID
    const ASTRO_AGORA_UID = 20001; // Astrologer / Partner default UID

    socket.on('astro:call:initiate', (payload) => {
      const { channelName, recipientId, caller, mode } = payload || {};
      const requestedId = recipientId ? String(recipientId) : null;
      console.log(`📞 [Astro Consultation] Initiating ${mode} from ${caller?.name} -> target=${requestedId || 'AUTO'} on channel ${channelName}`);

      if (caller?.id) {
        socket.join(`user:${caller.id}`);
      }
      if (channelName) {
        socket.join(`channel:${channelName}`);
      }

      let userAgoraData = null;
      let astroAgoraData = null;
      try {
        if (channelName) {
          userAgoraData = generateRtcToken({ channelName, uid: USER_AGORA_UID, role: 'publisher' });
          astroAgoraData = generateRtcToken({ channelName, uid: ASTRO_AGORA_UID, role: 'publisher' });
        }
      } catch (err) {
        console.warn('⚠️ Agora token generation error in astro:call:initiate:', err.message);
      }

      // Immediately provide the caller with their own UID 10001 token so caller joins Agora without delay
      if (userAgoraData && userAgoraData.token) {
        const callerReadyNotice = {
          channelName,
          agoraAppId: userAgoraData.appId,
          agoraToken: userAgoraData.token,
          agoraMode: userAgoraData.mode,
          uid: USER_AGORA_UID,
          remoteUid: ASTRO_AGORA_UID,
          userUid: USER_AGORA_UID,
          astroUid: ASTRO_AGORA_UID,
        };
        socket.emit('astro:call:ready', callerReadyNotice);
        if (caller?.id) {
          io.to(`user:${caller.id}`).emit('astro:call:ready', callerReadyNotice);
        }
      }

      let enrichedPayload = {
        ...payload,
        agoraAppId: astroAgoraData?.appId || userAgoraData?.appId,
        agoraToken: astroAgoraData?.token, // Token explicitly signed for Astrologer (UID 20001)
        agoraMode: astroAgoraData?.mode,
        uid: ASTRO_AGORA_UID,
        remoteUid: USER_AGORA_UID,
        userUid: USER_AGORA_UID,
        astroUid: ASTRO_AGORA_UID,
        userAgoraToken: userAgoraData?.token,
      };

      const liveList = getLiveAstrologers(io);
      const exactOnlineAstro = requestedId
        ? liveList.find((p) => String(p.id) === requestedId || String(p.vendorId) === requestedId)
        : null;
      const isDirectAstroRoom = requestedId
        ? isSocketRoomActiveInRole(io, `vendor:${requestedId}`, 'role:astro') ||
          isSocketRoomActiveInRole(io, `pandit:${requestedId}`, 'role:astro')
        : false;

      if (exactOnlineAstro || isDirectAstroRoom) {
        emitOnceToRooms(
          io,
          [`vendor:${requestedId}`, `pandit:${requestedId}`, `user:${requestedId}`, exactOnlineAstro?.socketId],
          'astro:call:incoming',
          {
            ...enrichedPayload,
            recipientId: requestedId,
            routedAstrologer: exactOnlineAstro || undefined,
          }
        );
        return;
      }

      // Requested astrologer is offline or not visible -> automatically route to any online astrologer
      const modeKey = mode === 'chat' ? 'chatOnline' : mode === 'audio' ? 'audioOnline' : 'videoOnline';
      const fallbackAstro =
        liveList.find((p) => !p.presence || p.presence[modeKey] !== false) || liveList[0] || null;

      if (fallbackAstro) {
        const routedPayload = {
          ...enrichedPayload,
          recipientId: fallbackAstro.id,
          originalRecipientId: requestedId,
          isFallbackRouted: true,
          routedAstrologer: {
            id: fallbackAstro.id,
            name: fallbackAstro.name,
            nameHi: fallbackAstro.nameHi,
            title: fallbackAstro.title,
            rates: fallbackAstro.rates,
          },
        };
        console.log(
          `🔁 [Smart Astro Routing] Requested=${requestedId || 'none'} unavailable -> routing to online partner ${fallbackAstro.name} (${fallbackAstro.id})`
        );
        emitOnceToRooms(
          io,
          ['role:astro', `vendor:${fallbackAstro.id}`, `pandit:${fallbackAstro.id}`, fallbackAstro.socketId],
          'astro:call:incoming',
          routedPayload
        );
        const routeNotice = {
          channelName,
          originalRecipientId: requestedId,
          recipientId: fallbackAstro.id,
          astrologer: routedPayload.routedAstrologer,
        };
        socket.emit('astro:call:routed', routeNotice);
        if (caller?.id) {
          io.to(`user:${caller.id}`).emit('astro:call:routed', routeNotice);
        }
        return;
      }

      // Check if any socket is sitting in role:astro without cached entry
      if (isRoomOccupied(io, 'role:astro')) {
        io.to('role:astro').emit('astro:call:incoming', enrichedPayload);
        return;
      }

      console.log(`⚠️ [Astro Consultation] No online astrologer available for channel ${channelName}`);
      const unavailablePayload = {
        channelName,
        recipientId: requestedId,
        message: 'वर्तमान में कोई भी ज्योतिषी ऑनलाइन उपलब्ध नहीं है।',
      };
      socket.emit('astro:call:unavailable', unavailablePayload);
      if (caller?.id) {
        io.to(`user:${caller.id}`).emit('astro:call:unavailable', unavailablePayload);
      }
    });

    socket.on('astro:call:accept', (payload) => {
      const { channelName, callerId, vendorId, sessionId } = payload || {};
      const responderId = vendorId || socket.partnerAstroId;
      console.log(`✅ [Astro Consultation] Accepted for channel ${channelName} by ${responderId || 'astro'}`);

      if (channelName) {
        socket.join(`channel:${channelName}`);
      }
      if (sessionId) {
        socket.join(`session:${sessionId}`);
      }

      const matchedPartner = responderId ? activeAstroPartners.get(String(responderId)) : null;

      let userAgoraData = null;
      let astroAgoraData = null;
      try {
        if (channelName) {
          userAgoraData = generateRtcToken({ channelName, uid: USER_AGORA_UID, role: 'publisher' });
          astroAgoraData = generateRtcToken({ channelName, uid: ASTRO_AGORA_UID, role: 'publisher' });
        }
      } catch (err) {
        console.warn('⚠️ Agora token generation error in astro:call:accept:', err.message);
      }

      // Caller payload gets User token (UID 10001)
      const callerPayload = {
        ...payload,
        vendorId: responderId,
        astrologer: payload?.astrologer || matchedPartner || undefined,
        agoraAppId: userAgoraData?.appId,
        agoraToken: userAgoraData?.token,
        agoraMode: userAgoraData?.mode,
        uid: USER_AGORA_UID,
        remoteUid: ASTRO_AGORA_UID,
        userUid: USER_AGORA_UID,
        astroUid: ASTRO_AGORA_UID,
      };

      // Astrologer payload gets Astrologer token (UID 20001)
      const astroPayload = {
        ...payload,
        vendorId: responderId,
        astrologer: payload?.astrologer || matchedPartner || undefined,
        agoraAppId: astroAgoraData?.appId,
        agoraToken: astroAgoraData?.token,
        agoraMode: astroAgoraData?.mode,
        uid: ASTRO_AGORA_UID,
        remoteUid: USER_AGORA_UID,
        userUid: USER_AGORA_UID,
        astroUid: ASTRO_AGORA_UID,
      };

      // 1. Deliver user token directly to caller's private room
      if (callerId) {
        io.to(`user:${callerId}`).emit('astro:call:connected', callerPayload);
      }

      // 2. Deliver to any other sockets in channel:channelName (excluding this socket)
      if (channelName) {
        socket.to(`channel:${channelName}`).emit('astro:call:connected', callerPayload);
      }

      // 3. Deliver astro token directly to the responding Astrologer socket
      socket.emit('astro:call:connected', astroPayload);

      // 4. Dismiss ringing popup on any other online astrologers
      if (channelName) {
        socket.to('role:astro').emit('astro:call:taken', { channelName, acceptedBy: responderId });
      }
    });

    socket.on('astro:call:decline', (payload) => {
      const { callerId, channelName } = payload || {};
      const targetRooms = [];
      if (channelName) targetRooms.push(`channel:${channelName}`);
      if (callerId) targetRooms.push(`user:${callerId}`);
      if (targetRooms.length > 0) {
        emitOnceToRooms(io, targetRooms, 'astro:call:declined', payload);
      } else {
        io.emit('astro:call:declined', payload);
      }
    });

    socket.on('astro:call:end', (payload) => {
      const { callerId, recipientId, vendorId, channelName, sessionId, durationSeconds, ratePerMinute, mode } = payload || {};
      const targetVendor = vendorId || recipientId;
      const secs = Number(durationSeconds || 0);
      if (targetVendor && secs > 0) {
        try {
          const store = require('./store');
          const key = sessionId || channelName;
          const dup = key
            ? store.list('vendor_earnings').find((e) => String(e.vendorId) === String(targetVendor) && String(e.sessionId) === String(key))
            : null;
          if (!dup) {
            const billedMins = Math.max(1, Math.ceil(secs / 60));
            const gross = billedMins * Number(ratePerMinute || 5);
            const net = Math.round(gross * 0.85 * 100) / 100;
            const rec = store.insert('vendor_earnings', {
              vendorId: String(targetVendor),
              sessionId: key || undefined,
              title: `Astro ${mode || 'Consultation'} (${billedMins} min)`,
              amount: net,
              status: 'Settled',
              createdAt: new Date().toISOString(),
            });
            const v = store.get('vendors', String(targetVendor));
            if (v) {
              const nextBal = Number(v.walletBalance || 0) + net;
              const nextTotal = Number(v.totalEarned || 0) + net;
              store.update('vendors', v.id, { walletBalance: nextBal, totalEarned: nextTotal });
              io.to(`vendor:${v.id}`).emit('earnings:updated', {
                vendorId: v.id,
                walletBalance: nextBal,
                totalEarned: nextTotal,
                netEarning: net,
                transaction: rec,
              });
            }
          }
        } catch (err) {
          console.warn('⚠️ Astro live earning record notice:', err.message);
        }
      }

      const targetRooms = [];
      if (channelName) targetRooms.push(`channel:${channelName}`);
      if (callerId) targetRooms.push(`user:${callerId}`);
      if (recipientId) targetRooms.push(`vendor:${recipientId}`, `pandit:${recipientId}`);
      if (targetRooms.length > 0) {
        emitOnceToRooms(io, targetRooms, 'astro:call:ended', payload);
      } else {
        io.emit('astro:call:ended', payload);
      }
    });

    socket.on('astro:chat:send', (payload) => {
      const { sessionId, channelName, recipientId } = payload || {};
      if (channelName) socket.join(`channel:${channelName}`);
      if (sessionId) socket.join(`session:${sessionId}`);

      const targetRooms = [];
      if (channelName) targetRooms.push(`channel:${channelName}`);
      if (sessionId) targetRooms.push(`session:${sessionId}`);
      if (recipientId) {
        targetRooms.push(`user:${recipientId}`, `vendor:${recipientId}`, `pandit:${recipientId}`);
      }
      if (targetRooms.length > 0) {
        emitOnceToRooms(io, targetRooms, 'astro:chat:message', payload, socket.id);
      } else {
        socket.broadcast.emit('astro:chat:message', payload);
      }
    });

    const registerOrUpdateAstroPartner = (data, defaultOnline = true) => {
      const partnerId = String(data?.id || data?.vendorId || socket.partnerAstroId || id || socket.id);
      const isOnlineFlag = data?.isOnline !== undefined ? data.isOnline !== false : defaultOnline;
      if (!isOnlineFlag) {
        markAstroOffline(io, socket, partnerId);
        return;
      }

      const existing = activeAstroPartners.get(partnerId) || {};
      const mergedRates = {
        chat: Number(data?.rates?.chat ?? data?.chatRate ?? existing?.rates?.chat ?? 5),
        audio: Number(data?.rates?.audio ?? data?.audioRate ?? existing?.rates?.audio ?? 5),
        video: Number(data?.rates?.video ?? data?.videoRate ?? existing?.rates?.video ?? 5),
      };
      const astro = {
        ...existing,
        ...data,
        id: partnerId,
        vendorId: partnerId,
        name: data?.name || existing.name || 'पंडित जी (Live Partner)',
        nameHi: data?.nameHi || data?.name || existing.nameHi || existing.name || 'पंडित जी (Live Partner)',
        title: data?.title || existing.title || 'सत्यापित वैदिक ज्योतिषी • पार्टनर ऐप लाइव',
        photo: data?.photo || existing.photo || 'pandit_varanasi',
        rating: Number(data?.rating ?? existing.rating ?? 0),
        reviewsCount: Number(data?.reviewsCount ?? existing.reviewsCount ?? 0),
        experienceYears: Number(data?.experienceYears ?? existing.experienceYears ?? 0),
        skills: Array.isArray(data?.skills) && data.skills.length
          ? data.skills
          : existing.skills || ['Vedic', 'KP Astrology', 'Kundli', 'Numerology'],
        languages: Array.isArray(data?.languages)
          ? data.languages
          : existing.languages || ['हिंदी', 'संस्कृत', 'English'],
        chatRate: mergedRates.chat,
        audioRate: mergedRates.audio,
        videoRate: mergedRates.video,
        rates: mergedRates,
        isOnline: true,
        ordersCompleted: Number(data?.ordersCompleted ?? existing.ordersCompleted ?? 0),
        totalMinutes: Number(data?.totalMinutes ?? existing.totalMinutes ?? 0),
        bio: data?.bio || existing.bio || 'वैदिक संस्कार पार्टनर ऐप से सीधे लाइव कनेक्टेड ज्योतिषी।',
        socketId: socket.id,
        connectedAt: existing.connectedAt || Date.now(),
      };
      activeAstroPartners.set(partnerId, astro);
      socket.partnerAstroId = partnerId;
      socket.join('role:astro');
      socket.join(`vendor:${partnerId}`);
      socket.join(`pandit:${partnerId}`);

      console.log(`🌟 [Live Socket] Astro Partner Online: ${astro.name} (${partnerId})`);
      io.emit('astro:online', astro);
      io.emit('astro:presence', astro);
      io.emit('astro:list', getLiveAstrologers(io));
    };

    socket.on('astro:online', (data) => {
      registerOrUpdateAstroPartner(data, true);
    });

    socket.on('astro:presence', (data) => {
      registerOrUpdateAstroPartner(data, data?.isOnline !== false);
    });

    socket.on('astro:offline', (data) => {
      const partnerId = data?.id || data?.vendorId || socket.partnerAstroId || id;
      markAstroOffline(io, socket, partnerId);
    });

    socket.on('astro:get:online', () => {
      socket.emit('astro:list', getLiveAstrologers(io));
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
        try {
          store.update('bookings', bookingId, {
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
          });
        } catch (e) {}
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
