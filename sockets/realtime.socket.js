// **
//  * realtime.socket.js
//  * Handles all WebSocket events for real-time sensor ingestion,
//  * position updates, proximity scanning, and alert broadcasting.
//  *
//  * ── Event Flow ─────────────────────────────────────────────────────────────
//  *  Client → server:
//  *    'sensor:update'   - send raw sensor packet
//  *    'register'        - announce deviceId and role (base station or mobile)
//  *
//  *  Server → client(s):
//  *    'position:update' - broadcast updated position map to all clients
//  *    'alert'           - send collision / proximity / speed alert
//  *    'device:list'     - current list of active devices
//  */

const { fuseSensors, clearDevice }       = require('../services/sensorFusion.service');
const { updateDevicePosition, getActiveDevices, removeDevice } = require('../services/positioning.service');
const { scanProximity }                   = require('../services/proximity.service');
const { buildProximityAlerts, buildSpeedAlert } = require('../services/alert.service');

/**
 * Initialize Socket.IO event handlers.
 * @param {import('socket.io').Server} io
 */
function initRealtimeSocket(io) {

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // ── Register device ──────────────────────────────────────────────────────
    socket.on('register', ({ deviceId, isBaseStation }) => {
      socket.deviceId = deviceId;
      socket.join(`device:${deviceId}`);  // personal room for targeted messages
      console.log(`[WS] Registered: ${deviceId} (baseStation=${isBaseStation})`);
      socket.emit('registered', { deviceId, message: 'Device registered successfully.' });
    });

    // ── Ingest sensor data ───────────────────────────────────────────────────
    socket.on('sensor:update', (payload) => {
      /*
       * Expected payload shape (sample JSON in README):
       * {
       *   deviceId: 'device-001',
       *   timestamp: 1700000000000,
       *   accelerometer:  { x, y, z },
       *   gyroscope:      { x, y, z },
       *   magnetometer:   { x, y, z },
       *   gps:            { lat, lng, accuracy } | null,
       *   isBaseStation:  false,
       *   rssiBeacons: [{ deviceId, rssi, position: { x, y } }]
       * }
       */

      const { deviceId } = payload;
      if (!deviceId) return;

      // 1. Fuse sensor streams into unified motion state
      const fusedState = fuseSensors(deviceId, payload);

      // 2. Update device position (dead reckoning or GPS fallback)
      const deviceState = updateDevicePosition(deviceId, payload, fusedState);

      // 3. Broadcast updated position to ALL connected clients
      io.emit('position:update', {
        deviceId,
        lat:           deviceState.lat,
        lng:           deviceState.lng,
        heading:       deviceState.heading,
        speedMps:      deviceState.speedMps,
        confidence:    deviceState.confidence,
        indoorPos:     deviceState.indoorPosition,
        isBaseStation: deviceState.isBaseStation,
        timestamp:     deviceState.lastUpdate,
      });

      // 4. Scan for proximity issues and emit alerts
      const proximityEvents = scanProximity();
      const proximityAlerts = buildProximityAlerts(proximityEvents);

      for (const alert of proximityAlerts) {
        io.emit('alert', alert);
        console.warn(`[ALERT] ${alert.message}`);
      }

      // 5. Speed check alert for THIS device
      const speedAlert = buildSpeedAlert(deviceState);
      if (speedAlert) {
        io.emit('alert', speedAlert);
        console.warn(`[ALERT] ${speedAlert.message}`);
      }
    });

    // ── Request current device list ──────────────────────────────────────────
    socket.on('device:list:request', () => {
      socket.emit('device:list', getActiveDevices());
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const deviceId = socket.deviceId;
      if (deviceId) {
        removeDevice(deviceId);
        clearDevice(deviceId);
        io.emit('device:left', { deviceId });
        console.log(`[WS] Device disconnected & removed: ${deviceId}`);
      }
    });
  });
}

module.exports = initRealtimeSocket;
